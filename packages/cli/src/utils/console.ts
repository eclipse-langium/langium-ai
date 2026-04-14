import chalk from 'chalk';
import ora, { Ora } from 'ora';

// console output helpers with colors and spinners

export function info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
}

export function success(message: string): void {
    console.log(chalk.green('✓'), message);
}

export function error(message: string): void {
    console.log(chalk.red('✗'), message);
}

export function warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
}

export function header(message: string): void {
    console.log();
    console.log(chalk.bold(message));
    console.log();
}

export function section(title: string): void {
    console.log();
    console.log(chalk.cyan.bold(`📁 ${title}`));
}

export function spinner(message: string): Ora {
    return ora(message).start();
}

export function logDetected(label: string, value: string, detected: boolean = true): void {
    const icon = detected ? chalk.green('✓') : chalk.gray('•');
    const labelFormatted = chalk.gray(`${label}:`);
    console.log(`  ${icon} ${labelFormatted.padEnd(20)} ${value}`);
}
