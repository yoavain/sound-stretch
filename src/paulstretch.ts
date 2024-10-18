import type { Readable, Writable } from "stream";
import { Transform } from "stream";
import FFT from "fft.js";

// Types
interface AudioData {
    sampleRate: number;
    samples: Float32Array[];
}

interface WavHeader {
    sampleRate: number;
    numChannels: number;
    bitsPerSample: number;
    dataStart: number;
}

/**
 * Transform stream that parses WAV headers
 */
class WavHeaderParser extends Transform {
    private headerBuffer: Buffer = Buffer.alloc(0);
    private wavHeader?: WavHeader;
    private isHeaderParsed = false;

    constructor() {
        super();
    }

    _transform(chunk: Buffer, encoding: string, callback: Function) {
        if (!this.isHeaderParsed) {
            this.headerBuffer = Buffer.concat([this.headerBuffer, chunk]);

            if (this.headerBuffer.length >= 44) { // Standard WAV header size
                this.wavHeader = {
                    sampleRate: this.headerBuffer.readUInt32LE(24),
                    numChannels: this.headerBuffer.readUInt16LE(22),
                    bitsPerSample: this.headerBuffer.readUInt16LE(34),
                    dataStart: 44
                };

                this.isHeaderParsed = true;
                // Push the remaining data after header
                if (this.headerBuffer.length > 44) {
                    this.push(this.headerBuffer.slice(44));
                }
            }
        }
        else {
            this.push(chunk);
        }
        callback();
    }

    getHeader(): WavHeader | undefined {
        return this.wavHeader;
    }
}

/**
 * Transform stream that converts WAV PCM data to Float32Arrays
 */
class PcmToFloat32 extends Transform {
    private readonly wavHeader: WavHeader;
    private buffer: Buffer = Buffer.alloc(0);
    private readonly bytesPerSample: number;

    constructor(wavHeader: WavHeader) {
        super();
        this.wavHeader = wavHeader;
        this.bytesPerSample = Math.ceil(wavHeader.bitsPerSample / 8);
    }

    _transform(chunk: Buffer, encoding: string, callback: Function) {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        const samplesPerChannel = Math.floor(this.buffer.length / (this.bytesPerSample * this.wavHeader.numChannels));
        if (samplesPerChannel > 0) {
            const channels: Float32Array[] = Array(this.wavHeader.numChannels)
                .fill(null)
                .map(() => new Float32Array(samplesPerChannel));

            const scale = Math.pow(2, this.wavHeader.bitsPerSample - 1);

            for (let i = 0; i < samplesPerChannel; i++) {
                for (let channel = 0; channel < this.wavHeader.numChannels; channel++) {
                    const offset = (i * this.wavHeader.numChannels + channel) * this.bytesPerSample;

                    if (this.wavHeader.bitsPerSample === 16) {
                        channels[channel][i] = this.buffer.readInt16LE(offset) / scale;
                    }
                    else if (this.wavHeader.bitsPerSample === 32) {
                        channels[channel][i] = this.buffer.readInt32LE(offset) / scale;
                    }
                }
            }

            const processedBytes = samplesPerChannel * this.wavHeader.numChannels * this.bytesPerSample;
            this.buffer = this.buffer.slice(processedBytes);

            this.push({
                sampleRate: this.wavHeader.sampleRate,
                samples: channels
            });
        }
        callback();
    }
}

/**
 * Transform stream that implements the Paulstretch algorithm
 */
class PaulStretch extends Transform {
    private readonly stretch: number;
    private readonly windowSizeSeconds: number;
    private readonly onsetLevel: number;
    private readonly sampleRate: number;
    private readonly fft: FFT;
    private readonly windowSize: number;
    private readonly halfWindowSize: number;
    private readonly window: Float32Array;
    private readonly freqs: Float32Array[];
    private readonly oldFreqs: Float32Array[];
    private readonly oldWindowedBuf: Float32Array[];
    private readonly hinvBuf: Float32Array;
    private startPos: number = 0;
    private displaceTick: number = 0.0;
    private extraOnsetTimeCredit: number = 0.0;
    private readonly displaceTickIncrease: number;
    private getNextBuf: boolean = true;
    private bufferedSamples: Float32Array[] = [];

