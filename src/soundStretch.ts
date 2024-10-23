// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { spawn } from "child_process";
import type { Readable } from "stream";
import type { ConversionBlock, ConversionResult, Logger } from "./types";
import path from "node:path";

// Allow overriding soundstretch executable path with environment variable (for dev envs)
const SOUNDSTRETCH_EXECUTABLE: string = process.env.SOUNDSTRETCH_EXECUTABLE ||
    (process.platform === "win32" ? path.resolve(__dirname, "./bin/win-x86_64/soundstretch.exe") : path.resolve(__dirname, "./bin/amazon-linux-2023-x86_64/soundstretch"));

const SOUNDSTRETCH_TIMEOUT = 10000;

const ratioToPercentageChange = (ratio: number, logger: Logger): string => {
    if (ratio <= 0) {
        logger.error(`Ratio ${ratio} is invalid. Must be greater than 0`);
        throw new Error("Ratio must be greater than 0");
    }

    // Assuming ratio is already rounded to 2 decimal places
    return ((ratio - 1) * 100).toFixed(0);
};

/**
 * Changes the tempo of a WAV audio stream using soundstretch
 *
 * @param inputStream Readable stream containing WAV audio data
 * @param tempoRatio target tempo ratio (1.0 is no change, >1.0 for speed up, <1.0 for slow down)
 * @param logger Optional logger
 * @returns ConversionResult Returns a readable stream and a completion promise
 */
export const changeTempo: ConversionBlock<[number?]> = (inputStream: Readable, tempoRatio: number, logger?: Logger): ConversionResult => {
    if (tempoRatio === 1) {
        return { stream: inputStream, completed: Promise.resolve() };
    }

    // Validate tempo ratio range according to documentation
    if (tempoRatio < 0.25 || tempoRatio > 4) {
        throw new Error("Tempo change must be between 0.25 and 4.0");
    }

    const tempoPercentage: string = ratioToPercentageChange(tempoRatio, logger);
    logger.info(`Calling soundstretch with parameters: -tempo=${tempoPercentage} -speech`);

    // Spawn soundstretch process with stdin/stdout pipes
    const soundstretch = spawn(SOUNDSTRETCH_EXECUTABLE, [
        "stdin",
        "stdout",
        `-tempo=${tempoPercentage}`,
        "-speech"
    ]);

    // Pipe input stream to soundstretch's stdin
    inputStream.pipe(soundstretch.stdin);

    // Create promise that resolves when processing is complete
    const completed = new Promise<void>((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                const errorMessage: string = `soundstretch timed out after ${SOUNDSTRETCH_TIMEOUT}ms`;
                const error = new Error(errorMessage);
                logger.error(errorMessage);
                reject(error);
            }
        }, SOUNDSTRETCH_TIMEOUT);

        // Handle potential errors
        soundstretch.on("error", (error) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                logger.error(`Failed to start soundstretch process: ${error.message}`);
                reject(new Error(`Failed to start soundstretch process: ${error.message}`));
            }
        });

        soundstretch.stderr.on("data", (data) => {
            // Log soundstretch stderr is its log
            logger.info(`soundstretch: ${data}`);
        });

        soundstretch.on("exit", (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                if (code === 0) {
                    resolve();
                }
                else {
                    logger.error(`soundstretch process exited with code ${code}`);
                    reject(new Error(`soundstretch process exited with code ${code}`));
                }
            }
        });
    });

    return {
        stream: soundstretch.stdout,
        completed
    };
};
