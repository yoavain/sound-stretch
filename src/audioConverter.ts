import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";

export const convertAudio = (inputStream: Readable): Readable => {
    const passThrough = new PassThrough();
    inputStream.pipe(passThrough);
    return passThrough;
};
