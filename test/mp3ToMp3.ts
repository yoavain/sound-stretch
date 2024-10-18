import * as fs from "node:fs";
import { convertAudio } from "../src/audioConverter";
import { changeTempo } from "../src/soundStretch";
import type { Readable, Writable } from "node:stream";

/**
 * This example does converts an MP3 file to a new MP3 file with a specified tempo ratio
 *
 */
const mp3ToMp3 = async () => {
    const tempo: number = 1.5;
    
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.mp3");
    const outputStream: Writable = fs.createWriteStream(`./test/output/demo-stretched-${tempo}.mp3`, { flags: "w" });

    // mp3 -> wav
    const { stream: wavStream, completed: convertMp3ToWavCompleted } = convertAudio(inputStream, "mp3", "wav");

    // change tempo
    const { stream: wavNewTempoStream, completed: changeTempoCompleted } = changeTempo(wavStream, tempo);

    // wav -> mp3
    const { stream: mp3Stream, completed: convertWavToMp3Completed } = convertAudio(wavNewTempoStream, "wav", "mp3");

    // Pipe output
    mp3Stream.pipe(outputStream);

    await Promise.all([convertMp3ToWavCompleted, changeTempoCompleted, convertWavToMp3Completed]);
};

mp3ToMp3().catch(console.error);
