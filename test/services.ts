//@ts-check
'use strict';

import { expect } from 'code';
import { script, Flags } from 'lab';

import { client as httpClient, createServiceClient, t, HttpMethodKind, Reader } from '../';
import { createHttpServer } from './lib/server';

const lab = (exports.lab = script());
const { describe, it } = lab;

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

  it('will strip excess properties on payload objects with strict codecs', async (flags: Flags) => {
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

  it('can be constructed from a suitable manifest', async (flags: Flags) => {
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

  describe('with mapArguments', () => {
    it('can map semantic input arguments those required by the manifest', async (flags: Flags) => {
      const server = await createHttpServer(async (req, res) => {
        const data = await httpClient.read(req);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            method: req.method,
            path: req.url,
            payload: JSON.parse(data.toString('utf-8')),
          })
        );
      });

      flags.onCleanup = async () => server.close();

      const address = server.address();
      const client = createServiceClient({
        baseUrl: `http://${address.address}:${address.port}`,
        operations: {
          putWebtask: {
            method: HttpMethodKind.PUT,
            pathTemplate: '/path/{hello}',
            inputCodec: t.type({
              hello: t.string,
            }),
            outputCodec: t.type({
              path: t.literal('/path/world'),
              method: t.literal('PUT'),
              // query: t.type({
              //   hello: t.literal('world')
              // }),
              payload: t.type({
                hello: t.literal('world'),
              }),
            }),
            mapArguments(options: { hello: string }) {
              return {
                params: {
                  hello: options.hello,
                },
                data: {
                  hello: options.hello,
                },
              };
            },
          },
        },
      });

      const result = await client.putWebtask({
        hello: 'world',
      });

      expect(result).to.be.an.object();
      expect(result.statusCode).to.equal(200);
      // expect(result.headers).to.be.an.object();
      expect(result.payload).to.equal({
        method: 'PUT',
        path: '/path/world',
        payload: {
          hello: 'world',
        },
      });

      expect(client).to.exist();
      expect(client.putWebtask).to.be.a.function();
    });
  });
});
