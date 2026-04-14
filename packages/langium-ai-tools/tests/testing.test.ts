/**
 * Testing API tests - verify describe, evaluation, and beforeEach work correctly
 */

import { expect, it, beforeEach as vitestBeforeEach, describe as vitestDescribe } from 'vitest';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    clearSuites,
    describe,
    evaluation,
    getCollectedSuites,
} from '../src/evals/index.js';

vitestDescribe('Testing API', () => {
    vitestBeforeEach(() => {
        // clear any collected suites before each test
        clearSuites();
    });

    it('should collect describe blocks with evaluations', () => {
        describe('Test Suite', () => {
            evaluation('test case 1', async () => ({ score: 1 }));
            evaluation('test case 2', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].name).toBe('Test Suite');
        expect(suites[0].evaluations).toHaveLength(2);
    });

    it('should collect beforeEach hooks', () => {
        let hookFn: (() => void) | undefined;

        describe('Test Suite with beforeEach', () => {
            hookFn = () => {
                // setup logic
            };
            beforeEach(hookFn);
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].beforeEachHook).toBeDefined();
        expect(suites[0].beforeEachHook).toBe(hookFn);
    });

    it('should throw error when evaluation is called outside describe', () => {
        expect(() => {
            evaluation('invalid test', async () => ({ score: 1 }));
        }).toThrow('evaluation() must be called inside describe()');
    });

    it('should throw error when beforeEach is called outside describe', () => {
        expect(() => {
            beforeEach(() => {
                // setup
            });
        }).toThrow('beforeEach() must be called inside describe()');
    });

    it('should support async beforeEach hooks', () => {
        const asyncHook = async () => {
            await Promise.resolve();
        };

        describe('Test Suite with async beforeEach', () => {
            beforeEach(asyncHook);
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].beforeEachHook).toBe(asyncHook);
    });

    it('should handle multiple suites', () => {
        describe('Suite 1', () => {
            beforeEach(() => {
                // setup for suite 1
            });
            evaluation('test 1', async () => ({ score: 1 }));
        });

        describe('Suite 2', () => {
            beforeEach(() => {
                // setup for suite 2
            });
            evaluation('test 2', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(2);
        expect(suites[0].beforeEachHook).toBeDefined();
        expect(suites[1].beforeEachHook).toBeDefined();
        // each suite should have its own hook
        expect(suites[0].beforeEachHook).not.toBe(suites[1].beforeEachHook);
    });

    it('should allow suites without beforeEach', () => {
        describe('Suite without beforeEach', () => {
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].beforeEachHook).toBeUndefined();
    });

    it('should collect afterEach hooks', () => {
        let hookFn: (() => void) | undefined;

        describe('Test Suite with afterEach', () => {
            hookFn = () => {
                // cleanup logic
            };
            afterEach(hookFn);
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].afterEachHook).toBeDefined();
        expect(suites[0].afterEachHook).toBe(hookFn);
    });

    it('should throw error when afterEach is called outside describe', () => {
        expect(() => {
            afterEach(() => {
                // cleanup
            });
        }).toThrow('afterEach() must be called inside describe()');
    });

    it('should support evaluation.skip()', () => {
        describe('Suite with skipped test', () => {
            evaluation('normal test', async () => ({ score: 1 }));
            evaluation.skip('skipped test', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].evaluations).toHaveLength(2);
        expect(suites[0].evaluations[0].skip).toBeUndefined();
        expect(suites[0].evaluations[1].skip).toBe(true);
    });

    it('should support evaluation.only()', () => {
        describe('Suite with only test', () => {
            evaluation('normal test', async () => ({ score: 1 }));
            evaluation.only('only test', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].evaluations).toHaveLength(2);
        expect(suites[0].evaluations[0].only).toBeUndefined();
        expect(suites[0].evaluations[1].only).toBe(true);
    });

    it('should support describe.skip()', () => {
        describe('normal suite', () => {
            evaluation('test', async () => ({ score: 1 }));
        });

        describe.skip('skipped suite', () => {
            evaluation('test', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(2);
        expect(suites[0].skip).toBeUndefined();
        expect(suites[1].skip).toBe(true);
    });

    it('should support describe.only()', () => {
        describe('normal suite', () => {
            evaluation('test', async () => ({ score: 1 }));
        });

        describe.only('only suite', () => {
            evaluation('test', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(2);
        expect(suites[0].only).toBeUndefined();
        expect(suites[1].only).toBe(true);
    });

    it('should throw error when evaluation.skip is called outside describe', () => {
        expect(() => {
            evaluation.skip('invalid test', async () => ({ score: 1 }));
        }).toThrow('evaluation.skip() must be called inside describe()');
    });

    it('should throw error when evaluation.only is called outside describe', () => {
        expect(() => {
            evaluation.only('invalid test', async () => ({ score: 1 }));
        }).toThrow('evaluation.only() must be called inside describe()');
    });

    it('should collect beforeAll hooks', () => {
        let hookFn: (() => void) | undefined;

        describe('Test Suite with beforeAll', () => {
            hookFn = () => {
                // setup logic
            };
            beforeAll(hookFn);
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].beforeAllHook).toBeDefined();
        expect(suites[0].beforeAllHook).toBe(hookFn);
    });

    it('should throw error when beforeAll is called outside describe', () => {
        expect(() => {
            beforeAll(() => {
                // setup
            });
        }).toThrow('beforeAll() must be called inside describe()');
    });

    it('should collect afterAll hooks', () => {
        let hookFn: (() => void) | undefined;

        describe('Test Suite with afterAll', () => {
            hookFn = () => {
                // cleanup logic
            };
            afterAll(hookFn);
            evaluation('test case', async () => ({ score: 1 }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].afterAllHook).toBeDefined();
        expect(suites[0].afterAllHook).toBe(hookFn);
    });

    it('should throw error when afterAll is called outside describe', () => {
        expect(() => {
            afterAll(() => {
                // cleanup
            });
        }).toThrow('afterAll() must be called inside describe()');
    });

    it('should support evaluation.each() with object data', () => {
        describe('Suite with parametrized tests', () => {
            evaluation.each([
                { input: 'test1', expected: 'result1' },
                { input: 'test2', expected: 'result2' },
                { input: 'test3', expected: 'result3' },
            ])('testing $input', (data) => async () => ({
                score: data.input.includes('test') ? 1 : 0,
            }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].evaluations).toHaveLength(3);
        expect(suites[0].evaluations[0].name).toBe('testing test1');
        expect(suites[0].evaluations[1].name).toBe('testing test2');
        expect(suites[0].evaluations[2].name).toBe('testing test3');
    });

    it('should support evaluation.each() with primitive values', () => {
        describe('Suite with primitive parametrized tests', () => {
            evaluation.each([1, 2, 3])('testing number %i', (num) => async () => ({
                score: num > 0 ? 1 : 0,
            }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].evaluations).toHaveLength(3);
        expect(suites[0].evaluations[0].name).toBe('testing number 1');
        expect(suites[0].evaluations[1].name).toBe('testing number 2');
        expect(suites[0].evaluations[2].name).toBe('testing number 3');
    });

    it('should support evaluation.each() with no placeholders', () => {
        describe('Suite with parametrized tests without placeholders', () => {
            evaluation.each(['a', 'b', 'c'])('test case', (_val) => async () => ({
                score: 1,
            }));
        });

        const suites = getCollectedSuites();
        expect(suites).toHaveLength(1);
        expect(suites[0].evaluations).toHaveLength(3);
        expect(suites[0].evaluations[0].name).toBe('test case [0]');
        expect(suites[0].evaluations[1].name).toBe('test case [1]');
        expect(suites[0].evaluations[2].name).toBe('test case [2]');
    });

    it('should throw error when evaluation.each is called outside describe', () => {
        expect(() => {
            evaluation.each([1, 2, 3])('invalid test', (_data) => async () => ({ score: 1 }));
        }).toThrow('evaluation.each() must be called inside describe()');
    });
});
