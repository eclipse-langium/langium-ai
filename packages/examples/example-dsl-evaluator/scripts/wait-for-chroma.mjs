/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

// polls the Chroma v2 heartbeat until the server is ready (or times out).
// the chromadb/chroma image ships no curl/wget/python, so we probe from the
// host after `docker compose up -d` instead of using a container healthcheck.

const url = process.env.CHROMA_URL ?? 'http://localhost:8000';
const heartbeat = `${url}/api/v2/heartbeat`;
const timeoutMs = 60_000;
const intervalMs = 1_000;
const start = Date.now();

process.stdout.write(`Waiting for Chroma at ${heartbeat} `);

while (Date.now() - start < timeoutMs) {
    try {
        const res = await fetch(heartbeat);
        if (res.ok) {
            console.log('\nChroma is ready.');
            process.exit(0);
        }
    } catch {
        // server not accepting connections yet; keep polling
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`\nTimed out after ${timeoutMs / 1000}s waiting for Chroma. Is Docker running?`);
process.exit(1);
