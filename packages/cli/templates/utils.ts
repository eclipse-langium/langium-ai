// ============================================================================
// Langium AI — Evaluation Utilities
// ============================================================================
//
// This file provides the helper functions used by your evaluation files
// (*.eval.ts). The most important one is `generateResponse()` — it's the
// bridge between your evaluations and your LLM provider.
//
// SETUP CHECKLIST
// ───────────────
// 1. Pick an LLM provider (OpenAI, Anthropic, Ollama, etc.)
// 2. Install its SDK:  npm install openai  /  npm install @anthropic-ai/ / etc.
// 3. Set your API key as an environment variable (see examples below)
// 4. Replace the `throw new Error(...)` in `generateResponse()` with a real
//    implementation — complete examples are provided for each provider.
//
// Once `generateResponse()` works, run:  lai evaluate
//
// ============================================================================

// ── Options passed to generateResponse() ────────────────────────────────────
// These are forwarded from your evaluation cases. The most important field is
// `systemPrompt` — it contains your DSL grammar, examples, and documentation,
// generated via `lai gen sysprompt`. Passing it to the LLM is what teaches it
// your language.
export interface GenerateOptions {
    // the system prompt that describes your DSL to the LLM (auto-generated)
    systemPrompt?: string;

    // controls randomness: 0 = deterministic, 1 = creative (default: 0.7)
    temperature?: number;

    // maximum tokens in the LLM's response (default: 2048)
    maxTokens?: number;
}

// ============================================================================
// generateResponse() — YOUR LLM INTEGRATION GOES HERE
// ============================================================================
//
// This function is called by every evaluation case. It sends a prompt to your
// LLM and returns the raw text response. Pick one of the examples below,
// uncomment it, and delete the `throw` statement.



// ── Example: OpenAI ─────────────────────────────────────────────────────────
//
//   import OpenAI from 'openai';
//   const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
//
//   export async function generateResponse(
//       prompt: string,
//       options: GenerateOptions = {}
//   ): Promise<string> {
//       const response = await client.chat.completions.create({
//           model: 'gpt-4o',
//           messages: [
//               { role: 'system', content: options.systemPrompt || '' },
//               { role: 'user', content: prompt }
//           ],
//           temperature: options.temperature ?? 0.7,
//           max_tokens: options.maxTokens ?? 2048
//       });
//       return response.choices[0].message.content || '';
//   }



// ── Example: Anthropic Claude ───────────────────────────────────────────────
//
//   import Anthropic from '@anthropic-ai/sdk';
//   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//
//   export async function generateResponse(
//       prompt: string,
//       options: GenerateOptions = {}
//   ): Promise<string> {
//       const response = await client.messages.create({
//           model: 'claude-sonnet-4-5',
//           system: options.systemPrompt || '',
//           messages: [{ role: 'user', content: prompt }],
//           temperature: options.temperature ?? 0.7,
//           max_tokens: options.maxTokens ?? 2048
//       });
//       return response.content[0].type === 'text' ? response.content[0].text : '';
//   }



// ── Example: Ollama (local, no API key needed) ──────────────────────────────
// import ollama from 'ollama'
//
// export async function generateResponse(
//     prompt: string,
//     options: GenerateOptions = {}
// ): Promise<string> {
//     const messages: { role: 'system' | 'user'; content: string }[] = [];
//     if (options.systemPrompt) {
//         messages.push({ role: 'system', content: options.systemPrompt });
//     }
//     messages.push({ role: 'user', content: prompt });

//     const response = await ollama.chat({
//         model: MODEL,
//         messages,
//         options: {
//             temperature: options.temperature ?? 0.7,
//             num_predict: options.maxTokens ?? 2048
//         }
//     });

//     return response.message.content || '';
// }
//
// ============================================================================

export async function generateResponse(
    prompt: string,
    options: GenerateOptions = {}
): Promise<string> {
    // ⬇ delete this error and replace with one of the examples above
    throw new Error(
        'generateResponse() is not implemented yet.\n' +
        'Open utils.ts and replace this function body with your LLM provider code.\n' +
        'See the commented examples above for OpenAI, Anthropic Claude, and Ollama.'
    );
}

// ============================================================================
// extractCodeBlock() — Pull code out of markdown fences
// ============================================================================
// LLMs often wrap their output in markdown code fences like:
//
//   ```mydsl
//   entity Person { name: string }
//   ```
//
// This helper extracts just the code inside the fence so you can pass clean
// input to the evaluator. If no code fence is found it returns null, so your
// eval can fall back to the raw response:
//
//   const code = extractCodeBlock(response) || response;
//
// You can optionally pass a language identifier to match a specific fence:
//
//   extractCodeBlock(response, 'mydsl')  — only matches ```mydsl ... ```
//
export function extractCodeBlock(text: string, language?: string): string | null {
    const pattern = language
        ? new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``)
        : /```[\w-]*\n([\s\S]*?)```/;
    const match = text.match(pattern);
    return match ? match[1].trim() : null;
}

// ============================================================================
// calculateSimilarity() — Simple text similarity (0–1)
// ============================================================================
/**
 * Computes a normalized similarity score between two strings using Levenshtein
 * distance. Useful for evaluations where you have a known "expected" output
 * and want to measure how close the LLM got.
 *
 * Returns:
 *   1.0 — strings are identical (after trim + lowercase)
 *   0.0 — one or both strings are empty
 *   0.x — partial match, higher is more similar
 *
 * Note: this is a character-level comparison. For more sophisticated checks
 * you could compare ASTs, use embedding similarity, or write custom matchers.
 *
 */
export function calculateSimilarity(actual: string, expected: string): number {
    const s1 = actual.trim().toLowerCase();
    const s2 = expected.trim().toLowerCase();

    if (s1 === s2) {
        return 1.0;
    }
    if (s1.length === 0 || s2.length === 0) {
        return 0.0;
    }

    const distance = levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - (distance / maxLength);
}

/**
 * Levenshtein distance between two strings (used internally by calculateSimilarity)
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
}
