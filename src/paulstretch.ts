import fs from "fs";
import FFT from "fft.js";

// Types
interface AudioData {
    sampleRate: number;
    samples: Float32Array[];
}

/**
 * Optimizes the window size for FFT operations
 */
function optimizeWindowSize(n: number): number {
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

/**
 * Loads a WAV file and returns sample rate and audio data
 */
function loadWav(filename: string): Promise<AudioData> {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, (err, buffer) => {
            if (err) {
                reject(new Error(`Error loading wav: ${filename}`));
                return;
            }

            try {
                // This is a simplified WAV parser - you might want to use a proper WAV parsing library
                const sampleRate = buffer.readUInt32LE(24);
                const numChannels = buffer.readUInt16LE(22);
                const bitsPerSample = buffer.readUInt16LE(34);
                const dataStart = 44; // Standard WAV header size

                const samples: Float32Array[] = new Array(numChannels)
                    .fill(null)
                    .map(() => new Float32Array((buffer.length - dataStart) / (numChannels * (bitsPerSample / 8))));

                let offset = dataStart;
                const scale = Math.pow(2, bitsPerSample - 1);

                for (let i = 0; i < samples[0].length; i++) {
                    for (let channel = 0; channel < numChannels; channel++) {
                        if (bitsPerSample === 16) {
                            samples[channel][i] = buffer.readInt16LE(offset) / scale;
                            offset += 2;
                        }
                        else if (bitsPerSample === 32) {
                            samples[channel][i] = buffer.readInt32LE(offset) / scale;
                            offset += 4;
                        }
                    }
                }

                resolve({
                    sampleRate,
                    samples: samples.length === 1 ? [samples[0], samples[0]] : samples // Convert mono to stereo if needed
                });
            }
            catch (error) {
                reject(new Error(`Error parsing wav file: ${error.message}`));
            }
        });
    });
}

/**
 * Main Paulstretch algorithm implementation
 */
