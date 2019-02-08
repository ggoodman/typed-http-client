import * as ReadableStream from 'readable-stream';

export class Reader extends ReadableStream.Writable {
  private readonly buffers: Buffer[] = [];
  private length = 0;

  _write(chunk: Buffer, _: string, next: (err?: Error) => void) {
    this.buffers.push(chunk);
    this.length += chunk.length;

    next();
  }

  collect(): Buffer {
    const buffer =
      this.buffers.length === 0
        ? Buffer.alloc(0)
        : this.buffers.length === 1
        ? this.buffers[0]
        : Buffer.concat(this.buffers, this.length);
    return buffer;
  }
}
