import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDisplayName } from "@modelcontextprotocol/sdk/shared/metadataUtils.js";

const transport = new StdioClientTransport({
    command: "node",
    args: [ "./dist/mcp-server.js"]
});

const client = new Client(
    {
        name: "example-client",
        version: "1.0.0"
    }
);

await client.connect(transport);

const tools = await client.listTools();
console.log("Available tools:", "\n", ...tools.tools.map(t => getDisplayName(t) + "\n"));

const theTool = tools.tools[0];
if (!theTool) {
    throw new Error("No tool available");
}

const result = await client.callTool({
    name: theTool.name,
    arguments: {
        code: 'syntax error'
    }
});

console.log("Tool result:", result.content);

// exit the process
process.exit(0);