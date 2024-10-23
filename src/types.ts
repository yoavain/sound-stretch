import type { Readable, Writable } from "node:stream";

export type AUDIO_FORMAT = "wav" | "mp3" | "flac";

export type AudioInputStream = {
    inputStream: Readable;
    format: AUDIO_FORMAT;
}

export type AudioOutputStream = {
    outputStream: Writable;
    format: AUDIO_FORMAT;
}

export interface ConversionResult {
    stream: Readable;
    completed: Promise<void>;
}

export type ConversionBlock<TArgs extends any[] = []> = (
    inputStream: Readable,
    ...args: [...TArgs] extends [...infer Rest] ? [...Rest, logger?: Logger] : [logger?: Logger]
) => ConversionResult;

/**
 * tempo: optional number - target tempo (default: 1.0)
 */
export type ConversionOptions = {
    tempo: number;
    volume: number;
}

export type Logger = {
    info: (message: string) => void;
    error: (message: string) => void;
}