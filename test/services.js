//@ts-check
'use strict';

const Http = require('http');
const Net = require('net');

const Code = require('code');
const Lab = require('lab');

const { createServiceClient, t, HttpMethodKind } = require('../');

const lab = (exports.lab = Lab.script());
const { describe, it } = lab;
const { expect } = Code;

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
});
