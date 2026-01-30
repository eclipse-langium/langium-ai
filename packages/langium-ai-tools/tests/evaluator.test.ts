/**
 * Evaluator tests
 */

import { createServicesForGrammar } from 'langium/grammar';
import { describe, expect, it } from 'vitest';
import {
    Evaluator,
    EvaluatorResult,
    averageAcrossCases,
    averageAcrossRunners,
    mergeEvaluators
} from '../src/evaluator/evaluator.js';
import { LangiumEvaluator } from '../src/evaluator/langium-evaluator.js';

// create test services using the same domain model grammar as document-analyzer tests
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

describe('Evaluator Utility Functions', () => {

    describe('averageAcrossCases', () => {

        it('should average results with the same name', () => {
            const results: EvaluatorResult[] = [
                { name: 'test1', metadata: {}, data: { score: 10, runtime: 5 } },
                { name: 'test1', metadata: {}, data: { score: 20, runtime: 15 } },
                { name: 'test1', metadata: {}, data: { score: 30, runtime: 25 } }
            ];

            const averaged = averageAcrossCases(results);

            expect(averaged).toHaveLength(1);
            expect(averaged[0].name).toBe('test1');
            expect(averaged[0].data.score).toBe(20); 
            expect(averaged[0].data.runtime).toBe(15);
        });

        it('should handle multiple different result names', () => {
            const results: EvaluatorResult[] = [
                { name: 'test1', metadata: {}, data: { score: 10 } },
                { name: 'test2', metadata: {}, data: { score: 20 } },
                { name: 'test1', metadata: {}, data: { score: 30 } }
            ];

            const averaged = averageAcrossCases(results);

            expect(averaged).toHaveLength(2);
            const test1 = averaged.find(r => r.name === 'test1');
            const test2 = averaged.find(r => r.name === 'test2');
            expect(test1?.data.score).toBe(20);
            expect(test2?.data.score).toBe(20);
        });

        it('should round to 2 decimal places', () => {
            const results: EvaluatorResult[] = [
                { name: 'test1', metadata: {}, data: { score: 10 } },
                { name: 'test1', metadata: {}, data: { score: 11 } },
                { name: 'test1', metadata: {}, data: { score: 12 } }
            ];

            const averaged = averageAcrossCases(results);

            expect(averaged[0].data.score).toBe(11);
        });

        // TODO can't aggregate non-numeric data types
        it('should preserve non-numeric data', () => {
            const results: EvaluatorResult[] = [
                { name: 'test1', metadata: {}, data: { score: 10, status: 'pass' } },
                { name: 'test1', metadata: {}, data: { score: 20, status: 'fail' } }
            ];

            const averaged = averageAcrossCases(results);

            expect(averaged[0].data.score).toBe(15);
            // initial value preserved
            // TODO @montymxb we should probably change this for pass/fail cases, as this is intended for other string data but is unclear
            // TODO @montymxb: need to handle case where we have an empty list result, but we're expecting an empty one
            // expect that the average result should not include non-aggregate values
            expect(averaged[0].data.status).not.toBeDefined();
        });

        it('should handle empty results array', () => {
            const results: EvaluatorResult[] = [];
            const averaged = averageAcrossCases(results);
            expect(averaged).toHaveLength(0);
        });

        it('should handle single result', () => {
            const results: EvaluatorResult[] = [
                { name: 'test1', metadata: {}, data: { score: 42 } }
            ];

            const averaged = averageAcrossCases(results);

            // should be a single averaged entry
            expect(averaged).toHaveLength(1);
            expect(averaged[0].data.score).toBe(42);
        });

        it('should handle empty result', () => {
            const results: EvaluatorResult[] = [];
            const averaged = averageAcrossCases(results);
            // nothing should be present
            expect(averaged).toHaveLength(0);
        });
    });

    describe('averageAcrossRunners', () => {

        it('should average results across runners', () => {
            const results: EvaluatorResult[] = [
                { name: 'runner1-case1', metadata: { runner: 'runner1' }, data: { score: 10 } },
                { name: 'runner1-case2', metadata: { runner: 'runner1' }, data: { score: 20 } },
                { name: 'runner2-case1', metadata: { runner: 'runner2' }, data: { score: 30 } }
            ];

            const averaged = averageAcrossRunners(results);
            // 2 runners
            expect(averaged).toHaveLength(2);

            // runner1 average
            expect(averaged[0].data).toBeDefined();
            expect(averaged[0].data).toStrictEqual({
                score: 15
            });

            // runner2 average
            expect(averaged[1].data).toBeDefined();
            expect(averaged[1].data).toStrictEqual({
                score: 30
            });
        });

        it('should preserve runner metadata', () => {
            const results: EvaluatorResult[] = [
                { name: 'case1', metadata: { runner: 'runner1', version: '1.0' }, data: { score: 10 } },
                { name: 'case2', metadata: { runner: 'runner1', version: '1.0' }, data: { score: 20 } }
            ];

            const averaged = averageAcrossRunners(results);

            expect(averaged[0].metadata.runner).toBe('runner1');
            expect(averaged[0].metadata.version).toBe('1.0');
        });

        it('should handle single runner', () => {
            const results: EvaluatorResult[] = [
                { name: 'case1', metadata: { runner: 'runner1' }, data: { score: 10 } },
                { name: 'case2', metadata: { runner: 'runner1' }, data: { score: 20 } }
            ];

            const averaged = averageAcrossRunners(results);

            expect(averaged).toHaveLength(1);
            expect(averaged[0].data.score).toBe(15);
        });
    });

    describe('mergeEvaluators', () => {

        it('should merge two evaluators', async () => {
            const eval1: Evaluator = {
                async evaluate(_response: string, _expected: string) {
                    return {
                        name: 'eval1',
                        metadata: { source: 'eval1' },
                        data: { metric1: 10 }
                    };
                }
            };

            const eval2: Evaluator = {
                async evaluate(_response: string, _expected: string) {
                    return {
                        name: 'eval2',
                        metadata: { source: 'eval2' },
                        data: { metric2: 20 }
                    };
                }
            };

            const merged = mergeEvaluators(eval1, eval2);
            const result = await merged.evaluate('test', 'expected');

            expect(result.metadata).toEqual({ source: 'eval2' });
            expect(result.data).toEqual({ metric1: 10, metric2: 20 });
        });

        it('should merge multiple evaluators', async () => {
            const eval1: Evaluator = {
                async evaluate() {
                    return { metadata: {}, data: { a: 1 } };
                }
            };

            const eval2: Evaluator = {
                async evaluate() {
                    return { metadata: {}, data: { b: 2 } };
                }
            };

            const eval3: Evaluator = {
                async evaluate() {
                    return { metadata: {}, data: { c: 3 } };
                }
            };

            const merged = mergeEvaluators(eval1, eval2, eval3);
            const result = await merged.evaluate('test', 'expected');

            expect(result.data).toEqual({ a: 1, b: 2, c: 3 });
        });

        it('should allow later evaluators to override earlier ones', async () => {
            const eval1: Evaluator = {
                async evaluate() {
                    return {
                        metadata: { version: '1.0' },
                        data: { score: 10 }
                    };
                }
            };

            const eval2: Evaluator = {
                async evaluate() {
                    return {
                        metadata: { version: '2.0' },
                        data: { score: 20 }
                    };
                }
            };

            const merged = mergeEvaluators(eval1, eval2);
            const result = await merged.evaluate('test', 'expected');

            expect(result.data).toBeDefined();
            expect(result.data!.score).toBe(20);
            expect(result.metadata).toBeDefined();
            expect(result.metadata!.version).toBe('2.0');
        });

        it('should handle evaluators with overlapping and non-overlapping keys', async () => {
            const eval1: Evaluator = {
                async evaluate() {
                    return {
                        metadata: { a: 1, b: 2 },
                        data: { x: 10, y: 20 }
                    };
                }
            };

            const eval2: Evaluator = {
                async evaluate() {
                    return {
                        metadata: { b: 3, c: 4 },
                        data: { y: 30, z: 40 }
                    };
                }
            };

            const merged = mergeEvaluators(eval1, eval2);
            const result = await merged.evaluate('test', 'expected');

            expect(result.metadata).toEqual({ a: 1, b: 3, c: 4 });
            expect(result.data).toEqual({ x: 10, y: 30, z: 40 });
        });
    });
});

