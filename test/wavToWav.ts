import * as fs from "node:fs";
import { changeTempo } from "../src/soundStretch";
import type { Readable, Writable } from "node:stream";

/**
 * This example does converts a WAV file to a new WAV file with a specified tempo ratio
 *
 */
const wavToWav = async () => {
    const tempo: number = 0.5;
    
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
    const outputStream: Writable = fs.createWriteStream(`./test/output/demo-stretched-${tempo}.wav`, { flags: "w"  });

    // change tempo
    const { stream: wavNewTempoStream, completed: changeTempoCompleted } = changeTempo(inputStream, tempo);

    // Pipe output
    wavNewTempoStream.pipe(outputStream);

    await Promise.all([changeTempoCompleted]);
};

wavToWav().catch(console.error);
