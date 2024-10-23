import type { Readable, Writable } from "node:stream";
import fs from "node:fs";
import type { Logger } from "../src";
import { convertAudioAndConsume } from "../src";

const mockLogger: Logger = {
    info: jest.fn(console.log),
    error: jest.fn(console.error)
} as unknown as Logger;


describe("Test audioConverter", () => {
    it("Should convert formats", async () => {
        const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
        const outputStream: Writable = fs.createWriteStream("./test/output/demo.mp3", { flags: "w" });

        await convertAudioAndConsume({ inputStream, format: "wav" }, { outputStream, format: "mp3" }, undefined, mockLogger);
    });

    it("Should do tempo conversion", async () => {
        const tempo: number = 1.5;

        const inputStream: Readable = fs.createReadStream("./test/resources/demo.mp3");
        const outputStream: Writable = fs.createWriteStream(`./test/output/demo-stretched-${tempo}.mp3`, { flags: "w" });

        await convertAudioAndConsume({ inputStream, format: "mp3" }, { outputStream, format: "mp3" }, { tempo }, mockLogger);
    });

    it("Should do tempo and format conversions", async () => {
        const tempo: number = 0.5;

        const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
        const outputStream: Writable = fs.createWriteStream(`./test/output/demo-stretched-${tempo}.wav`, { flags: "w" });

        await convertAudioAndConsume({ inputStream, format: "wav" }, { outputStream, format: "wav" }, { tempo }, mockLogger);
    });
    
    it("Should do volume conversion", async () => {
        const volume: number = 0.5;

        const inputStream: Readable = fs.createReadStream("./test/resources/demo.wav");
        const outputStream: Writable = fs.createWriteStream(`./test/output/demo-volume-${volume}.wav`, { flags: "w" });

        await convertAudioAndConsume({ inputStream, format: "wav" }, { outputStream, format: "wav" }, { volume }, mockLogger);
    });
});
