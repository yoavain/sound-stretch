// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import type { AUDIO_FORMAT, ConversionBlock, ConversionResult, Logger } from "./types";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import ffmpeg from "fluent-ffmpeg";
import { NeutralConversionOptions } from "./consts";

const FFMPEG_TIMEOUT = 10000;

const isVolumeChangeRequired = (volume?: number): boolean => {
    return volume !== undefined && volume !== NeutralConversionOptions.volume;
};

const roundTwoDigits = (ratio: number) => {
    return Math.round(ratio * 100) / 100;
};

const getVolumeDb = (volume: number): string => {
    if (volume < 0.1 || volume > 1.2) {
        throw new Error("Volume must between 0.1 and 1.2");
    }

    // Round to 2 decimal places
    return roundTwoDigits(Math.log10(volume) * 20).toFixed(2);
};


/**
 * Converts an audio stream from one format to another, with optional volume adjustment
 *
 * @param inputStream Readable stream containing audio data
 * @param inputFormat Input stream format
 * @param outputFormat Output stream format
 * @param volume Volume adjustment (0.1 - 1.2)
 * @param logger Optional logger
 * @returns ConversionResult Returns a readable stream and a completion promise
 */
export const convertAudioFfmpeg: ConversionBlock<[AUDIO_FORMAT, AUDIO_FORMAT, number?]> =
    (inputStream: Readable, inputFormat: AUDIO_FORMAT, outputFormat: AUDIO_FORMAT, volume? : number, logger?: Logger): ConversionResult => {
        const volumeChangeRequired: boolean = isVolumeChangeRequired(volume);

        // Short path (no format change or volume change)
        if (inputFormat === outputFormat && !volumeChangeRequired) {
            return {
                stream: inputStream,
                completed: Promise.resolve()
            };
        }

        const passThrough = new PassThrough();

        const ffmpegCommand = ffmpeg()
            .input(inputStream)
            .inputFormat(inputFormat)
            .toFormat(outputFormat)
            .inputOptions(["-analyzeduration 0"]);

        if (volumeChangeRequired) {
            const volumeDb: string = getVolumeDb(volume);
            ffmpegCommand.audioFilters(`volume=${volumeDb}dB`);
        }

        ffmpegCommand.pipe(passThrough, { end: true });

        const completed = new Promise<void>((resolve, reject) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    const errorMessage: string = `FFmpeg conversion timed out after ${FFMPEG_TIMEOUT}ms`;
                    const error = new Error(errorMessage);
                    passThrough.destroy(error);
                    try {
                        ffmpegCommand.kill("SIGKILL");
                    }
                    catch (err) {
                        // Ignore errors
                    }
                    logger.error(errorMessage);
                    reject(error);
                }
            }, FFMPEG_TIMEOUT);
            ffmpegCommand.on("start", (commandLine: string) => {
                logger.info(`Calling FFmpeg with command: ${commandLine}`);
            });
            ffmpegCommand.on("error", (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    passThrough.destroy(err);
                    logger.error(`FFmpeg returned with an error command: ${err.message}`);
                    reject(err);
                }
            });

            ffmpegCommand.on("end", () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    passThrough.end();
                    resolve();
                }
            });
        });

        // Handle input stream errors
        inputStream.on("error", (err) => {
            passThrough.destroy(err);
        });

        return {
            stream: passThrough,
            completed
        };
    };
