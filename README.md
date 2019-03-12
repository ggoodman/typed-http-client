# Typed HTTP Client

This is a tool for building a strongly-typed client for interacting with a JSON HTTP(S) service. [io-ts](https://github.com/gcanti/io-ts) provides both compile-time typing as well as runtime typechecking for all inputs (path params and payload) and outputs (response body) to give users confidence that the data being sent and being received meets expectations.

## Example

```typescript
import { createServiceClient, t } from 'typed-http-client';

const apiManifest = {
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
      ])
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

const client = createServiceClient({
  baseUrl: `https://<ADDRESS>`,
  operations: apiManifest,
});

const result = await client.putWebtask({
  data: {
    code: 'hello world',
    //@ts-ignore
    no: 'good', // This would cause the type checker to complain but would would be dropped at runtime.
  },
  params: {
    container: 'container',
    name: 'name',
  },
});

// result is { container: string, name: string, meta: { [key: string]: string } }
```
