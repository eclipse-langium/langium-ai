How to try-out:

- `cd packages/langium-ai-mcp`
- Start MCP server with IO transport `npm run start`
- Run example client code `npm run cstart` - you should see the tool result containing the errors.

Example usage in Cursor:

- Open Cursor MCP settings
- Add new server using following setup (user or workspace specific `.cursor/mcp.json` ):

```json
"mcpServers": {
    "Langium MCP": {
        "command": "node",
        "args": [
            "~/git/langium-ai/packages/mcp-server/dist/mcp-server.js"
        ]
    }
}
```
