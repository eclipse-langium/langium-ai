/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { NodeFileSystem } from "langium/node";
import { splitByNode } from "langium-ai-tools/splitter";
import { createLangiumGrammarServices } from "langium/grammar";
import { LangiumServices } from "langium/lsp";

/**
 * An example of utilizing the splitter in Langium AI
 */

export function runSpliterExample() {
    const exampleLangiumDoc = `
grammar Test

entry Model: A | B | C | D | E;

A: 'A' ID;

/**
 * Info about B (one line above)
 */

B: 'B' ID;

/**
 * Info about C
 */
C: 'C' ID;


// info about D (one line above)

D: 'D' ID;

// info about E
E: 'E' ID;

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
    `;

    const langiumServices = createLangiumGrammarServices(NodeFileSystem);

    // split by ParserRule (w/ comments included)
    const splits = splitByNode(
        exampleLangiumDoc,
        [
            (node) => node.$type === 'ParserRule'
        ],
        langiumServices.grammar,
    );

    console.log('Split by ParserRule w/ comments:');
    console.dir(splits);

    // split by ParserRule (w/ comments included)
    const splitsNoComments = splitByNode(
        exampleLangiumDoc,
        [
            (node) => node.$type === 'ParserRule'
        ],
        langiumServices.grammar,
        { commentRuleNames: [] }
    );

    console.log('Split by ParserRule without comments:');
    console.dir(splitsNoComments);
}
