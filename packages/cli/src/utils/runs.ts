import fs from 'fs-extra';
import path from 'path';
import type { EvaluationCaseResult } from 'langium-ai-tools/evals';

/**
 * evaluation run data with metadata wrapper
 */
export interface EvaluationRunData {
    runId: number;
    timestamp: string;
    tags: string[];
    syspromptPath: string;
    totalTime: number;
    results: EvaluationCaseResult[];
}

/**
 * summary statistics for a run
 */
export interface RunSummary {
    runId: number;
    timestamp: Date;
    fileName: string;
    tags: string[];
    total: number;
    skipped: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    avgDuration: number;
    totalTime: number;
    syspromptPath: string;
}

/**
 * run file metadata
 */
export interface RunFile {
    path: string;
    fileName: string;
    data: EvaluationRunData;
}

/**
 * get the evaluation logs directory
 */
function getLogsDir(): string {
    return path.join(process.cwd(), '.langium-ai');
}

/**
 * get all evaluation run files sorted by runId (descending)
 */
export async function getAllRunFiles(): Promise<RunFile[]> {
    const logsDir = getLogsDir();

    if (!(await fs.pathExists(logsDir))) {
        return [];
    }

    const files = await fs.readdir(logsDir);
    const evalFiles = files.filter((f) => f.startsWith('eval-') && f.endsWith('.json'));

    const runFiles: RunFile[] = [];

    for (const fileName of evalFiles) {
        const filePath = path.join(logsDir, fileName);
        try {
            const data = await loadRunData(filePath);
            runFiles.push({ path: filePath, fileName, data });
        } catch (err) {
            // skip invalid files
            console.warn(`Warning: Failed to load ${fileName}:`, err instanceof Error ? err.message : String(err));
        }
    }

    // sort by runId descending (newest first)
    runFiles.sort((a, b) => b.data.runId - a.data.runId);

    return runFiles;
}

/**
 * load run data from a file, handling both old and new formats
 */
export async function loadRunData(filePath: string): Promise<EvaluationRunData> {
    const content = await fs.readJSON(filePath);

    // detect old format (array at root)
    if (Array.isArray(content)) {
        // migrate in-memory: assign runId 0, extract timestamp from filename
        const fileName = path.basename(filePath);
        const timestampMatch = fileName.match(/eval-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.json/);

        let timestamp: string;
        if (timestampMatch) {
            // convert filename timestamp to ISO format
            const parts = timestampMatch[1].split('-');
            timestamp = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}.000Z`;
        } else {
            // fallback to file modification time
            const stats = await fs.stat(filePath);
            timestamp = stats.mtime.toISOString();
        }

        // calculate total time from results
        const totalTime = content.reduce((sum, r: EvaluationCaseResult) => sum + (r.metadata.duration || 0), 0);

        return {
            runId: 0,
            timestamp,
            tags: [],
            syspromptPath: '',
            totalTime,
            results: content,
        };
    }

    // new format (wrapper object)
    return content as EvaluationRunData;
}

/**
 * get the next available run ID
 */
export async function getNextRunId(): Promise<number> {
    const files = await getAllRunFiles();

    if (files.length === 0) {
        return 1;
    }

    // find max runId
    const maxId = Math.max(...files.map((f) => f.data.runId));
    return maxId + 1;
}

/**
 * get a run by ID, 'latest', or file path
 */
export async function getRunById(idOrLatestOrPath: string | number): Promise<RunFile | null> {
    // check if it's a file path (ends with .json and exists)
    if (typeof idOrLatestOrPath === 'string' && idOrLatestOrPath.endsWith('.json')) {
        try {
            // resolve path (could be relative or absolute)
            const filePath = path.isAbsolute(idOrLatestOrPath)
                ? idOrLatestOrPath
                : path.join(process.cwd(), idOrLatestOrPath);

            // check if file exists
            if (await fs.pathExists(filePath)) {
                const data = await loadRunData(filePath);
                const fileName = path.basename(filePath);
                return { path: filePath, fileName, data };
            }
        } catch (err) {
            // if loading fails, fall through to ID-based lookup
            console.warn(
                `Warning: Failed to load file ${idOrLatestOrPath}:`,
                err instanceof Error ? err.message : String(err),
            );
            return null;
        }
    }

    const files = await getAllRunFiles();

    if (files.length === 0) {
        return null;
    }

    if (idOrLatestOrPath === 'latest') {
        // return the run with highest runId (first in sorted array)
        return files[0];
    }

    const id = typeof idOrLatestOrPath === 'string' ? parseInt(idOrLatestOrPath, 10) : idOrLatestOrPath;
    if (isNaN(id)) {
        return null;
    }

    return files.find((f) => f.data.runId === id) || null;
}

/**
 * calculate summary statistics for a run
 */
export function calculateRunSummary(run: EvaluationRunData, fileName: string): RunSummary {
    const total = run.results.length;
    const skipped = run.results.filter((r) => r.data.skipped).length;

    const ranTests = run.results.filter((r) => !r.data.skipped);
    const avgScore = ranTests.length > 0 ? ranTests.reduce((sum, r) => sum + r.data.score, 0) / ranTests.length : 0;
    const minScore = ranTests.length > 0 ? Math.min(...ranTests.map((r) => r.data.score)) : 0;
    const maxScore = ranTests.length > 0 ? Math.max(...ranTests.map((r) => r.data.score)) : 0;
    const avgDuration =
        ranTests.length > 0 ? ranTests.reduce((sum, r) => sum + (r.metadata.duration || 0), 0) / ranTests.length : 0;

    return {
        runId: run.runId,
        timestamp: new Date(run.timestamp),
        fileName,
        tags: run.tags,
        total,
        skipped,
        avgScore,
        minScore,
        maxScore,
        avgDuration,
        totalTime: run.totalTime,
        syspromptPath: run.syspromptPath,
    };
}

/**
 * save run data to file
 */
export async function saveRunData(data: EvaluationRunData): Promise<string> {
    const logsDir = getLogsDir();
    await fs.ensureDir(logsDir);

    // generate timestamp for filename: YYYY-MM-DD-HH-mm-ss
    const timestamp = new Date(data.timestamp).toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '-');

    const fileName = `eval-${timestamp}.json`;
    const filePath = path.join(logsDir, fileName);

    await fs.writeJSON(filePath, data, { spaces: 2 });

    return filePath;
}

/**
 * add tags to an existing run
 */
export async function addTagsToRun(idOrLatestOrPath: number | string, tags: string[]): Promise<void> {
    const run = await getRunById(idOrLatestOrPath);

    if (!run) {
        throw new Error(`Run not found: ${idOrLatestOrPath}`);
    }

    // add new tags (avoid duplicates)
    const existingTags = new Set(run.data.tags);
    for (const tag of tags) {
        existingTags.add(tag);
    }

    run.data.tags = Array.from(existingTags);

    // save back to file
    await fs.writeJSON(run.path, run.data, { spaces: 2 });
}

/**
 * delete run files by IDs
 */
export async function deleteRuns(runIds: number[]): Promise<void> {
    const files = await getAllRunFiles();

    for (const runId of runIds) {
        const file = files.find((f) => f.data.runId === runId);
        if (file) {
            await fs.remove(file.path);
        }
    }
}
