import { AstNode, CstUtils, URI } from "langium";
import { LangiumServices } from "langium/lsp";
import { AstUtils } from 'langium';

interface SplitterOptions {
    /**
     * List of comment rule names to include in the chunk.
     * If not provided comments are ignored.
     * Default: ['ML_COMMENT', 'SL_COMMENT']
    */
    commentRuleNames?: string[]
}

/**
 * Splitter function that splits a single text document into 1 or more chunks based on a splitting strategy
 * @param document - The text document to be split.
 * @param nodePredicates - The predicates to determine the nodes for splitting.
 * @param services - The Langium services used for parsing the document.
 * @param options - The splitter configuration. See {@link SplitterOptions}.
 * @returns The chunks of the split document.
 */
export function splitByNode(
    document: string,
    nodePredicates: Array<(node: AstNode) => boolean> | ((node: AstNode) => boolean),
    services: LangiumServices,
    options: SplitterOptions = { commentRuleNames: ['ML_COMMENT', 'SL_COMMENT'] }): string[] {
    // 1. parse the document into an AST
    // 2. verify that we parsed the document correctly
    // 3. split the document into chunks based on the node
    // 4. using the corresponding CST offsets from those nodes, split the document into chunks
    // 5. return the chunks

    if (document.trim() === '') {
        return [];
    }

    const langiumDoc = services.shared.workspace.LangiumDocumentFactory.fromString(document, URI.parse('memory://document.langium'));

    // not checking for lexer or parser errors here...

    const txtDoc = langiumDoc.textDocument;

    const chunks: string[] = [];

    const predicates = Array.isArray(nodePredicates) ? nodePredicates : [nodePredicates];

    // selectively stream nodes from the ast in langium
    const stream = AstUtils.streamAst(langiumDoc.parseResult.value);
    for (const node of stream) {
        if (predicates.some(p => p(node))) {
            // get the starting point of this node
            let start = node.$cstNode?.range.start;

            if (options?.commentRuleNames) {
                // include comments in the chunk
                const cstNode = node.$cstNode;
                const commentNode = CstUtils.findCommentNode(cstNode, options.commentRuleNames);
                if (commentNode) {
                    // adjust start to include the comment
                    start = commentNode.range.start;
                }
            }

            const end = node.$cstNode?.range.end;
            // add a chunk from the last offset to the start of this node
            const chunk = txtDoc.getText({
                start: {
                    line: start?.line || 0,
                    character: start?.character || 0
                },
                end: {
                    line: end?.line || 0,
                    character: end?.character || 0
                }
            });

            if (chunk.trim().length > 0) {
                chunks.push(chunk);
            }
        }
    }

    return chunks;

}