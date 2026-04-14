/**
 * Test runner integration tests
 */

import { beforeEach, describe as vitestDescribe, expect, it } from 'vitest';
import {
    describe,
    evaluation,
    beforeEach as evalBeforeEach,
    afterEach as evalAfterEach,
    beforeAll as evalBeforeAll,
    afterAll as evalAfterAll,
    getCollectedSuites,
    clearSuites,
} from '../src/evals/index.js';
import type { EvalContext, EvaluationCaseResult } from '../src/evals/index.js';

vitestDescribe('Test Runner beforeEach Integration', () => {
    let mockContext: EvalContext;
    let executionOrder: string[];

    beforeEach(() => {
        // create mock context
        mockContext = {
            systemPrompt: 'test system prompt',
            project: { name: 'test-project' },
        };

        // clear execution tracking
        executionOrder = [];

        // clear any collected suites
        clearSuites();
    });

    it('should execute beforeEach hook before each evaluation', async () => {
        // set up test suite with beforeEach
        describe('Eval Suite', () => {
            evalBeforeEach(() => {
                executionOrder.push('beforeEach');
            });

            evaluation('test 1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });

            evaluation('test 2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        // get the collected suites
        const suites = getCollectedSuites();

        // manually run the suite (simulating what runner.ts does)
        const results: EvaluationCaseResult[] = [];
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                const start = Date.now();
                try {
                    // run beforeEach hook if it exists
                    if (suite.beforeEachHook) {
                        await suite.beforeEachHook();
                    }

                    // get core evaluation data
                    const evaluationData = await evalDef.fn(mockContext);

                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: Date.now() - start,
                        },
                        data: evaluationData,
                    });
                } catch (error) {
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: Date.now() - start,
                        },
                        data: {
                            score: 0,
                            error: error instanceof Error ? error.message : String(error),
                        },
                    });
                }
            }
        }

        // verify execution order
        expect(executionOrder).toEqual(['beforeEach', 'eval1', 'beforeEach', 'eval2']);

        // verify results
        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);
    });

    it('should handle async beforeEach hooks', async () => {
        let setupComplete = false;

        describe('Async beforeEach Suite', () => {
            evalBeforeEach(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                setupComplete = true;
            });

            evaluation('test case', async () => {
                // setup should be complete by now
                expect(setupComplete).toBe(true);
                setupComplete = false; // reset for next test
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();

        // manually run the suite
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                if (suite.beforeEachHook) {
                    await suite.beforeEachHook();
                }
                const data = await evalDef.fn(mockContext);
                expect(data.score).toBe(1);
            }
        }
    });

    it('should continue running tests if beforeEach throws', async () => {
        describe('Suite with failing beforeEach', () => {
            evalBeforeEach(() => {
                throw new Error('beforeEach failed');
            });

            evaluation('test case', async () => {
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // manually run the suite with error handling
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                try {
                    if (suite.beforeEachHook) {
                        await suite.beforeEachHook();
                    }
                    const data = await evalDef.fn(mockContext);
                    results.push({
                        name: evalDef.name,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data,
                    });
                } catch (error) {
                    results.push({
                        name: evalDef.name,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data: {
                            score: 0,
                            error: error instanceof Error ? error.message : String(error),
                        },
                    });
                }
            }
        }

        expect(results).toHaveLength(1);
        // the test should fail due to beforeEach error
        expect(results[0].data.score).toBe(0);
        expect(results[0].data.error).toContain('beforeEach failed');
    });

    it('should run tests without beforeEach normally', async () => {
        describe('Suite without beforeEach', () => {
            evaluation('test case 1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });
            evaluation('test case 2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // manually run the suite
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                if (suite.beforeEachHook) {
                    await suite.beforeEachHook();
                }
                const data = await evalDef.fn(mockContext);
                results.push({
                    name: evalDef.name,
                    metadata: { evalFile: 'test.eval.ts', suiteName: suite.name, caseName: evalDef.name, duration: 0 },
                    data,
                });
            }
        }

        // verify execution order (no beforeEach calls)
        expect(executionOrder).toEqual(['eval1', 'eval2']);

        // verify results
        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);
    });

    it('should execute afterEach hook after each evaluation', async () => {
        // set up test suite with afterEach
        describe('Test Suite', () => {
            evalAfterEach(() => {
                executionOrder.push('afterEach');
            });

            evaluation('test 1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });

            evaluation('test 2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        // get the collected suites
        const suites = getCollectedSuites();

        // manually run the suite with afterEach support
        const results: EvaluationCaseResult[] = [];
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                const start = Date.now();
                try {
                    // run beforeEach hook if it exists
                    if (suite.beforeEachHook) {
                        await suite.beforeEachHook();
                    }

                    // get core evaluation data
                    const evaluationData = await evalDef.fn(mockContext);

                    // run afterEach hook if it exists
                    if (suite.afterEachHook) {
                        await suite.afterEachHook();
                    }

                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: Date.now() - start,
                        },
                        data: evaluationData,
                    });
                } catch (error) {
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: Date.now() - start,
                        },
                        data: {
                            score: 0,
                            error: error instanceof Error ? error.message : String(error),
                        },
                    });
                }
            }
        }

        // verify execution order
        expect(executionOrder).toEqual(['eval1', 'afterEach', 'eval2', 'afterEach']);

        // verify results
        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);
    });

    it('should execute both beforeEach and afterEach in correct order', async () => {
        describe('Test Suite', () => {
            evalBeforeEach(() => {
                executionOrder.push('beforeEach');
            });

            evalAfterEach(() => {
                executionOrder.push('afterEach');
            });

            evaluation('test 1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();

        // manually run the suite
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                if (suite.beforeEachHook) {
                    await suite.beforeEachHook();
                }
                await evalDef.fn(mockContext);
                if (suite.afterEachHook) {
                    await suite.afterEachHook();
                }
            }
        }

        expect(executionOrder).toEqual(['beforeEach', 'eval1', 'afterEach']);
    });

    it('should skip evaluations marked with .skip()', async () => {
        describe('Test Suite', () => {
            evaluation('normal test', async () => {
                executionOrder.push('normal');
                return { score: 1 };
            });

            evaluation.skip('skipped test', async () => {
                executionOrder.push('skipped');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // simulate runner behavior: include skipped tests in results but don't execute them
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                if (evalDef.skip) {
                    // add skipped result without executing
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data: {
                            score: 0,
                            skipped: true,
                        },
                    });
                } else {
                    // execute non-skipped test
                    const data = await evalDef.fn(mockContext);
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data,
                    });
                }
            }
        }

        // verify skipped test was not executed
        expect(executionOrder).toEqual(['normal']);
        // verify skipped test is in results
        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[0].data.skipped).toBeUndefined();
        expect(results[1].data.skipped).toBe(true);
    });

    it('should only run evaluations marked with .only()', async () => {
        describe('Test Suite', () => {
            evaluation('normal test 1', async () => {
                executionOrder.push('normal1');
                return { score: 1 };
            });

            evaluation.only('only test', async () => {
                executionOrder.push('only');
                return { score: 1 };
            });

            evaluation('normal test 2', async () => {
                executionOrder.push('normal2');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // check if any .only() exists
        const hasOnly = suites.some((s) => s.evaluations.some((e) => e.only));

        // simulate runner behavior
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                const evalSkipped = hasOnly && !evalDef.only;
                if (evalSkipped) {
                    // add skipped result
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data: {
                            score: 0,
                            skipped: true,
                        },
                    });
                } else {
                    // execute test
                    const data = await evalDef.fn(mockContext);
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data,
                    });
                }
            }
        }

        // only the .only() test executed
        expect(executionOrder).toEqual(['only']);
        // but all tests are in results
        expect(results).toHaveLength(3);
        expect(results[0].data.skipped).toBe(true);
        expect(results[1].data.score).toBe(1);
        expect(results[2].data.skipped).toBe(true);
    });

    it('should skip entire suite marked with describe.skip()', async () => {
        describe('normal suite', () => {
            evaluation('test 1', async () => {
                executionOrder.push('normal');
                return { score: 1 };
            });
        });

        describe.skip('skipped suite', () => {
            evaluation('test 2', async () => {
                executionOrder.push('skipped');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // simulate runner behavior
        for (const suite of suites) {
            const suiteSkipped = suite.skip;
            for (const evalDef of suite.evaluations) {
                if (suiteSkipped) {
                    // add skipped result
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data: {
                            score: 0,
                            skipped: true,
                        },
                    });
                } else {
                    // execute test
                    const data = await evalDef.fn(mockContext);
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data,
                    });
                }
            }
        }

        // only normal suite executed
        expect(executionOrder).toEqual(['normal']);
        // but all tests are in results
        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.skipped).toBe(true);
    });

    it('should only run suite marked with describe.only()', async () => {
        describe('normal suite', () => {
            evaluation('test 1', async () => {
                executionOrder.push('normal');
                return { score: 1 };
            });
        });

        describe.only('only suite', () => {
            evaluation('test 2', async () => {
                executionOrder.push('only');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // check if any suite has .only
        const hasOnly = suites.some((s) => s.only);

        // simulate runner behavior
        for (const suite of suites) {
            const suiteSkipped = hasOnly && !suite.only;
            for (const evalDef of suite.evaluations) {
                if (suiteSkipped) {
                    // add skipped result
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data: {
                            score: 0,
                            skipped: true,
                        },
                    });
                } else {
                    // execute test
                    const data = await evalDef.fn(mockContext);
                    results.push({
                        name: `${suite.name} - ${evalDef.name}`,
                        metadata: {
                            evalFile: 'test.eval.ts',
                            suiteName: suite.name,
                            caseName: evalDef.name,
                            duration: 0,
                        },
                        data,
                    });
                }
            }
        }

        // only .only() suite executed
        expect(executionOrder).toEqual(['only']);
        // but all tests are in results
        expect(results).toHaveLength(2);
        expect(results[0].data.skipped).toBe(true);
        expect(results[1].data.score).toBe(1);
    });

    it('should execute beforeAll hook once before all evaluations', async () => {
        // set up eval suite with beforeAll
        describe('beforeAll Suite', () => {
            evalBeforeAll(() => {
                executionOrder.push('beforeAll');
            });

            evaluation('eval1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });

            evaluation('eval2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // manually run the suite with beforeAll support
        for (const suite of suites) {
            // run beforeAll once before all evaluations
            if (suite.beforeAllHook) {
                await suite.beforeAllHook();
            }

            for (const evalDef of suite.evaluations) {
                const data = await evalDef.fn(mockContext);
                results.push({
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: 'test.eval.ts',
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: 0,
                    },
                    data,
                });
            }
        }

        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);

        // verify execution order: beforeAll runs once before all tests
        expect(executionOrder).toEqual(['beforeAll', 'eval1', 'eval2']);
    });

    it('should execute afterAll hook once after all evaluations', async () => {
        // set up test suite with afterAll
        describe('afterAll Suite', () => {
            evalAfterAll(() => {
                executionOrder.push('afterAll');
            });

            evaluation('eval1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });

            evaluation('eval2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // manually run the suite with afterAll support
        for (const suite of suites) {
            for (const evalDef of suite.evaluations) {
                const data = await evalDef.fn(mockContext);
                results.push({
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: evalDef.name + '.eval.ts',
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: 0,
                    },
                    data,
                });
            }

            // run afterAll once after all evaluations
            if (suite.afterAllHook) {
                await suite.afterAllHook();
            }
        }

        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);

        // verify execution order: afterAll runs once after all tests
        expect(executionOrder).toEqual(['eval1', 'eval2', 'afterAll']);
    });

    it('should execute all hooks in correct order', async () => {
        // set up test suite with all hooks
        describe('All Hooks Suite', () => {
            evalBeforeAll(() => {
                executionOrder.push('beforeAll');
            });

            evalBeforeEach(() => {
                executionOrder.push('beforeEach');
            });

            evalAfterEach(() => {
                executionOrder.push('afterEach');
            });

            evalAfterAll(() => {
                executionOrder.push('afterAll');
            });

            evaluation('eval1', async () => {
                executionOrder.push('eval1');
                return { score: 1 };
            });

            evaluation('eval2', async () => {
                executionOrder.push('eval2');
                return { score: 1 };
            });
        });

        const suites = getCollectedSuites();
        const results: EvaluationCaseResult[] = [];

        // manually run the suite with all hooks
        for (const suite of suites) {
            // run beforeAll once before all evaluations
            if (suite.beforeAllHook) {
                await suite.beforeAllHook();
            }

            for (const evalDef of suite.evaluations) {
                // run beforeEach before each evaluation
                if (suite.beforeEachHook) {
                    await suite.beforeEachHook();
                }

                const data = await evalDef.fn(mockContext);
                results.push({
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: 'test.eval.ts',
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: 0,
                    },
                    data,
                });

                // run afterEach after each evaluation
                if (suite.afterEachHook) {
                    await suite.afterEachHook();
                }
            }

            // run afterAll once after all evaluations
            if (suite.afterAllHook) {
                await suite.afterAllHook();
            }
        }

        expect(results).toHaveLength(2);
        expect(results[0].data.score).toBe(1);
        expect(results[1].data.score).toBe(1);

        // verify execution order: beforeAll -> (beforeEach -> test -> afterEach) x2 -> afterAll
        expect(executionOrder).toEqual([
            'beforeAll',
            'beforeEach',
            'eval1',
            'afterEach',
            'beforeEach',
            'eval2',
            'afterEach',
            'afterAll',
        ]);
    });
});
