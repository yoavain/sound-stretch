// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import type { Readable } from "node:stream";
import type { AUDIO_FORMAT, ConversionResult } from "./types";
import { PassThrough } from "node:stream";
import ffmpeg from "fluent-ffmpeg";


export const convertAudio = (inputStream: Readable, inputFormat: AUDIO_FORMAT, outputFormat: AUDIO_FORMAT): ConversionResult => {
    if (inputFormat === outputFormat) {
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

    ffmpegCommand.pipe(passThrough, { end: true });

    const completed = new Promise<void>((resolve, reject) => {
        ffmpegCommand.on("error", (err) => {
            passThrough.destroy(err);
            reject(err);
        });

        ffmpegCommand.on("end", () => {
            passThrough.end();
            resolve();
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
