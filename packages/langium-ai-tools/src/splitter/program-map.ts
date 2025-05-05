/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { AstNode } from "langium";
import { LangiumServices } from "langium/lsp";
import { parseDocument, splitByNode, splitByNodeToAst } from "./splitter.js";

interface MappingRule {
    /**
     * Determines which nodes to map with this rule
     */
    predicate: (node: AstNode) => boolean;

    /**
     * Determines how to map the node's textual split
     */
    map: (node: AstNode) => string;
}

interface ProgramMapOptions {
    /**
     * List of mapping rules to apply to the document.
     * Each rule is a predicate that determines which nodes to map & how to map them
     */
    mappingRules: MappingRule[]
}

/**
 * Mapper generates a repo-map like structure from a given Langium document.
 * Leverages the splitter to produce a mapping from split chunks.
 */
export class ProgramMapper {

    private services: LangiumServices;
    private options: ProgramMapOptions;

    constructor(services: LangiumServices, options: ProgramMapOptions) {
        this.services = services;
        this.options = options;
    }

    /**
     * Produces a map from the given document
     * @param document - The text document to be mapped.
     * @returns The mapped document as a list of strings, one for each mapped element
     */
    public map(document: string): string[] {
        const mappingRules = this.options.mappingRules;
        const mapChunks: string[] = [];

        // get all predicates
        const predicates = mappingRules.map(rule => rule.predicate);

        const nodes = splitByNodeToAst(document, predicates, this.services);

        for (const node of nodes) {
            // apply the mapping rule to each node
            for (const rule of mappingRules) {
                if (rule.predicate(node)) {
                    mapChunks.push(rule.map(node));
                }
            }
        }

        return mapChunks;
    }
}
