/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import OpenAI from 'openai';
import ollama from 'ollama';
import { Message, Runner } from 'langium-ai-tools';
import { ChromaClient } from 'chromadb';

async function prompt(model: string, messages: any[]) {
    const response = await ollama.chat({
        model, messages
    });
    return response;
}

/**
 * Construct a runner for a model provided by Ollama
 */
function getOllamaRunner(name: string, model: string): Runner {
    return {
        name,
        runner: async (content: string, messages: Message[] = []) => {
            const newMsgs = [...messages, { role: 'user', content }];
            return (await prompt(model, newMsgs)).message.content;
        }
    };
}

/**
 * Helper to wrap retrieved documents for RAG in a system message
 */
async function getRagSystemMessage(content: string): Promise<Message> {
    return {
        role: 'system',
        content: `Additionally, utilize the following context to answer the user's question: \n\n${(await ragLookup(content)).join('\n======\n')}`
    };
}

const LangiumDSLCollection = "langium-collection";

/**
 * Helper to perform a ChromaDB lookup to provide context for a RAG application, given some content
 */
async function ragLookup(content: string): Promise<string[][]> {
    // perform a database lookup first here via chroma
    const client = new ChromaClient({ path: 'http://localhost:8000' });

    // create a collection
    const collection = await client.getCollection({
        name: LangiumDSLCollection,
        embeddingFunction: {
            generate: async (texts: string[]) => {
                return (await ollama.embed({
                    model: 'mxbai-embed-large',
                    input: texts,
                    keep_alive: 30
                })).embeddings;
            }
        }
    });

    // embed
    const queryEmbeddings = (await ollama.embed({
        model: 'mxbai-embed-large',
        input: content,
        keep_alive: 30
    })).embeddings;

    // query
    const results = await collection.query({
        queryEmbeddings,
        nResults: 3,
    });

    return results.documents as string[][];
}

/**
 * Construct a runner w/ RAG for a model provided by Ollama
 */
function getOllamaRAGRunner(name: string, model: string): Runner {
    return {
        name,
        runner: async (content: string, messages: Message[] = []) => {
            const newMsgs = [await getRagSystemMessage(content), ...messages, { role: 'user', content }];
            return (await prompt(model, newMsgs)).message.content;
        }
    };
}

// ollama runners
export const runner_llama3_2_3b = getOllamaRunner('llama3.2 3B', 'llama3.2:latest');
export const runner_llama3_2_1b = getOllamaRunner('llama3.2 1B', 'llama3.2:1b');
export const runner_llama3_1 = getOllamaRunner('llama3.1', 'llama3.1');
export const runner_codellama = getOllamaRunner('codellama', 'codellama');
export const runner_codegemma = getOllamaRunner('codegemma', 'codegemma');
export const runner_deepseek_coder_v2 = getOllamaRunner('deepseek-coder-v2', 'deepseek-coder-v2');
export const runner_qwen_2_5_coder = getOllamaRunner('qwen-2.5-coder 7B', 'qwen2.5-coder');

// RAG ollama runners
export const runner_llama3_2_3b_rag = getOllamaRAGRunner('llama3.2 3B w/ RAG', 'llama3.2:latest');
export const runner_llama3_2_1b_rag = getOllamaRAGRunner('llama3.2 1B w/ RAG', 'llama3.2:1b');
export const runner_llama3_1_rag = getOllamaRAGRunner('llama3.1 w/ RAG', 'llama3.1');
export const runner_codellama_rag = getOllamaRAGRunner('codellama w/ RAG', 'codellama:latest');
export const runner_codegemma_rag = getOllamaRAGRunner('codegemma w/ RAG', 'codegemma:latest');
export const runner_deepseek_coder_v2_rag = getOllamaRAGRunner('deepseek-coder-v2 w/ RAG', 'deepseek-coder-v2');
export const runner_qwen_2_5_coder_rag = getOllamaRAGRunner('qwen-2.5-coder 7B w/ RAG', 'qwen2.5-coder');



export const runner_openai_gpt3_5_turbo: Runner = {
    name: 'openai-gpt3',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-3.5-turbo-0125',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};

export const runner_openai_gpt3_5_turbo_rag: Runner = {
    name: 'openai-gpt3.5-turbo-rag',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [await getRagSystemMessage(content), ...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-3.5-turbo-0125',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};

export const runner_openai_gpt4o_mini: Runner = {
    name: 'openai-gpt4o-mini',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-4o-mini',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};

export const runner_openai_gpt4o: Runner = {
    name: 'openai-gpt4o',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-4o',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};

export const runner_openai_gpt4o_rag: Runner = {
    name: 'openai-gpt4o-rag',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [await getRagSystemMessage(content), ...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-4o',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};

export const runner_openai_gpt4o_mini_rag: Runner = {
    name: 'openai-gpt4o-mini-rag',
    runner: async (content: string, messages: Message[] = []) => {
        const newMsgs = [await getRagSystemMessage(content), ...messages, { role: 'user', content }];

        const client = new OpenAI({
            apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
        });

        // prompt & return the first choice
        const chatCompletion = await client.chat.completions.create({
            messages: newMsgs as any,
            model: 'gpt-4o-mini',
        });
        return chatCompletion.choices[0].message.content as string;
    }
};