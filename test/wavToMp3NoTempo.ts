import * as fs from "node:fs";
import type { Readable, Writable } from "node:stream";
import { convertAudio } from "../src";

/**
 * This example does converts an MP3 file to a new MP3 file with a specified tempo ratio
 *
 */
const wavToMp3NoTempo = async () => {
    const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
    const outputStream: Writable = fs.createWriteStream("./test/output/demo.mp3", { flags: "w" });

    await convertAudio({ inputStream, format: "wav" }, { outputStream, format: "mp3" });
};

wavToMp3NoTempo().catch(console.error);
