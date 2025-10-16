import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LangiumEvaluator, type LangiumEvaluatorResultData } from 'langium-ai-tools';
import { createLangiumGrammarServices } from 'langium/grammar';

import { NodeFileSystem } from 'langium/node';
import { z } from 'zod';

const server = new McpServer({
    name: 'langium-mpc-server',
    version: '1.0.0'
});

server.registerTool('langium-syntax-checker',
    {
        title: 'Langium Evaluator Tool',
        description: 'Checks Langium code for errors',
        inputSchema: { code: z.string() }
    },
    async ({ code }) => {
        const validationResult = await validateLangiumCode(code);
        return {
            content: [
                {
                    type: 'text',
                    text: validationResult ?? 'The provided Langium code has no issues.'
                }
            ]
        }
    }
);

export const langiumEvaluator = new LangiumEvaluator(createLangiumGrammarServices(NodeFileSystem).grammar);

export async function validateLangiumCode(code: string): Promise<string | undefined> {
    const evalResult = await langiumEvaluator.evaluate(code);
    if (evalResult.data) {
        const langiumData = evalResult.data as LangiumEvaluatorResultData;
        if (langiumData.diagnostics.length > 0) {
            return langiumData.diagnostics.map(d =>
                `${asText(d.severity)}: ${d.message} at line ${d.range.start.line + 1}, column ${d.range.start.character + 1}`
            ).join('\n');
        }
    }
    return undefined;
}

function asText(severity: number | undefined): string {

    switch (severity) {
        case 1: return 'Error';
        case 2: return 'Warning';
        case 3: return 'Information';
        case 4: return 'Hint';
        default: return 'Unknown';
    }
}

const transport = new StdioServerTransport();
await server.connect(transport);
