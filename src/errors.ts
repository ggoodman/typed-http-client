import * as IoTs from 'io-ts';

export class ResponseDecodeError extends Error {
  constructor(_: IoTs.Errors) {
    const message = `Error decoding response payload`;
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

export class ResponseJsonError extends Error {
  constructor(err: Error) {
    const message = `Error parsing response payload as JSON: ${err.message}`;

    super(message);

    this.name = this.constructor.name;

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}
