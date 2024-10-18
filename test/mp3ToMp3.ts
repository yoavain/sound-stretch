import * as fs from "node:fs";
import type { Readable, Writable } from "node:stream";
import { convertAudio } from "../src";

/**
 * This example converts an MP3 file to a new MP3 file with a specified tempo ratio
 *
 */
const mp3ToMp3 = async () => {
    const tempo: number = 1.5;
    
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.mp3");
    const outputStream: Writable = fs.createWriteStream(`./test/output/demo-stretched-${tempo}.mp3`, { flags: "w" });

    await convertAudio({ inputStream, format: "mp3" }, { outputStream, format: "mp3" }, tempo);
};

mp3ToMp3().catch(console.error);
