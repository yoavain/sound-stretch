// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { spawn } from "child_process";
import type { Readable } from "stream";
import type { ConversionResult } from "./types";
import * as console from "node:console";

const SOUNDSTRETCH_EXECUTABLE: string = process.env.SOUNDSTRETCH_EXECUTABLE;


const ratioToPercentageChange = (ratio: number): number => {
    if (ratio <= 0) {
        throw new Error("Ratio must be greater than 0");
    }

    return (ratio - 1) * 100;
};

/**
 * Changes the tempo of a WAV audio stream using soundstretch
 *
 * @param inputStream - Readable stream containing WAV audio data
 * @param tempoRatio - target tempo ratio (1.0 is no change, >1.0 for speed up, <1.0 for slow down)
 * @returns ConversionResult - Returns a readable stream and a completion promise
 * @throws Error if the tempo change is out of valid range or if soundstretch process fails
 */
export function changeTempo(inputStream: Readable, tempoRatio: number): ConversionResult {
    // Validate tempo ratio range according to documentation
    if (tempoRatio <= 0.1 || tempoRatio > 10) {
        throw new Error("Tempo change must be between -60 and +60 semitones");
    }

    const tempoPercentage: number = ratioToPercentageChange(tempoRatio);

    // Spawn soundstretch process with stdin/stdout pipes
    const soundstretch = spawn(SOUNDSTRETCH_EXECUTABLE, [
        "stdin",
        "stdout",
        `-tempo=${tempoPercentage.toFixed(1)}`
    ]);

    // Pipe input stream to soundstretch's stdin
    inputStream.pipe(soundstretch.stdin);

    // Create promise that resolves when processing is complete
    const completed = new Promise<void>((resolve, reject) => {
        // Handle potential errors
        soundstretch.on("error", (error) => {
            reject(new Error(`Failed to start soundstretch process: ${error.message}`));
        });

        soundstretch.stderr.on("data", (data) => {
            console.error(`soundstretch stderr: ${data}`);
        });

        soundstretch.on("exit", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`soundstretch process exited with code ${code}`));
            }
        });
    });

    return {
        stream: soundstretch.stdout,
        completed
    };
}
