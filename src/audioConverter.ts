// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { changeTempo } from "./soundStretch";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import type { AUDIO_FORMAT, AudioInputStream, AudioOutputStream, ConversionBlock, ConversionResult } from "./types";
import ffmpeg from "fluent-ffmpeg";


export const convertAudioBlock: ConversionBlock = (inputStream: Readable, inputFormat: AUDIO_FORMAT, outputFormat: AUDIO_FORMAT): ConversionResult => {
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


export const convertAudio = async (input: AudioInputStream, output: AudioOutputStream, tempo: number = 1.0): Promise<void> => {
    // any -> wav
    const { stream: wavStream, completed: convertToWavCompleted } = convertAudioBlock(input.inputStream, input.format, "wav");

    // change tempo
    const { stream: wavNewTempoStream, completed: changeTempoCompleted } = changeTempo(wavStream, tempo);

    // wav -> any
    const { stream: mp3Stream, completed: convertFromWavCompleted } = convertAudioBlock(wavNewTempoStream, "wav", output.format);

    // Pipe output
    mp3Stream.pipe(output.outputStream);

    await Promise.all([convertToWavCompleted, changeTempoCompleted, convertFromWavCompleted]);
};
