import * as Http from 'http';
import * as Https from 'https';
import * as Net from 'net';
import * as Stream from 'stream';
import { URL } from 'url';
import { promisify } from 'util';

import * as IoTs from 'io-ts';
import { Span, SpanContext, Tracer } from 'opentracing';
import { SPAN_KIND, SPAN_KIND_RPC_CLIENT, PEER_ADDRESS, ERROR, SAMPLING_PRIORITY } from 'opentracing/lib/ext/tags';
import * as ReadableStream from 'readable-stream';

import { getGlobalHttpAgent, getGlobalHttpsAgent } from './agents';
import { BunyanStyleLogger } from './logger';
import { ResponseDecodeError, ResponseJsonError } from './errors';
import { Payload } from './payload';
import { Reader } from './reader';
import { Timer } from './timer';

const pipeline = promisify(ReadableStream.pipeline);

export enum HttpMethodKind {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  PATCH = 'patch',
  DELETE = 'delete',
  OPTIONS = 'options',
}

interface CreateRequestFunctionOptions<RequestPayloadCodec extends IoTs.Any, ResponsePayloadCodec extends IoTs.Any> {
  agent?: Http.Agent | Https.Agent;
  baseUrl?: string;
  headers?: Http.OutgoingHttpHeaders;
  logger?: BunyanStyleLogger;
  requestPayloadCodec?: RequestPayloadCodec;
  responsePayloadCodec?: ResponsePayloadCodec;
  tracer?: Tracer;
}

interface RequestFunctionOptions<RequestPayloadCodec extends IoTs.Any = IoTs.UndefinedType> {
  agent?: Http.Agent | Https.Agent;
  headers?: Http.OutgoingHttpHeaders;
  logger?: BunyanStyleLogger;
  payload?: IoTs.TypeOf<RequestPayloadCodec>;
  span?: Span | SpanContext;
}

interface RequestFunction<RequestPayloadCodec extends IoTs.Any, ResponsePayloadCodec extends IoTs.Any> {
  (method: HttpMethodKind, path: string, options?: RequestFunctionOptions<RequestPayloadCodec>): Promise<
    RequestFunctionResponse<ResponsePayloadCodec>
  >;
}

interface RequestFunctionResponse<ResponsePayloadCodec extends IoTs.Any = IoTs.UndefinedType> {
  headers: Http.IncomingHttpHeaders;
  statusCode: number;
  payload: IoTs.TypeOf<ResponsePayloadCodec>;
}

let nextRequestFunctionId = 0;
let requestCounter = 0;

export function createRequestFunction<RequestPayloadCodec extends IoTs.Any, ResponsePayloadCodec extends IoTs.Any>(
  options: CreateRequestFunctionOptions<RequestPayloadCodec, ResponsePayloadCodec> = {}
): RequestFunction<RequestPayloadCodec, ResponsePayloadCodec> {
  const baseAgent = options.agent;
  const baseHeaders = {
    ...(options.headers || {}),
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const baseUrl = options.baseUrl;
  const defaultLogger = options.logger;
  const requestFunctionId = nextRequestFunctionId++;
  const requestPayloadCodec = options.requestPayloadCodec;
  const responsePayloadCodec = options.responsePayloadCodec;
  const tracer = options.tracer;

  return async function(
    method: HttpMethodKind,
    path: string,
    options: RequestFunctionOptions<RequestPayloadCodec> = {}
  ): Promise<RequestFunctionResponse<ResponsePayloadCodec>> {
    const started = Date.now();
    const id = `${started}:${requestFunctionId}:${requestCounter++}`;
    const timer = new Timer();
    const url = new URL(path, baseUrl);
    const headers = { ...baseHeaders, ...(options.headers || {}) };
    const parentLogger = options.logger || defaultLogger;
    const logger = parentLogger ? parentLogger.child({ req: { id, url: url.href } }) : undefined;

    let payload: IoTs.TypeOf<RequestPayloadCodec>;
    let jsonPayload: string | undefined = undefined;

    if (requestPayloadCodec) {
      if (!requestPayloadCodec.is(options.payload)) {
        const err = new TypeError(`Invalid request payload`);

        if (logger) {
          logger.warn({ err }, 'invalid request payload');
        }

        throw err;
      }

      try {
        payload = requestPayloadCodec.encode(options.payload);
        jsonPayload = JSON.stringify(payload);
      } catch (err) {
        if (logger) {
          logger.warn({ err }, 'error stringifying request payload');
        }
        throw new Error(`Error encoding request payload as JSON: ${err.message}`);
      }
    } else if (options.payload) {
      throw new TypeError('A payload cannot be supplied without defining a requestPayloadCodec');
    }

    let agent = baseAgent || options.agent;
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

    let requestSpan: Span | undefined = undefined;

    if (tracer) {
      requestSpan = tracer.startSpan(`${method} ${url.href}`, {
        childOf: options.span,
        tags: {
          [SPAN_KIND]: SPAN_KIND_RPC_CLIENT,
          [PEER_ADDRESS]: url.host,
        },
      });
    }

    try {
      const req = createRequest({
        agent,
        headers,
        hostname: url.hostname,
        method,
        pathname: `${url.pathname}${url.search}`,
        port: url.port,
        search: url.search,
      });

      const socket = await resolveWhenSocketAssigned(req);

      if (logger) {
        logger.trace({ latency: timer.elapsedMs() }, 'socket assigned');
      }

      await resolveWhenSocketConnected(socket);

      if (logger) {
        logger.trace({ latency: timer.elapsedMs() }, 'socket connected');
      }

      if (jsonPayload) {
        const payloadStream = new Payload(jsonPayload);

        ReadableStream.pipeline(payloadStream, req, err => {
          if (err) {
            req.emit('error', err);
          }
        });
      } else {
        req.end();
      }

      const res = await resolveWhenResponseReceived(req);

      if (logger) {
        logger.trace({ latency: timer.elapsedMs() }, 'response headers received');
      }

      if (responsePayloadCodec) {
        const payload = await read(res, responsePayloadCodec);

        if (logger) {
          logger.trace({ latency: timer.elapsedMs() }, 'response payload received');
        }

        return {
          headers: res.headers,
          payload,
          statusCode: res.statusCode || 0,
        };
      }

      res.resume();

      return {
        headers: res.headers,
        payload: undefined,
        statusCode: res.statusCode || 0,
      };
    } catch (err) {
      if (requestSpan) {
        requestSpan.addTags({
          [ERROR]: true,
          [SAMPLING_PRIORITY]: 1,
        });
      }

      throw err;
    } finally {
      if (requestSpan) {
        requestSpan.finish();
      }
    }
  };
}

export async function read<T extends IoTs.Any>(
  stream: ReadableStream.Readable | Stream.Readable,
  codec: T
): Promise<IoTs.TypeOf<T>> {
  const reader = new Reader();

  await pipeline(stream, reader);

  const resPayloadRaw = reader.collect().toString('utf8');

  let resPayloadJson: any;

  try {
    resPayloadJson = JSON.parse(resPayloadRaw);
  } catch (err) {
    throw new ResponseJsonError(err);
  }

  return codec.decode(resPayloadJson).getOrElseL(errors => {
    throw new ResponseDecodeError(errors);
  });
}

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
