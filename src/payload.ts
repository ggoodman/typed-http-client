import * as ReadableStream from 'readable-stream';

export class Payload extends ReadableStream.Readable {
  private readonly data: Buffer;
  private position = 0;

  constructor(payload: string | string[] | Buffer | Buffer[], private readonly encoding: string = 'utf8') {
    super();

    const chunks = ([] as Array<string | Buffer>).concat(payload || '');

    let size = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      chunks[i] = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += chunks[i].length;
    }

    this.data = Buffer.concat(chunks as Buffer[], size);
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
