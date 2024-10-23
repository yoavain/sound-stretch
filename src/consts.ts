import type { ConversionOptions } from "./types";

/**
 * Neutral conversion options
 */
export const NeutralConversionOptions: ConversionOptions = {
    tempo: 1.0,
    volume: 1.0
};

export const getConversionOptionsWithDefaults = (options?: Partial<ConversionOptions>): ConversionOptions => {
    const mergedOptions: ConversionOptions = { ...NeutralConversionOptions };
    if (options) {
        if (options.tempo !== undefined) {
            mergedOptions.tempo = options.tempo;
        }
        if (options.volume !== undefined) {
            mergedOptions.volume = options.volume;
        }
    }
    return mergedOptions;
};
