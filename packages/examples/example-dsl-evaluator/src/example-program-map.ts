/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { ProgramMapper } from "langium-ai-tools";
import { createLangiumGrammarServices } from "langium/grammar";
import { NodeFileSystem } from "langium/node";

export function runExampleProgramMap() {

    // simple langium grammar, as an example
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

    // Datatype rule
    DT returns string: ID;
    
    hidden terminal WS: /\s+/;
    terminal ID: /[_a-zA-Z][\w_]*/;
        `;
    
    // setup your language services (langium's, in this case)
    const langiumServices = createLangiumGrammarServices(NodeFileSystem);
    const grammarServices = langiumServices.grammar;

    // instantiate 
    const mapper = new ProgramMapper(grammarServices, {
        mappingRules: [
            {
                predicate: (node) => node.$type === 'ParserRule',
                map: (node: any) => {
                    const ruleName = node.name;
                    const modifiers = [
                        node.entry ? 'entry' : undefined,
                        node.fragment ? 'fragment' : undefined,
                        node.definesHiddenTokens ? 'hidden' : undefined,
                        node.dataType ? 'datatype' : undefined
                    ].filter(v => v !== undefined);
                    const modifierString = modifiers.length > 0 ? `(${modifiers.join(', ')}) ` : '';
                    return `${modifierString}rule ${ruleName}`;
                }
            },
            {
                predicate: (node) => node.$type === 'TerminalRule',
                map: (node: any) => {
                    const modifiers = [
                        node.fragment ? 'fragment' : undefined,
                        node.hidden ? 'hidden' : undefined,
                    ].filter(v => v !== undefined);
                    const modifierString = modifiers.length > 0 ? `(${modifiers.join(', ')}) ` : '';
                    return `${modifierString}terminal ${node.name}`;
                }
            }
        ]
    });
    const programMap = mapper.map(exampleLangiumDoc);
    console.log('Program Map Output:');
    console.log(programMap.join('\n'));
}