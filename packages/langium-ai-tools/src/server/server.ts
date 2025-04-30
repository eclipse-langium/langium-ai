import express, { Request, Response } from 'express';
import { Evaluator } from '../evaluator/evaluator.js';

interface ServerConfig {
    port?: number;
    evaluators?: Record<string, Evaluator>;
}

export function startServer(config?: ServerConfig) {
    const app = express();
    app.use(express.json()); // Middleware to parse JSON request bodies

    /**
     * Health check endpoint
     */
    app.get('/ping', (req: Request, res: Response) => {
        res.status(200).send('pong');
    });

    /**
     * Report server capabilities
     */
    app.get('/capabilities', (req: Request, res: Response) => {
        const capabilities = {
            evaluators: Object.keys(config?.evaluators || {})
        };
        res.json(capabilities);
    });

    /**
     * Run a registered evaluator
     */
    app.post('/evaluate', async (req: Request, res: Response) => {
        const { evaluator: evaluatorName, program, expectedResponse } = req.body as { 
            evaluator?: string,
            program?: string,
            expectedResponse?: string
        };
        if (!evaluatorName) {
            res.status(400).json({ error: 'Evaluator is required' });
            return;
        }

        if (!program) {
            res.status(400).json({ error: 'Program is required' });
            return;
        }

        try {
            const evaluator = config?.evaluators?.[evaluatorName];
            if (!evaluator) {
                res.status(400).json({ error: `Evaluator not found: ${evaluatorName}` });
                return;
            }
            const result = await evaluator.evaluate(program, expectedResponse ?? "");
            res.json({ result });
        } catch (error) {
            res.status(500).json({ error: 'An error occurred while evaluating DSL' });
        }
    });

    // Start the server
    const PORT = config?.port || 8080;
    app.listen(PORT, () => {
        console.log(`Langium AI REST API server is running on port ${PORT}`);
    });
}
