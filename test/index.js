//@ts-check
'use strict';

const Http = require('http');
const Net = require('net');

const Code = require('code');
const IoTs = require('io-ts');
const Lab = require('lab');
const Pino = require('pino');

const TypedHttpClient = require('../');

const lab = (exports.lab = Lab.script());
const { describe, it } = lab;
const { expect } = Code;
const logger = Pino({
  level: 'error',
  // prettyPrint: true,
  serializers: Pino.stdSerializers,
});

describe('Response codecs', () => {
  it('will default to converting an empty response to undefined', async flags => {
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end();
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.undefined();
  });

  it('will default to converting a non-empty response to undefined', async flags => {
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end('there is text here');
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.undefined();
  });

  it('will work with a string codec', async flags => {
    const responsePayloadCodec = IoTs.string;
    /** @type {IoTs.TypeOf<typeof responsePayloadCodec>} */
    const expectedResponse = 'OK';
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify(expectedResponse));
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
      responsePayloadCodec: IoTs.string,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.equal(expectedResponse);
  });

  it('will work with a simple object codec', async flags => {
    const responsePayloadCodec = IoTs.type({
      hello: IoTs.literal('world'),
    });
    /** @type {IoTs.TypeOf<typeof responsePayloadCodec>} */
    const expectedResponse = {
      hello: 'world',
    };
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify(expectedResponse));
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
      responsePayloadCodec,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.equal(expectedResponse);
  });

  it('will preserve extra properties with a non-exact codec', async flags => {
    const responsePayloadCodec = IoTs.type({
      hello: IoTs.literal('world'),
    });
    /** @type {IoTs.TypeOf<typeof responsePayloadCodec>} */
    const expectedResponse = {
      hello: 'world',
    };
    const extraResponseProperties = {
      goodnight: 'moon',
    };
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({ ...expectedResponse, ...extraResponseProperties }));
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
      responsePayloadCodec,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.equal({ ...expectedResponse, ...extraResponseProperties });
  });

  it('will strip extra properties with an exact codec', async flags => {
    const responsePayloadCodec = IoTs.exact(
      IoTs.type({
        hello: IoTs.literal('world'),
      })
    );
    /** @type {IoTs.TypeOf<typeof responsePayloadCodec>} */
    const expectedResponse = {
      hello: 'world',
    };
    const extraResponseProperties = {
      goodnight: 'moon',
    };
    const server = await createHttpServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({ ...expectedResponse, ...extraResponseProperties }));
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
      responsePayloadCodec,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.GET, '/');

    expect(res.statusCode).to.equal(200);
    expect(res.payload).to.be.equal(expectedResponse);
  });
});

describe('Request codecs', () => {
  it('will throw if a payload is provided without a requestPayloadCodec', async () => {
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://0.0.0.0`,
      logger,
    });

    await expect(
      client(TypedHttpClient.HttpMethodKind.POST, '/', {
        payload: 'hello world',
      })
    ).to.reject(TypeError);
  });

  it('will throw if a payload cannot be encoded using the requestPayloadCodec', async () => {
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://0.0.0.0`,
      logger,
      requestPayloadCodec: IoTs.type({ hello: IoTs.string }),
    });

    await expect(
      client(TypedHttpClient.HttpMethodKind.POST, '/', {
        //@ts-ignore
        payload: false,
      })
    ).to.reject(TypeError, /invalid request payload/i);
  });

  it('will preserve extra properties with a non-exact codec', async flags => {
    const requestPayloadCodec = IoTs.type({
      hello: IoTs.literal('world'),
    });
    /** @type {IoTs.TypeOf<typeof requestPayloadCodec>} */
    const expectedResponse = {
      hello: 'world',
    };
    const extraResponseProperties = {
      goodnight: 'moon',
    };
    const requestListener = flags.mustCall(async (req, res) => {
      const payload = await TypedHttpClient.read(req, IoTs.any);

      expect(payload).to.equal({ ...expectedResponse, ...extraResponseProperties });

      res.writeHead(200);
      res.end();
    }, 1);
    const server = await createHttpServer(requestListener);

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
      requestPayloadCodec,
    });

    const res = await client(TypedHttpClient.HttpMethodKind.POST, '/', {
      payload: { ...expectedResponse, ...extraResponseProperties },
    });

    expect(res.statusCode).to.equal(200);
  });

  it('will throw when extra properties are supplied to an exact requestPayloadCodec', async flags => {
    const requestPayloadCodec = IoTs.exact(
      IoTs.type({
        hello: IoTs.literal('world'),
      })
    );
    /** @type {IoTs.TypeOf<typeof requestPayloadCodec>} */
    const expectedResponse = {
      hello: 'world',
    };
    const extraResponseProperties = {
      goodnight: 'moon',
    };
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://0.0.0.0`,
      logger,
      requestPayloadCodec,
    });

    await expect(
      client(TypedHttpClient.HttpMethodKind.POST, '/', {
        payload: { ...expectedResponse, ...extraResponseProperties },
      })
    ).to.reject(TypeError, /invalid request payload/i);
  });
});

describe('The client will behave correctly', () => {
  it('when the server connection fails while sending the request payload', async flags => {
    const server = await createTcpServer(socket => {
      socket.destroy();
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
    });

    await expect(client(TypedHttpClient.HttpMethodKind.GET, '/')).to.reject(Error, /ECONNRESET/);
  });

  it('when the server connection fails while handling the request', async flags => {
    const server = await createHttpServer((req, res) => {
      res.destroy(new Error('There goes...'));
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = TypedHttpClient.createRequestFunction({
      baseUrl: `http://${address.address}:${address.port}`,
      logger,
    });

    await expect(client(TypedHttpClient.HttpMethodKind.GET, '/')).to.reject(Error, /socket hang up/);
  });
});

/**
 * Create a temporary server
 *
 * @param {(request: Http.IncomingMessage, response: Http.ServerResponse) => void} requestListener
 * @returns {Promise<Http.Server>}
 */
function createHttpServer(requestListener) {
  return new Promise((resolve, reject) => {
    const server = Http.createServer(requestListener);
    const onError = err => {
      server.close();

      return reject(err);
    };
    const onListening = () => {
      return resolve(server);
    };

    server
      .on('error', onError)
      .on('listening', onListening)
      .listen(0, '127.0.0.1');
  });
}

/**
 * Create a temporary server
 *
 * @param {(socket: Net.Socket) => void} connectionListener
 * @returns {Promise<Net.Server>}
 */
function createTcpServer(connectionListener) {
  return new Promise((resolve, reject) => {
    const server = Net.createServer(connectionListener);
    const onError = err => {
      server.close();

      return reject(err);
    };
    const onListening = () => {
      return resolve(server);
    };

    server
      .on('error', onError)
      .on('listening', onListening)
      .listen(0, '127.0.0.1');
  });
}
