import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LangiumEvaluator } from 'langium-ai-tools';
import { EmptyFileSystem } from 'langium';
import { {{ CREATE_LANGUAGE_SERVICES }} } from '{{ SERVICES_MODULE_PATH }}';
import { z } from 'zod';

// initialize language services and evaluator
const services = {{ CREATE_LANGUAGE_SERVICES }}(EmptyFileSystem).{{ LANGUAGE_SERVICES }};
const evaluator = new LangiumEvaluator(services);

const server = new McpServer({
    name: '{{ SERVER_NAME }}',
    version: '1.0.0',
});

// validate — accepts code, returns diagnostics
server.registerTool(
    '{{ TOOL_PREFIX }}-validate',
    {
        title: '{{ DISPLAY_NAME }} Validator',
        description: 'Validates {{ DISPLAY_NAME }} code and returns diagnostics',
        inputSchema: { code: z.string().describe('The {{ DISPLAY_NAME }} code to validate') },
    },
    async ({ code }) => {
        const result = await evaluator.evaluate(code);
        const diagnostics = result.data?.diagnostics ?? [];

        if (diagnostics.length === 0) {
            return {
                content: [{ type: 'text', text: 'No issues found. The code is valid.' }],
            };
        }

        const formatted = diagnostics
            .map(
                (d) =>
                    `${severityText(d.severity)}: ${d.message} at line ${d.range.start.line + 1}, column ${d.range.start.character + 1}`,
            )
            .join('\n');

        return {
            content: [{ type: 'text', text: formatted }],
        };
    },
);

function severityText(severity: number | undefined): string {
    switch (severity) {
        case 1:
            return 'Error';
        case 2:
            return 'Warning';
        case 3:
            return 'Information';
        case 4:
            return 'Hint';
        default:
            return 'Unknown';
    }
}

// start the server
const transport = new StdioServerTransport();
await server.connect(transport);
