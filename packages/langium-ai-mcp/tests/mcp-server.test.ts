import { describe, expect, it } from 'vitest';

import { validateLangiumCode } from '../src/mcp-server';

describe('validateLangiumCode', () => {


    it('should return undefined for valid grammar code', async () => {
        const validCode = `
                grammar HelloWorld
                
                entry Model: persons+=Person*;
                Person: 'person' name=ID;
                hidden terminal WS: /\\s+/;
                terminal ID: /[_a-zA-Z][\\w_]*/;
            `;

        const result = await validateLangiumCode(validCode);
        expect(result).toBeUndefined();
    });

    it('should return diagnostics for invalid grammar code', async () => {
        const invalidCode = `
            grammar HelloWorld
            entry Model: persons+=Person*;
        `;

        const result = await validateLangiumCode(invalidCode);
        expect(result).toBeDefined();
        expect(result).toContain("Error: Could not resolve reference to AbstractRule named 'Person'. at line 3, column 35");
    });
});