async function paulstretch(
    sampleRate: number,
    samples: Float32Array[],
    stretch: number,
    windowSizeSeconds: number,
    onsetLevel: number,
    outFilename: string
): Promise<void> {
    const nChannels = samples.length;
    let windowSize = Math.floor(windowSizeSeconds * sampleRate);

    // Ensure window size is appropriate
    if (windowSize < 16) windowSize = 16;
    windowSize = optimizeWindowSize(windowSize);
    windowSize = Math.floor(windowSize / 2) * 2;
    const halfWindowSize = Math.floor(windowSize / 2);

    // Initialize FFT
    const fft = new FFT(windowSize);
    const freqDomain = fft.createComplexArray();
    const timeDomain = fft.createComplexArray();

    // Create Hann window
    const window = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
        window[i] = 0.5 - Math.cos(i * 2.0 * Math.PI / (windowSize - 1)) * 0.5;
    }

    // Initialize buffers
    const oldWindowedBuf = Array(2).fill(null).map(() => new Float32Array(windowSize));
    const hinvSqrt2 = (1 + Math.sqrt(0.5)) * 0.5;
    const hinvBuf = new Float32Array(halfWindowSize);
    for (let i = 0; i < halfWindowSize; i++) {
        hinvBuf[i] = 2.0 * (hinvSqrt2 - (1.0 - hinvSqrt2) *
            Math.cos(i * 2.0 * Math.PI / halfWindowSize)) / hinvSqrt2;
    }

    // Setup output file
    const outputStream = fs.createWriteStream(outFilename);
    const writeHeader = () => {
        const header = Buffer.alloc(44);
        // Write WAV header
        header.write("RIFF", 0);
        header.writeUInt32LE(0, 4); // File size (to be filled later)
        header.write("WAVE", 8);
        header.write("fmt ", 12);
        header.writeUInt32LE(16, 16); // Format chunk size
        header.writeUInt16LE(1, 20); // Audio format (PCM)
        header.writeUInt16LE(nChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(sampleRate * nChannels * 2, 28); // Byte rate
        header.writeUInt16LE(nChannels * 2, 32); // Block align
        header.writeUInt16LE(16, 34); // Bits per sample
        header.write("data", 36);
        header.writeUInt32LE(0, 40); // Data size (to be filled later)
        outputStream.write(header);
    };
    writeHeader();

    let startPos = 0;
    const displacePos = windowSize * 0.5;
    let displaceTick = 0.0;
    const displaceTickIncrease = Math.min(1.0, 1.0 / stretch);
    let extraOnsetTimeCredit = 0.0;
    let getNextBuf = true;

    // Frequency domain buffers
    const freqs = Array(2).fill(null).map(() => new Float32Array(halfWindowSize + 1));
    const oldFreqs = Array(2).fill(null).map(() => new Float32Array(halfWindowSize + 1));

    const processChunk = async () => {
        if (getNextBuf) {
            // Copy old frequencies
            oldFreqs.forEach((freq, i) => freq.set(freqs[i]));

            const iStartPos = Math.floor(startPos);
            const buf = Array(2).fill(null).map(() => new Float32Array(windowSize));

            // Copy and window the input data
            for (let ch = 0; ch < nChannels; ch++) {
                for (let i = 0; i < windowSize; i++) {
                    const pos = iStartPos + i;
                    buf[ch][i] = pos < samples[ch].length ? samples[ch][pos] * window[i] : 0;
                }

                // Perform FFT
                fft.realTransform(freqDomain, buf[ch]);

                // Get magnitudes
                for (let i = 0; i <= halfWindowSize; i++) {
                    const real = freqDomain[2 * i];
                    const imag = freqDomain[2 * i + 1];
                    freqs[ch][i] = Math.sqrt(real * real + imag * imag);
                }
            }
        }

        // Process frequencies
        for (let ch = 0; ch < nChannels; ch++) {
            // Interpolate between old and new frequencies
            for (let i = 0; i <= halfWindowSize; i++) {
                const mag = freqs[ch][i] * displaceTick + oldFreqs[ch][i] * (1.0 - displaceTick);
                const phase = Math.random() * 2 * Math.PI;
                freqDomain[2 * i] = mag * Math.cos(phase);
                freqDomain[2 * i + 1] = mag * Math.sin(phase);
            }

            // Inverse FFT
            fft.inverseTransform(timeDomain, freqDomain);

            // Window and overlap-add
            const output = new Float32Array(halfWindowSize);
            for (let i = 0; i < halfWindowSize; i++) {
                const sample = timeDomain[i] * window[i] + oldWindowedBuf[ch][i + halfWindowSize];
                output[i] = Math.max(-1, Math.min(1, sample * hinvBuf[i]));
                oldWindowedBuf[ch][i] = timeDomain[i + halfWindowSize] * window[i + halfWindowSize];
            }

            // Write to file
            const outputBuffer = Buffer.alloc(halfWindowSize * 2);
            for (let i = 0; i < halfWindowSize; i++) {
                outputBuffer.writeInt16LE(Math.round(output[i] * 32767), i * 2);
            }
            outputStream.write(outputBuffer);
        }

        if (getNextBuf) {
            startPos += displacePos;
        }

        getNextBuf = false;

        if (startPos >= samples[0].length) {
            outputStream.end();
            return true;
        }

        // Update displacement tick
        if (extraOnsetTimeCredit <= 0.0) {
            displaceTick += displaceTickIncrease;
        }
        else {
            const creditGet = 0.5 * displaceTickIncrease;
            extraOnsetTimeCredit -= creditGet;
            if (extraOnsetTimeCredit < 0) extraOnsetTimeCredit = 0;
            displaceTick += displaceTickIncrease - creditGet;
        }

        if (displaceTick >= 1.0) {
            displaceTick = displaceTick % 1.0;
            getNextBuf = true;
        }

        return false;
    };

    // Process the audio in chunks
    while (!(await processChunk())) {
        process.stdout.write(`${Math.floor(100.0 * startPos / samples[0].length)}%\r`);
    }

    console.log("100%");
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error("Usage: ts-node paulstretch.ts <input_wav> <output_wav> [stretch_amount] [window_size] [onset_level]");
        process.exit(1);
    }

    const [inputFile, outputFile] = args;
    const stretchAmount = parseFloat(args[2] || "8.0");
    const windowSize = parseFloat(args[3] || "0.25");
    const onsetLevel = parseFloat(args[4] || "10.0");

    console.log("Paul's Extreme Sound Stretch (Paulstretch) - TypeScript version");
    console.log("Parameters:");
    console.log(`- Stretch amount: ${stretchAmount}`);
    console.log(`- Window size: ${windowSize} seconds`);
    console.log(`- Onset sensitivity: ${onsetLevel}`);

    loadWav(inputFile)
        .then(({ sampleRate, samples }) =>
            paulstretch(sampleRate, samples, stretchAmount, windowSize, onsetLevel, outputFile))
        .catch((error) => {
            console.error("Error:", error.message);
            process.exit(1);
        });
}

export { paulstretch, loadWav, AudioData };
