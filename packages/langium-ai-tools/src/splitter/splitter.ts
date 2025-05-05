/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode, CstUtils, LangiumDocument, URI } from "langium";
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
 * Helper function to parse a document string into a LangiumDocument object
 * @param document String to be parsed
 * @param services Associated Langium services for parsing
 * @returns The parsed LangiumDocument or undefined if there were errors
 */
export function parseDocument(document: string, services: LangiumServices): LangiumDocument<AstNode> | undefined {
    const langiumDoc = services.shared.workspace.LangiumDocumentFactory.fromString(document, URI.parse('memory://document.langium'));
    if (langiumDoc.parseResult.lexerErrors.length > 0) {
        console.error('Lexer errors:', langiumDoc.parseResult.lexerErrors);
        return undefined;
    }
    if (langiumDoc.parseResult.parserErrors.length > 0) {
        console.error('Parser errors:', langiumDoc.parseResult.parserErrors);
        return undefined;
    }
    return langiumDoc;
}

/**
 * Extracts matching AST nodes from a document based on provided predicates.
 * This function is used as a shared utility for splitting documents into AST nodes or text chunks.
 * @param document - The text document to be processed.
 * @param nodePredicates - The predicates to determine the nodes for matching.
 * @param services - The Langium services used for parsing the document.
 * @returns The matching AST nodes.
 */
function getMatchingAstNodes(
    document: string,
    nodePredicates: Array<(node: AstNode) => boolean> | ((node: AstNode) => boolean),
    services: LangiumServices
): AstNode[] {
    if (document.trim() === '') {
        return [];
    }

    const langiumDoc = parseDocument(document, services);
    if (!langiumDoc) {
        console.error('Failed to parse document');
        return [];
    }

    const astNodes: AstNode[] = [];

    const predicates = Array.isArray(nodePredicates) ? nodePredicates : [nodePredicates];

    // Stream nodes from the AST and filter them based on the predicates
    const stream = AstUtils.streamAst(langiumDoc.parseResult.value);
    for (const node of stream) {
        if (predicates.some(p => p(node))) {
            astNodes.push(node);
        }
    }
    return astNodes;
}

/**
 * Splits a document into text chunks based on AST nodes that match the provided predicates.
 * Finds the relevant nodes and then extracts corresponding text chunks from them
 * @param document - Document to split
 * @param nodePredicates - Predicates to determine the nodes for splitting
 * @param services - Langium grammar services used for parsing
 * @param options - The splitter configuration. See {@link SplitterOptions}
 * @returns Decoded text chunks from the document
 */
export function splitByNode(
    document: string,
    nodePredicates: Array<(node: AstNode) => boolean> | ((node: AstNode) => boolean),
    services: LangiumServices,
    options: SplitterOptions = { commentRuleNames: ['ML_COMMENT', 'SL_COMMENT'] }
): string[] {
    const astNodes = getMatchingAstNodes(document, nodePredicates, services);

    const langiumDoc = parseDocument(document, services);
    if (!langiumDoc) {
        console.error('Failed to parse document');
        return [];
    }

    const txtDoc = langiumDoc.textDocument;
    const chunks: string[] = [];

    for (const node of astNodes) {
        let start = node.$cstNode?.range.start;

        if (options?.commentRuleNames) {
            const cstNode = node.$cstNode;
            const commentNode = CstUtils.findCommentNode(cstNode, options.commentRuleNames);
            if (commentNode) {
                start = commentNode.range.start;
            }
        }

        const end = node.$cstNode?.range.end;
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
    return chunks;
}

/**
 * Splits a document into AST nodes based on the given predicates.
 * Directly returns the matched AST nodes
 * @param document - The text document to be split
 * @param nodePredicates - The predicates to determine which nodes to include
 * @param services - Langium grammar services used for parsing
 * @returns The nodes picked up by the splitter
 */
export function splitByNodeToAst(
    document: string,
    nodePredicates: Array<(node: AstNode) => boolean> | ((node: AstNode) => boolean),
    services: LangiumServices
): AstNode[] {
    return getMatchingAstNodes(document, nodePredicates, services);
}
