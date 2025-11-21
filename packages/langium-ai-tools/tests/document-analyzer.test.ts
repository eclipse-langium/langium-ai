import { URI } from 'langium';
import { createServicesForGrammar } from 'langium/grammar';
import { describe, expect, it } from 'vitest';
import { AnalysisMode, LangiumDocumentAnalyzer } from '../src/analyzer/document-analyzer.js';

const domainModelServices = await createServicesForGrammar({
    grammar: `
grammar DomainModel

entry Domainmodel:
    (elements+=AbstractElement)*;

AbstractElement:
    PackageDeclaration | Type;

PackageDeclaration:
    'package' name=QualifiedName '{'
        (elements+=AbstractElement)*
    '}';

Type:
    DataType | Entity;

DataType:
    'datatype' name=ID;

Entity:
    'entity' name=ID ('extends' superType=[+Entity:QualifiedName])? '{'
        (features+=Feature)*
    '}';

Feature:
    (many?='many')? name=ID ':' type=[Type:QualifiedName];

QualifiedName returns string:
    ID ('.' ID)*;

hidden terminal WS: /\\s+/;
terminal ID: /[_a-zA-Z][\\w_]*/;

hidden terminal ML_COMMENT: /\\/\\*[\\s\\S]*?\\*\\//;
hidden terminal SL_COMMENT: /\\/\\/[^\\n\\r]*/;

` });

const docAnalyzer = new LangiumDocumentAnalyzer(domainModelServices);

const exampleModel = `package foo.bar {
    datatype Complex
    entity E2 extends E1 {
        next: E2
        other: Complex
        nested: Complex
        time: Complex
    }
}`

function collectSyntaxUsageStatistics(model: string, analyzer = docAnalyzer) {
    const doc = domainModelServices.shared.workspace.LangiumDocumentFactory.fromString(model, URI.parse('memory:/test.txt'));
    return analyzer.collectSyntaxUsageStatistics(doc, domainModelServices.Grammar);
}

describe('LangiumDocumentAnalyzer', () => {

    it('should collect syntax usage statistics from string', async () => {
        const result = await docAnalyzer.evaluate('package foo.bar {}');
        const statistics = docAnalyzer.extractStatisticsFromResult(result)!;

        expect(statistics).toBeDefined();
        expect(statistics.ruleUsage['AbstractElement']).toBe(1);
        expect(statistics.ruleUsage['PackageDeclaration']).toBe(1);
        expect(statistics.ruleUsage['QualifiedName']).toBe(1);
        expect(statistics.ruleUsage['ID']).toBe(2);
    });


    it('should compute coverage correctly', () => {
        const statistics = collectSyntaxUsageStatistics('package foo.bar {}');
        expect(Object.values(statistics.ruleUsage).filter(count => count > 0).length, 'Used rules number').toBe(4);
        expect(statistics.coverage).toBeCloseTo(40.0, 1);
    });

    it('should handle "includeHiddenRules" flag', () => {
        const model = 'package bar { /** Multi-line comment */ }';

        const statistics = collectSyntaxUsageStatistics(model);
        expect(statistics.ruleUsage['ML_COMMENT']).toBe(1);

        const noHidden = new LangiumDocumentAnalyzer(domainModelServices, {
            includeHiddenRules: false
        });
        const statisticsNoHidden = collectSyntaxUsageStatistics(model, noHidden);
        expect(statisticsNoHidden.ruleUsage['ML_COMMENT']).toBeUndefined();
    });


    it('should compute entropy correctly', () => {
        const statistics = collectSyntaxUsageStatistics(exampleModel);
        expect(statistics.diversity.entropy).toBeCloseTo(2.28, 1);
    });

    it('should compute gini coefficient correctly', () => {
        const statistics = collectSyntaxUsageStatistics(exampleModel);
        expect(statistics.diversity.giniCoefficient).toBeCloseTo(0.65, 1);
    });

    it('should compute simpson index correctly', () => {
        const statistics = collectSyntaxUsageStatistics(exampleModel);
        expect(statistics.diversity.simpsonIndex).toBeCloseTo(0.7, 1);
    });

    it('should handle excluded rules', () => {
        const analyzerWithExcludedRules = new LangiumDocumentAnalyzer(domainModelServices, {
            excludeRules: ['Feature', 'DataType']
        });

        const testModel = 'package foo.bar { entity TestEntity { } }';

        const stats = collectSyntaxUsageStatistics(testModel);
        const statsWithExclude = collectSyntaxUsageStatistics(testModel, analyzerWithExcludedRules);

        expect(stats.ruleUsage).toHaveProperty('DataType');
        expect(stats.ruleUsage).toHaveProperty('Feature');
        // Verify that excluded rules are not present in the statistics
        expect(statsWithExclude.ruleUsage).not.toHaveProperty('DataType');
        expect(statsWithExclude.ruleUsage).not.toHaveProperty('Feature');

        // Check stats with exclude still has all rules from original except excluded ones
        expect(Object.keys(statsWithExclude.ruleUsage).length).toBe(Object.keys(stats.ruleUsage).length - 2);

        // Less rules (unused) will result in higher coverage
        expect(statsWithExclude.coverage).toBeGreaterThan(stats.coverage);
    });

    it('should handle empty documents', () => {
        const statistics = collectSyntaxUsageStatistics('');
        expect(Object.keys(statistics.ruleUsage).length).toBeGreaterThan(0);
        expect(statistics.coverage).toBe(0);
        expect(statistics.diversity.entropy).toBe(0);
        expect(statistics.diversity.giniCoefficient).toBe(0);
        expect(statistics.diversity.simpsonIndex).toBe(0);
    });

    it('should handle analysis mode NO_STATISTIC', async () => {
        const noStatAnalyzer = new LangiumDocumentAnalyzer(domainModelServices, {
            analysisMode: AnalysisMode.NO_STATISTIC
        });
        const result = await noStatAnalyzer.evaluate('package foo.bar { entity TestEntity { } }');
        const statistics = noStatAnalyzer.extractStatisticsFromResult(result);

        expect(statistics).toBeUndefined();
        expect(result.data?.failures, 'Expected validation passed.').toBe(0);
    });
});
