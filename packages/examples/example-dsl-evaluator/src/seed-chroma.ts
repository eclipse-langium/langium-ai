/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Seeds the ChromaDB collection used by the RAG runners.
 *
 * This demonstrates the intended langium-ai-tools workflow: a Langium grammar is
 * split into per-rule chunks with the splitter, each chunk is embedded with an
 * Ollama embedding model, and the results are stored in a Chroma collection. The
 * RAG runners in `runners.ts` later query this same collection for context.
 *
 * Prerequisites (see README):
 *   - a running ChromaDB server on http://localhost:8000 (`npm run chroma:up`)
 *   - Ollama running with the `nomic-embed-text` model pulled
 */

import { ChromaClient } from 'chromadb';
import { createLangiumGrammarServices } from 'langium/grammar';
import { NodeFileSystem } from 'langium/node';
import { splitByNode } from 'langium-ai-tools/splitter';
import ollama from 'ollama';

// must match the collection queried by the RAG runners in runners.ts
const LangiumDSLCollection = 'langium-collection';
const EmbeddingModel = 'nomic-embed-text';
const ChromaUrl = 'http://localhost:8000';

/**
 * Example corpus to embed for RAG. In a real application this would be sourced
 * from your DSL's grammar, documentation, and example programs. Here we use an
 * annotated Langium grammar so the splitter produces meaningful, comment-rich
 * chunks (one per parser/terminal rule).
 *
 * The grammar is assembled from an array of lines rather than a template literal
 * so that regex backslashes (e.g. `\\s`, `\\/`) survive verbatim — template
 * literals silently strip those escapes and corrupt the terminal definitions.
 */
const corpus = [
    'grammar HelloWorld',
    '',
    '// entry parser rule, parses a list of persons & greetings in any order',
    'entry Model:',
    '(persons+=Person | greetings+=Greeting)*;',
    '',
    '/**',
    " * A Person is declared with the 'person' keyword followed by a name.",
    ' */',
    'Person:',
    "'person' name=ID;",
    '',
    '/**',
    ' * A Greeting references a previously declared Person by name.',
    ' */',
    'Greeting:',
    "'Hello' person=[Person:ID] '!';",
    '',
    '// whitespace is hidden, i.e. ignored and not part of the AST',
    'hidden terminal WS: /\\s+/;',
    '',
    '// ID matches identifiers',
    'terminal ID: /[_a-zA-Z][\\w_]*/;',
    '',
    '// multi-line & single-line comments are hidden terminals',
    'hidden terminal ML_COMMENT: /\\/\\*[\\s\\S]*?\\*\\//;',
    'hidden terminal SL_COMMENT: /\\/\\/[^\\n\\r]*/;',
].join('\n');

/**
 * Splits the corpus into text chunks using the langium-ai-tools splitter,
 * keeping each parser & terminal rule (with its leading comments) as one chunk.
 */
function buildChunks(): string[] {
    const services = createLangiumGrammarServices(NodeFileSystem);
    return splitByNode(
        corpus,
        [(node) => node.$type === 'ParserRule' || node.$type === 'TerminalRule'],
        services.grammar,
    );
}

/**
 * Embeds a batch of texts with the Ollama embedding model.
 */
async function embed(texts: string[]): Promise<number[][]> {
    return (
        await ollama.embed({
            model: EmbeddingModel,
            input: texts,
            keep_alive: 30,
        })
    ).embeddings;
}

async function seed() {
    const chunks = buildChunks();
    if (chunks.length === 0) {
        throw new Error('Splitter produced no chunks; aborting seed.');
    }
    console.log(`Split corpus into ${chunks.length} chunk(s).`);

    const client = new ChromaClient({ path: ChromaUrl });

    // start from a clean slate so re-running the seed is idempotent
    try {
        await client.deleteCollection({ name: LangiumDSLCollection });
    } catch {
        // collection may not exist yet on first run; that's fine
    }

    const collection = await client.getOrCreateCollection({
        name: LangiumDSLCollection,
        embeddingFunction: { generate: embed },
    });

    const embeddings = await embed(chunks);
    await collection.add({
        ids: chunks.map((_, i) => `chunk-${i}`),
        documents: chunks,
        embeddings,
    });

    const count = await collection.count();
    console.log(`Seeded collection "${LangiumDSLCollection}" with ${count} document(s).`);
    console.log('You can now run RAG evaluations, e.g. `npm run start -- run-langium`.');
}

seed().catch((err) => {
    console.error('Failed to seed ChromaDB.');
    console.error('Is the Chroma server running (npm run chroma:up) and is Ollama available?');
    console.error(err);
    process.exit(1);
});
