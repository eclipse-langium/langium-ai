import { styleText } from 'node:util';
import yoctoSpinner, { Spinner } from 'yocto-spinner';

// console output helpers with colors and spinners

type Style = Parameters<typeof styleText>[0];

/**
 * Helper for invoking 'styleText' natively
 */
export function st(styles: Style, text: string): string {
    return styleText(styles, text);
}

export function info(message: string): void {
    console.log(st('blue', 'ℹ'), message);
}

export function success(message: string): void {
    console.log(st('green', '✓'), message);
}

export function error(message: string): void {
    console.log(st('red', '✗'), message);
}

export function warning(message: string): void {
    console.log(st('yellow', '⚠'), message);
}

export function header(message: string): void {
    console.log();
    console.log(st('bold', message));
    console.log();
}

export function section(title: string): void {
    console.log();
    console.log(st(['cyan', 'bold'], `📁 ${title}`));
}

export function spinner(message: string): Spinner {
    return yoctoSpinner({
        text: message
    }).start();
}

export function logDetected(label: string, value: string, detected: boolean = true): void {
    const icon = detected ? st('green', '✓') : st('gray', '•');
    const labelFormatted = st('gray', `${label}:`);
    console.log(`  ${icon} ${labelFormatted.padEnd(20)} ${value}`);
}
