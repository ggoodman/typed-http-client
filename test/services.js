//@ts-check
'use strict';

const Http = require('http');
const Net = require('net');

const Code = require('code');
const Lab = require('lab');

const { client: httpClient, createServiceClient, t, HttpMethodKind } = require('../');

const lab = (exports.lab = Lab.script());
const { describe, it } = lab;
const { expect } = Code;

const webtaskApiOperations = {
  putWebtask: {
    inputCodec: t.exact(
      t.intersection([
        t.type({
          code: t.string,
        }),
        t.partial({
          meta: t.record(t.string, t.string),
          secrets: t.record(t.string, t.string),
        }),
      ]),
      'PutWebtaskPayload'
    ),
    method: HttpMethodKind.PUT,
    outputCodec: t.exact(
      t.type({
        container: t.string,
        name: t.string,
        meta: t.record(t.string, t.string),
      })
    ),
    pathParamCodec: t.type({
      container: t.string,
      name: t.string,
    }),
    pathTemplate: '/{container}/{name}',
  },
};

describe('Typed api clients', () => {
  it('can be constructed from a suitable manifest', async () => {
    const client = createServiceClient({
      baseUrl: 'http://0.0.0.0',
      operations: {
        putWebtask: {
          inputCodec: t.any,
          method: HttpMethodKind.PUT,
          outputCodec: t.string,
          pathTemplate: '/',
        },
      },
    });

    expect(client).to.exist();
    expect(client.putWebtask).to.be.a.function();
  });

  it('will strip excess properties on payload objects with strict codecs', async flags => {
    const expectedRequestPayload = {
      code: 'hello world',
    };
    const expectedResponsePayload = {
      container: 'container',
      name: 'name',
      meta: {},
    };
    const requestListener = flags.mustCall(async (req, res) => {
      const buf = await httpClient.read(req);
      const payload = JSON.parse(buf.toString('utf8'));

      expect(req.url).to.equal(`/${expectedResponsePayload.container}/${expectedResponsePayload.name}`);
      expect(payload).to.equal(expectedRequestPayload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ...expectedResponsePayload,
          no: 'good',
        })
      );
    }, 1);
    const server = await createHttpServer(requestListener);

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = createServiceClient({
      baseUrl: `http://${address.address}:${address.port}`,
      operations: webtaskApiOperations,
    });

    const result = await client.putWebtask({
      data: {
        code: 'hello world',
        //@ts-ignore
        no: 'good',
      },
      params: {
        container: 'container',
        name: 'name',
      },
    });

    expect(result).to.be.an.object();
    expect(result.statusCode).to.equal(200);
    // expect(result.headers).to.be.an.object();
    expect(result.payload).to.equal(expectedResponsePayload);
  });

  it('can be constructed from a suitable manifest', async flags => {
    const server = await createHttpServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          container: 'container',
          name: 'name',
          meta: {},
        })
      );
    });

    flags.onCleanup = async () => server.close();

    const address = server.address();
    const client = createServiceClient({
      baseUrl: `http://${address.address}:${address.port}`,
      operations: webtaskApiOperations,
    });

    const result = await client.putWebtask({
      data: {
        code: 'hello world',
      },
      params: {
        container: 'container',
        name: 'name',
      },
    });

    expect(result).to.be.an.object();
    expect(result.statusCode).to.equal(200);
    // expect(result.headers).to.be.an.object();
    expect(result.payload).to.equal({
      name: 'name',
      container: 'container',
      meta: {},
    });

    expect(client).to.exist();
    expect(client.putWebtask).to.be.a.function();
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
