import * as fs from "node:fs";
import type { Readable, Writable } from "node:stream";
import { convertAudio } from "../src";

/**
 * This example converts a WAV file to a new MP3 file without changing tempo
 *
 */
const wavToMp3NoTempo = async () => {
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
    const outputStream: Writable = fs.createWriteStream("./test/output/demo.mp3", { flags: "w" });

    await convertAudio({ inputStream, format: "wav" }, { outputStream, format: "mp3" });
};

wavToMp3NoTempo().catch(console.error);
