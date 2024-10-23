// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

import { convertAudioFfmpeg } from "./ffmpeg";
import { changeTempo } from "./soundStretch";
import type { Readable } from "node:stream";
import type { AUDIO_FORMAT, AudioInputStream, AudioOutputStream, ConversionBlock, ConversionOptions, ConversionResult, Logger } from "./types";
import { getConversionOptionsWithDefaults, NeutralConversionOptions } from "./consts";

/**
 * Converts an audio stream from one format to another, with optional tempo change and volume adjustment
 *
 * @param inputStream Readable stream containing audio data
 * @param inputFormat Input stream format
 * @param outputFormat Output stream format
 * @param conversionOptions Conversion options (tempo, volume)
 * @param logger Optional logger
 * @returns ConversionResult Returns a readable stream and a completion promise
 */
export const convertAudio: ConversionBlock<[AUDIO_FORMAT, AUDIO_FORMAT, Partial<ConversionOptions>]> =
    (inputStream: Readable, inputFormat: AUDIO_FORMAT, outputFormat: AUDIO_FORMAT, conversionOptions?: Partial<ConversionOptions>, logger?: Logger): ConversionResult => {
        const mergedOptions: ConversionOptions = getConversionOptionsWithDefaults(conversionOptions);

        // short path (no tempo change)
        if (mergedOptions.tempo === NeutralConversionOptions.tempo) {
            // any -> any, with volume applied (if needed)
            logger.info(`Converting audio from ${inputFormat} to ${outputFormat} with volume ${mergedOptions.volume}`);
            return convertAudioFfmpeg(inputStream, inputFormat, outputFormat, mergedOptions.volume, logger);
        }

        // Long path (tempo change)

        // any -> wav
        logger.info(`Converting audio from ${inputFormat} to wav`);
        const { stream: wavStream, completed: convertToWavCompleted } = convertAudioFfmpeg(inputStream, inputFormat, "wav", undefined, logger);

        // change tempo
        logger.info(`Changing tempo to ${mergedOptions.tempo}`);
        const { stream: wavNewTempoStream, completed: changeTempoCompleted } = changeTempo(wavStream, mergedOptions.tempo, logger);

        // wav -> any, with volume applied (if needed)
        logger.info(`Converting audio from wav to ${outputFormat} with volume ${mergedOptions.volume}`);
        const { stream: outputStream, completed: convertFromWavCompleted } = convertAudioFfmpeg(wavNewTempoStream, "wav", outputFormat, mergedOptions.volume, logger);

        return {
            stream: outputStream,
            completed: Promise.all([convertToWavCompleted, changeTempoCompleted, convertFromWavCompleted]).then(() => {})
        };
    };


/**
 * Converts an audio stream from one format to another, with optional tempo change and volume adjustment
 *
 * @param input Audio input stream with format
 * @param output Audio output stream with format
 * @param conversionOptions Conversion options (tempo, volume)
 * @param logger Optional logger
 */
export const convertAudioAndConsume = (input: AudioInputStream, output: AudioOutputStream, conversionOptions?: Partial<ConversionOptions>, logger?: Logger): Promise<void> => {
    const mergedOptions: ConversionOptions = getConversionOptionsWithDefaults(conversionOptions);

    logger.info(`Calling convertAudio with input format ${input.format} to output format ${output.format} with tempo ${mergedOptions.tempo} and volume ${mergedOptions.volume}`);
    const { stream, completed } = convertAudio(input.inputStream, input.format, output.format, mergedOptions, logger);

    // Pipe output
    stream.pipe(output.outputStream);

    return completed;
};