describe('LangiumEvaluator', () => {

    const evaluator = new LangiumEvaluator(domainModelServices);

    describe('Basic validation', () => {

        it('should validate correct code with no errors', async () => {
            const validCode = `package foo.bar {
                datatype String
                entity Person {
                    name: String
                }
            }`;

            const result = await evaluator.evaluate(validCode);

            expect(result.data?.errors).toBe(0);
            expect(result.data?.warnings).toBe(0);
            expect(result.data?.failures).toBe(0);
        });

        it('should detect syntax errors', async () => {
            const invalidCode = `package foo.bar {
                entity Person
                    name: String
                }
            }`;

            const result = await evaluator.evaluate(invalidCode);

            expect(result.data?.errors).toBeGreaterThan(0);
        });

        it('should detect reference errors', async () => {
            const codeWithRefError = `package foo.bar {
                entity Person {
                    address: UnknownType
                }
            }`;

            const result = await evaluator.evaluate(codeWithRefError);

            expect(result.data?.errors).toBeGreaterThan(0);
        });

        it('should count multiple diagnostic types', async () => {
            const validCode = `package test {
                datatype Int
            }`;

            const result = await evaluator.evaluate(validCode);

            expect(result.data).toBeDefined();
            expect(result.data?.errors).toBeDefined();
            expect(result.data?.warnings).toBeDefined();
            expect(result.data?.infos).toBeDefined();
            expect(result.data?.hints).toBeDefined();
        });
    });

    describe('Code block handling', () => {

        it('should extract code from markdown code blocks', async () => {
            const markdownCode = '```langium\npackage test {}\n```';

            const result = await evaluator.evaluate(markdownCode);

            expect(result.data?.failures).toBe(0);
        });

        it('should extract code from generic code blocks', async () => {
            const markdownCode = '```\npackage test {}\n```';

            const result = await evaluator.evaluate(markdownCode);

            expect(result.data?.failures).toBe(0);
        });

        it('should handle code with multiple blocks and take first', async () => {
            const markdownCode = '```\npackage test {}\n```\nSome text\n```\ninvalid code\n```';

            const result = await evaluator.evaluate(markdownCode);

            // should process the first code block
            expect(result.data).toBeDefined();
        });
    });

    describe('Diagnostic counting', () => {

        it('should track response length', async () => {
            const code = `package test {}`;

            const result = await evaluator.evaluate(code);

            expect(result.data?.response_length).toBe(code.length);
        });

        it('should include diagnostics in result data', async () => {
            const code = `package test {
                entity Person {
                    unknown: InvalidType
                }
            }`;

            const result = await evaluator.evaluate(code);

            expect(result.data?.diagnostics).toBeDefined();
            expect(Array.isArray(result.data?.diagnostics)).toBe(true);
        });

        it('should handle empty input', async () => {
            const result = await evaluator.evaluate('');

            expect(result.data?.failures).toBe(0);
            expect(result.data?.responseLength).toBe(0);
        });
    });

    describe('Error handling', () => {

        it('should handle build errors gracefully', async () => {
            const malformed = `package test {...`;

            const result = await evaluator.evaluate(malformed);

            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            // failures should be present
            expect(result.data?.errors).toBe(1);
        });

        it('should use default file extension when not specified', async () => {
            const code = `package test {}`;

            const result = await evaluator.evaluate(code);

            expect(result.data).toBeDefined();
        });
    });

    describe('Result structure', () => {

        it('should return properly structured result', async () => {
            const code = `package test {}`;

            const result = await evaluator.evaluate(code);

            expect(result).toBeDefined();
            expect(result.name).toBe('LangiumEvaluator');
            expect(result.metadata).toBeDefined();
            expect(result.data).toBeDefined();
        });

        it('should initialize all diagnostic counters', async () => {
            const code = `package test {}`;

            const result = await evaluator.evaluate(code);

            expect(result.data?.errors).toBe(0);
            expect(result.data?.warnings).toBe(0);
            expect(result.data?.infos).toBe(0);
            expect(result.data?.hints).toBe(0);
            expect(result.data?.unassigned).toBe(0);
        });
    });
});
