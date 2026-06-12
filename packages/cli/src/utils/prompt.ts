import * as readline from 'node:readline';

function createInterface(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stderr,
    });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

/**
 * Prompt the user for a yes/no confirmation.
 * Returns the boolean result, or `initial` if the user presses Enter with no input.
 */
export async function confirm(message: string, initial = false): Promise<boolean> {
    const hint = initial ? '[Y/n]' : '[y/N]';
    const rl = createInterface();
    try {
        const answer = (await ask(rl, `${message} ${hint} `)).trim().toLowerCase();
        if (answer === '') {
            return initial;
        }
        return answer === 'y' || answer === 'yes';
    } finally {
        rl.close();
    }
}

/**
 * Prompt the user for a text value.
 * Returns the string result, or `initial` if the user presses Enter with no input.
 * Returns undefined if the user sends EOF (Ctrl+D).
 */
export async function text(message: string, initial?: string): Promise<string | undefined> {
    const hint = initial ? ` (${initial})` : '';
    const rl = createInterface();
    try {
        const answer = (await ask(rl, `${message}${hint}: `)).trim();
        if (answer === '' && initial !== undefined) {
            return initial;
        }
        return answer || undefined;
    } finally {
        rl.close();
    }
}
