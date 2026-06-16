// build-time script: reads template files, compresses + base64-encodes them,
// and writes a generated src/templates.ts that can decode them at runtime.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, '..', 'templates');
const outFile = join(__dirname, '..', 'src', 'templates.ts');

const files = readdirSync(templatesDir).filter((f) => f.endsWith('.ts'));

// build a map of filename -> compressed base64 content
const entries = [];
for (const file of files) {
    const content = readFileSync(join(templatesDir, file), 'utf-8');
    const compressed = deflateSync(Buffer.from(content, 'utf-8'));
    const encoded = compressed.toString('base64');
    entries.push({ name: file, encoded });
}

const lines = [
    '// AUTO-GENERATED — do not edit. Run `npm run embed-templates` to regenerate.',
    "import { inflateSync } from 'node:zlib';",
    '',
    'const TEMPLATES: Record<string, string> = {',
];

for (const { name, encoded } of entries) {
    lines.push(`    '${name}': '${encoded}',`);
}

lines.push('};');
lines.push('');
lines.push('/**');
lines.push(' * Retrieves an embedded template by filename.');
lines.push(' * Decompresses the stored base64+deflate content at runtime.');
lines.push(' */');
lines.push('export function getTemplate(name: string): string {');
lines.push('    const encoded = TEMPLATES[name];');
lines.push('    if (!encoded) {');
lines.push("        throw new Error(`Unknown template: ${name}. Available: ${Object.keys(TEMPLATES).join(', ')}`);");
lines.push('    }');
lines.push("    return inflateSync(Buffer.from(encoded, 'base64')).toString('utf-8');");
lines.push('}');
lines.push('');

writeFileSync(outFile, lines.join('\n'), 'utf-8');
console.log(`Embedded ${entries.length} template(s) into ${outFile}`);
