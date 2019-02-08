import * as ReadableStream from 'readable-stream';

export class Payload extends ReadableStream.Readable {
  private readonly data: Buffer;
  private position = 0;

  constructor(payload: string, private readonly encoding: string = 'utf8') {
    super();

    this.data = Buffer.from(payload);
  }

  _read(size: number) {
    const chunk = this.data.slice(this.position, this.position + size);
    this.push(chunk, this.encoding);
    this.position += chunk.length;

    if (this.position >= this.data.length) {
      this.push(null);
    }
  }
}
