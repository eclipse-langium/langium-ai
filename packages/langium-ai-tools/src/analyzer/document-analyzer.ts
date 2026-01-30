/******************************************************************************
 * Copyright 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 * 
 * @author Dennis Hübner
 ******************************************************************************/

import { CstUtils, Grammar, GrammarAST, LangiumDocument, isLeafCstNode } from "langium";
import { resolveTransitiveImports, } from 'langium/grammar';
import { LangiumServices } from "langium/lsp";
import { EvaluationContext } from "../evaluator/document-evaluator.js";
import { EvaluatorResult } from "../evaluator/evaluator.js";
import { LangiumEvaluator, LangiumEvaluatorResultData } from "../evaluator/langium-evaluator.js";
import { EvaluatorResultMsg, SyntaxStatistic } from "../gen/interface.js";



/**
 * Extends LangiumEvaluator and adds analysis capabilities.
 */
export class LangiumDocumentAnalyzer<T extends LangiumServices> extends LangiumEvaluator<T> {

    public static readonly METADATA_KEY = 'syntax_statistics';

    private readonly analysisOptions: AnalysisOptions;

    /**
     * Creates an instance of LangiumDocumentAnalyzer.
     * @param services Langium services
     * @param analysisOptions Analysis options
     * @example
     * ```typescript
     * const analyzer = new LangiumDocumentAnalyzer(services, {
     *     analysisMode: AnalysisMode.ALL,
     *     excludeRules: ['DeprecatedRule'],
     *     computeDiversity: false
     * });
     * ```
     */
    constructor(services: T, analysisOptions: Partial<AnalysisOptions> = {}) {
        super(services);
        this.analysisOptions = { ...DEFAULT_OPTIONS, ...analysisOptions };
    }

    /**
     * Evaluates a Langium document.
     * Here we return protocol compatible object EvaluatorResultMsg.
     * 
     * @param doc Langium document to evaluate
     * @param ctx Evaluation context
     * @returns Evaluation result with syntax statistics in metadata
     */
    evaluateDocument(doc: LangiumDocument, ctx: EvaluationContext): EvaluatorResult<LangiumEvaluatorResultData> & EvaluatorResultMsg {
        const validationResult = super.evaluateDocument(doc, ctx);
        if (this.analysisOptions.analysisMode !== AnalysisMode.NO_STATISTIC && validationResult.data && validationResult.data.failures === 0) {
            // Add syntax usage statistics only if build was successful
            const statistics = this.collectSyntaxUsageStatistics(doc, this.services.Grammar);
            validationResult.metadata[LangiumDocumentAnalyzer.METADATA_KEY] = {
                value: {
                    oneofKind: 'syntaxStatisticValue',
                    syntaxStatisticValue: statistics
                }
            };
        }
        // make sure we fulfill the EvaluatorResultMsg interface 
        return {
            ...validationResult,
            data: {
                ...validationResult.data,
                diagnostics: validationResult.data.diagnostics.map(diagnostic => {
                    const code = typeof diagnostic.code === 'number' ? String(diagnostic.code) : diagnostic.code;
                    return {
                        ...diagnostic,
                        code
                    };
                })
            }
        } as EvaluatorResult<LangiumEvaluatorResultData> & EvaluatorResultMsg;
    }

    collectSyntaxUsageStatistics(doc: LangiumDocument, grammar: Grammar): SyntaxStatistic {
        const rootCstNode = doc.parseResult.value.$cstNode;
        if (!rootCstNode) {
            return this.createEmptySyntaxStatistic();
        }
        const { includeImportedRules, excludeRules, computeDiversity, includeHiddenRules } = this.analysisOptions;
        const excludedRules = new Set(excludeRules);
        const isRuleExcluded = (ruleName: string) => ruleName === 'WS' || excludedRules.has(ruleName);

        const allRules = includeImportedRules ? this.collectAllRules(grammar) : grammar.rules;
        const ruleUsage: Record<string, number> = {};
        // Initialize rule usage map, excluding rules specified in excludeRules. Also skip entry rule.
        for (const rule of allRules) {
            if (!isRuleExcluded(rule.name)) {
                if (
                    (GrammarAST.isParserRule(rule) && rule.entry)
                    || (GrammarAST.isTerminalRule(rule) && rule.hidden && !includeHiddenRules)
                ) {
                    continue;
                }
                ruleUsage[rule.name] = 0;
            }
        }

        for (const cstNode of CstUtils.streamCst(rootCstNode)) {
            const grammarSource = cstNode.grammarSource;

            const addIfNotExcluded = (ruleName: string) => {
                if (!isRuleExcluded(ruleName)) {
                    ruleUsage[ruleName] = (ruleUsage[ruleName] ?? 0) + 1;
                }
            };

            if (grammarSource && GrammarAST.isRuleCall(grammarSource)) {
                // For now handle only RuleCalls
                addIfNotExcluded(grammarSource.rule.ref?.name ?? 'unknown');
            } else if (includeHiddenRules && cstNode.hidden && isLeafCstNode(cstNode)) {
                addIfNotExcluded(cstNode.tokenType.name);
            }
        }

        let diversity = { entropy: 0, giniCoefficient: 0, simpsonIndex: 0 };
        if (computeDiversity) {
            diversity = {
                entropy: this.computeEntropy(ruleUsage),
                giniCoefficient: this.computeGiniCoefficient(ruleUsage),
                simpsonIndex: this.computeSimpsonIndex(ruleUsage)
            };
        }
        const coverage = this.computeCoverage(ruleUsage);
        return { ruleUsage, coverage, diversity };
    }