    constructor(sampleRate: number, stretch: number, windowSizeSeconds: number, onsetLevel: number) {
        super({ objectMode: true });

        this.stretch = stretch;
        this.windowSizeSeconds = windowSizeSeconds;
        this.onsetLevel = onsetLevel;
        this.sampleRate = sampleRate;

        this.windowSize = this.calculateWindowSize();
        this.halfWindowSize = Math.floor(this.windowSize / 2);

        this.fft = new FFT(this.windowSize);
        this.window = this.createHannWindow();

        this.freqs = Array(2).fill(null).map(() => new Float32Array(this.halfWindowSize + 1));
        this.oldFreqs = Array(2).fill(null).map(() => new Float32Array(this.halfWindowSize + 1));
        this.oldWindowedBuf = Array(2).fill(null).map(() => new Float32Array(this.windowSize));
        this.hinvBuf = this.createHinvBuf();

        this.displaceTickIncrease = Math.min(1.0, 1.0 / stretch);
    }

    private calculateWindowSize(): number {
        let size = Math.floor(this.windowSizeSeconds * this.sampleRate);
        if (size < 16) size = 16;
        size = this.optimizeWindowSize(size);
        return Math.floor(size / 2) * 2;
    }

    private optimizeWindowSize(n: number): number {
        let origN = n;
        while (true) {
            let currentN = origN;
            while ((currentN % 2) === 0) currentN /= 2;
            while ((currentN % 3) === 0) currentN /= 3;
            while ((currentN % 5) === 0) currentN /= 5;
            if (currentN < 2) break;
            origN++;
        }
        return origN;
    }

    private createHannWindow(): Float32Array {
        const window = new Float32Array(this.windowSize);
        for (let i = 0; i < this.windowSize; i++) {
            window[i] = 0.5 - Math.cos(i * 2.0 * Math.PI / (this.windowSize - 1)) * 0.5;
        }
        return window;
    }

    private createHinvBuf(): Float32Array {
        const hinvSqrt2 = (1 + Math.sqrt(0.5)) * 0.5;
        const hinvBuf = new Float32Array(this.halfWindowSize);
        for (let i = 0; i < this.halfWindowSize; i++) {
            hinvBuf[i] = 2.0 * (hinvSqrt2 - (1.0 - hinvSqrt2) *
                Math.cos(i * 2.0 * Math.PI / this.halfWindowSize)) / hinvSqrt2;
        }
        return hinvBuf;
    }

    _transform(chunk: AudioData, encoding: string, callback: Function) {
        // Buffer the incoming samples
        if (!this.bufferedSamples.length) {
            this.bufferedSamples = chunk.samples;
        }
        else {
            this.bufferedSamples = this.bufferedSamples.map((channel, i) =>
                Float32Array.from([...channel, ...chunk.samples[i]]));
        }

        // Process while we have enough samples
        while (this.bufferedSamples[0].length >= this.windowSize) {
            const output = this.processChunk();
            if (output) {
                this.push(output);
            }
        }

        callback();
    }

