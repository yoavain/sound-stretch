// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { changeTempo } from "./soundStretch";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import type { AUDIO_FORMAT, AudioInputStream, AudioOutputStream, ConversionBlock, ConversionOptions, ConversionResult } from "./types";
import { NeutralConversionOptions } from "./consts";
import ffmpeg from "fluent-ffmpeg";


const isVolumeChangeRequired = (volume?: number): boolean => {
    return volume !== undefined && volume!== NeutralConversionOptions.volume;
};

const getVolumeDb = (volume: number): number => {
    if (volume <= 0.1 || volume > 1.2) {
        throw new Error("Volume must between 0.1 and 1.2");
    }

    return Math.log10(volume) * 20;
};

export const convertAudioBlock: ConversionBlock = (inputStream: Readable, inputFormat: AUDIO_FORMAT, outputFormat: AUDIO_FORMAT, volume? : number): ConversionResult => {
    const volumeChangeRequired: boolean = isVolumeChangeRequired(volume);
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
        const volumeDb = getVolumeDb(volume);
        ffmpegCommand.audioFilters(`volume=${volumeDb.toFixed(1)}dB`);
    }

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


export const convertAudio = async (input: AudioInputStream, output: AudioOutputStream, conversionOptions?: Partial<ConversionOptions>): Promise<void> => {
    const mergedOptions: ConversionOptions  =  { ...NeutralConversionOptions, ...conversionOptions };

    // any -> wav
    const { stream: wavStream, completed: convertToWavCompleted } = convertAudioBlock(input.inputStream, input.format, "wav");

    // change tempo
    const { stream: wavNewTempoStream, completed: changeTempoCompleted } = changeTempo(wavStream, mergedOptions.tempo);

    // wav -> any, with volume applied (if needed)
    const { stream: mp3Stream, completed: convertFromWavCompleted } = convertAudioBlock(wavNewTempoStream, "wav", output.format, mergedOptions.volume);

    // Pipe output
    mp3Stream.pipe(output.outputStream);

    await Promise.all([convertToWavCompleted, changeTempoCompleted, convertFromWavCompleted]);
};