    /**
     * Computes coverage as percentage of used rules over all available rules
     */
    computeCoverage(ruleUsage: Record<string, number>): number {
        const usedRules = Object.values(ruleUsage).filter(count => count > 0).length;
        return usedRules > 0 ? (usedRules / Object.keys(ruleUsage).length) * 100 : 0;
    }

    /**
     * Computes Shannon entropy - measure of information diversity
     * Higher values indicate more diverse usage patterns
     */
    computeEntropy(ruleUsage: Record<string, number>): number {
        const totalUsage = Object.values(ruleUsage).reduce((sum, count) => sum + count, 0);
        if (totalUsage === 0) {
            return 0;
        }

        let entropy = 0;
        for (const count of Object.values(ruleUsage)) {
            if (count > 0) {
                const probability = count / totalUsage;
                entropy -= probability * Math.log2(probability);
            }
        }
        return entropy;
    }

    /**
     * Computes Gini coefficient - measure of inequality in rule usage
     * 0 = perfect equality, 1 = maximum inequality
     */
    computeGiniCoefficient(ruleUsage: Record<string, number>): number {
        const counts = Object.values(ruleUsage).sort((a, b) => a - b);
        const n = counts.length;
        if (n === 0) {
            return 0;
        }

        const sum = counts.reduce((acc, val) => acc + val, 0);
        if (sum === 0) {
            return 0;
        }

        let numerator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (2 * (i + 1) - n - 1) * counts[i];
        }
        return numerator / (n * sum);
    }

    /**
     * Computes Simpson's diversity index - probability that two randomly selected items are different
     * Higher values indicate more diversity
     */
    computeSimpsonIndex(ruleUsage: Record<string, number>): number {
        const totalUsage = Object.values(ruleUsage).reduce((sum, count) => sum + count, 0);
        if (totalUsage === 0) {
            return 0;
        }

        let sum = 0;
        for (const count of Object.values(ruleUsage)) {
            const probability = count / totalUsage;
            sum += probability * probability;
        }

        return 1 - sum; // Simpson's diversity index (1-D)
    }

    /**
     * Extracts syntax statistics from the evaluation result.
     * @param result The evaluation result.
     * @returns The extracted syntax statistics or undefined if not found.
     */
    extractStatisticsFromResult(result: Partial<EvaluatorResult> | undefined): SyntaxStatistic | undefined {
        const metadata = result?.metadata;
        if (metadata && metadata[LangiumDocumentAnalyzer.METADATA_KEY]) {
            const value = (metadata[LangiumDocumentAnalyzer.METADATA_KEY] as { value: { oneofKind: string, syntaxStatisticValue: SyntaxStatistic }}).value;
            if (value.oneofKind === 'syntaxStatisticValue') {
                return value.syntaxStatisticValue;
            }
            return undefined;
        }
        return undefined;
    }

    protected collectAllRules(grammar: Grammar): GrammarAST.AbstractRule[] {
        try {
            return grammar.rules.concat(
                resolveTransitiveImports(this.services.shared.workspace.LangiumDocuments, grammar).map(g => g.rules).flat()
            );
        } catch (e) {
            console.error('Error resolving imports: ', e);
            return [];
        }
    }

    protected createEmptySyntaxStatistic(): SyntaxStatistic {
        return {
            ruleUsage: {},
            coverage: 0,
            diversity: {
                entropy: 0,
                giniCoefficient: 0,
                simpsonIndex: 0
            }
        };
    }
}

/**
 * Analysis mode for controlling what analysis operations to perform
 */
export enum AnalysisMode {
    ALL = 'ALL',
    NO_STATISTIC = 'NO_STATISTIC'
}

interface AnalysisOptions {
    analysisMode: AnalysisMode;
    /**
     * Filter for specific rules (e.g deprecated) to exclude in the analysis.
     * Rule WS (whitespace) is always excluded.
     */
    excludeRules: string[];
    /** 
     * Whether to include rules from imported grammars. Default is true.
     */
    includeImportedRules: boolean;
    /**
     * Whether to include hidden tokens (like comments, whitespace) in the analysis. Default is false.
     * Rule WS (whitespace) is always excluded.
     */
    includeHiddenRules: boolean;
    /**
     * Whether to compute diversity metrics for rule usage. Default is true.
     */
    computeDiversity: boolean;
}

const DEFAULT_OPTIONS: AnalysisOptions = {
    analysisMode: AnalysisMode.ALL,
    excludeRules: [],
    includeImportedRules: true,
    includeHiddenRules: true,
    computeDiversity: true
};