    private processChunk(): Buffer | null {
        if (this.getNextBuf) {
            // Copy old frequencies
            this.oldFreqs.forEach((freq, i) => freq.set(this.freqs[i]));

            const freqDomain = this.fft.createComplexArray();

            // Process each channel
            for (let ch = 0; ch < 2; ch++) {
                // Copy and window the input data
                const input = new Float32Array(this.windowSize);
                for (let i = 0; i < this.windowSize; i++) {
                    input[i] = this.bufferedSamples[ch][i] * this.window[i];
                }

                // Perform FFT
                this.fft.realTransform(freqDomain, input);

                // Get magnitudes
                for (let i = 0; i <= this.halfWindowSize; i++) {
                    const real = freqDomain[2 * i];
                    const imag = freqDomain[2 * i + 1];
                    this.freqs[ch][i] = Math.sqrt(real * real + imag * imag);
                }
            }

            // Remove processed samples
            this.bufferedSamples = this.bufferedSamples.map((channel) =>
                channel.slice(Math.floor(this.windowSize * 0.5)));
        }

        // Process frequencies and generate output
        const output = Buffer.alloc(this.halfWindowSize * 4); // 2 bytes per sample * 2 channels
        const freqDomain = this.fft.createComplexArray();
        const timeDomain = this.fft.createComplexArray();

        for (let ch = 0; ch < 2; ch++) {
            // Interpolate between old and new frequencies
            for (let i = 0; i <= this.halfWindowSize; i++) {
                const mag = this.freqs[ch][i] * this.displaceTick +
                    this.oldFreqs[ch][i] * (1.0 - this.displaceTick);
                const phase = Math.random() * 2 * Math.PI;
                freqDomain[2 * i] = mag * Math.cos(phase);
                freqDomain[2 * i + 1] = mag * Math.sin(phase);
            }

            // Inverse FFT
            this.fft.inverseTransform(timeDomain, freqDomain);

            // Window and overlap-add
            for (let i = 0; i < this.halfWindowSize; i++) {
                const sample = timeDomain[i] * this.window[i] +
                    this.oldWindowedBuf[ch][i + this.halfWindowSize];
                const value = Math.max(-1, Math.min(1, sample * this.hinvBuf[i]));
                output.writeInt16LE(Math.round(value * 32767), i * 4 + ch * 2);
                this.oldWindowedBuf[ch][i] = timeDomain[i + this.halfWindowSize] *
                    this.window[i + this.halfWindowSize];
            }
        }

        // Update state
        if (this.getNextBuf) {
            this.startPos += this.windowSize * 0.5;
        }

        this.getNextBuf = false;

        if (this.extraOnsetTimeCredit <= 0.0) {
            this.displaceTick += this.displaceTickIncrease;
        }
        else {
            const creditGet = 0.5 * this.displaceTickIncrease;
            this.extraOnsetTimeCredit -= creditGet;
            if (this.extraOnsetTimeCredit < 0) this.extraOnsetTimeCredit = 0;
            this.displaceTick += this.displaceTickIncrease - creditGet;
        }

        if (this.displaceTick >= 1.0) {
            this.displaceTick = this.displaceTick % 1.0;
            this.getNextBuf = true;
        }

        return output;
    }

    _flush(callback: Function) {
        // Process any remaining samples
        while (this.bufferedSamples[0].length >= this.windowSize) {
            const output = this.processChunk();
            if (output) {
                this.push(output);
            }
        }
        callback();
    }
}

/**
 * Creates a WAV header as a Buffer
 */
function createWavHeader(sampleRate: number, numChannels: number): Buffer {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(0, 4); // File size (to be filled later)
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // Format chunk size
    header.writeUInt16LE(1, 20); // Audio format (PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * 2, 28); // Byte rate
    header.writeUInt16LE(numChannels * 2, 32); // Block align
    header.writeUInt16LE(16, 34); // Bits per sample
    header.write("data", 36);
    header.writeUInt32LE(0, 40); // Data size (to be filled later)
    return header;
}

/**
 * Creates a streaming pipeline for the Paulstretch algorithm
 */
function createPaulstretchPipeline(
    stretch: number,
    windowSizeSeconds: number,
    onsetLevel: number
): { input: Writable; output: Readable } {
    const headerParser = new WavHeaderParser();
    let pcmConverter: PcmToFloat32;
    let paulStretch: PaulStretch;
    let headerWritten = false;

    const output = new Transform({
        transform(chunk: Buffer, encoding, callback) {
            if (!headerWritten) {
                const header = createWavHeader(
                    headerParser.getHeader()!.sampleRate,
                    headerParser.getHeader()!.numChannels
                );
                this.push(header);
                headerWritten = true;
            }
            this.push(chunk);
            callback();
        }
    });

    // Set up pipeline when header is parsed
    headerParser.on("data", (chunk) => {
        if (!pcmConverter) {
            const header = headerParser.getHeader()!;
            pcmConverter = new PcmToFloat32(header);
            paulStretch = new PaulStretch(header.sampleRate, stretch, windowSizeSeconds, onsetLevel);

            pcmConverter
                .pipe(paulStretch)
                .pipe(output);

            pcmConverter.write(chunk);
        }
        else {
            pcmConverter.write(chunk);
        }
    });

    return {
        input: headerParser,
        output
    };
}

export { createPaulstretchPipeline };
