import * as Http from 'http';
import * as Https from 'https';
import * as Net from 'net';
import * as Stream from 'stream';
import { URL } from 'url';
import { promisify } from 'util';

import * as ReadableStream from 'readable-stream';

import { getGlobalHttpAgent, getGlobalHttpsAgent } from './agents';
import { Payload } from './payload';
import { Reader } from './reader';

const pipeline = promisify(ReadableStream.pipeline);

export enum HttpMethodKind {
  DELETE = 'delete',
  POST = 'post',
  PUT = 'put',
  PATCH = 'patch',
  GET = 'get',
  HEAD = 'get',
  OPTIONS = 'options',
}

interface HttpClientOptions {
  agent?: Http.Agent;
  baseUrl?: string;
  headers?: Http.OutgoingHttpHeaders;
}

interface HttpClientRequestOptions {
  agent?: Http.Agent;
  headers?: Http.OutgoingHttpHeaders;
  payload?: string | string[] | Buffer | Buffer[] | ReadableStream.Readable;
}

class HttpClient {
  private readonly agent?: Http.Agent;
  private readonly baseUrl?: string;
  private readonly headers: Http.OutgoingHttpHeaders;

  constructor(options: HttpClientOptions = {}) {
    this.agent = options.agent;
    this.baseUrl = options.baseUrl;
    this.headers = options.headers || {};
  }

  withDefaults(options: HttpClientOptions) {
    return new HttpClient({
      agent: options.agent || this.agent,
      baseUrl: options.baseUrl || this.baseUrl,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });
  }

  async read(stream: Stream.Readable | ReadableStream.Readable): Promise<Buffer> {
    const reader = new Reader();

    await pipeline(stream, reader);

    return reader.collect();
  }

  async request(
    method: HttpMethodKind,
    urlOrPath: string,
    options: HttpClientRequestOptions = {}
  ): Promise<Http.ClientResponse> {
    const url = new URL(urlOrPath, this.baseUrl);
    const headers = { ...this.headers, ...(options.headers || {}) };

    let agent = options.agent || this.agent;
    let createRequest: typeof Http.request | typeof Https.request;

    if (url.protocol === 'http:') {
      if (!agent) {
        agent = getGlobalHttpAgent();
      }
      createRequest = Http.request;
    } else if (url.protocol === 'https:') {
      if (!agent) {
        agent = getGlobalHttpsAgent();
      }
      createRequest = Https.request;
    } else {
      throw new TypeError(`Unsupported protocol '${url.protocol}'`);
    }

    const req = createRequest({
      agent,
      headers,
      hostname: url.hostname,
      method,
      path: url.pathname,
      port: url.port,
      search: url.search,
    });

    const socket = await resolveWhenSocketAssigned(req);

    await resolveWhenSocketConnected(socket);

    if (options.payload) {
      const payloadStream =
        options.payload instanceof ReadableStream.Readable ? options.payload : new Payload(options.payload);

      ReadableStream.pipeline(payloadStream, req, err => {
        if (err) {
          req.emit('error', err);
        }
      });
    } else {
      req.end();
    }

    return await resolveWhenResponseReceived(req);
  }
}

export const client = new HttpClient();

function resolveWhenResponseReceived(req: Http.ClientRequest): Promise<Http.ClientResponse> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      req.removeListener('err', onError).removeListener('response', onResponse);

      return reject(err);
    };
    const onResponse = (res: Http.ClientResponse) => {
      req.removeListener('err', onError).removeListener('response', onResponse);

      return resolve(res);
    };

    req.on('error', onError).on('response', onResponse);
  });
}

function resolveWhenSocketAssigned(req: Http.ClientRequest): Promise<Net.Socket> {
  return new Promise((resolve, reject) => {
    if (!req.socket) {
      const onError = (err: NodeJS.ErrnoException) => {
        req.removeListener('error', onError).removeListener('socket', onSocket);

        return reject(err);
      };
      const onSocket = (socket: Net.Socket) => {
        req.removeListener('error', onError).removeListener('socket', onSocket);

        return resolve(socket);
      };
      req.on('error', onError).on('socket', onSocket);
    } else {
      resolve();
    }
  });
}

function resolveWhenSocketConnected(socket: Net.Socket): Promise<Net.Socket> {
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      socket.removeListener('connect', onConnect).removeListener('error', onError);

      return resolve(socket);
    };
    const onError = (err: NodeJS.ErrnoException) => {
      socket.removeListener('connect', onConnect).removeListener('error', onError);

      return reject(err);
    };
    socket.on('error', onError).on('connect', onConnect);
  });
}
