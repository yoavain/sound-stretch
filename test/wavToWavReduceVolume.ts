import * as fs from "node:fs";
import type { Readable, Writable } from "node:stream";
import { convertAudio } from "../src";

/**
 * This example converts a WAV file to a new WAV file with a specified tempo ratio
 *
 */
const wavToWavReduceVolume = async () => {
    const volume: number = 0.5;
    
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
    const outputStream: Writable = fs.createWriteStream(`./test/output/demo-volume-${volume}.wav`, { flags: "w"  });

    await convertAudio({ inputStream, format: "wav" }, { outputStream, format: "wav" }, { volume });
};

wavToWavReduceVolume().catch(console.error);
