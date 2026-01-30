
/**
 * General format for histories when prompting
 */
export interface Message {
    role: 'user' | 'system' | 'assistant';
    content: string;
}