import * as Http from 'http';

import { client, t, HttpMethodKind } from '.';

export interface ServiceManifest {
  baseUrl: string;
  operations: {
    [key: string]: ServiceOperation;
  };
}

interface ServiceOperation {
  method: HttpMethodKind;
  pathTemplate: string;
  pathParamCodec?: t.HasProps | t.ExactType<any>;
  inputCodec: t.Any;
  outputCodec: t.Any;
}

type ServiceOperationOptions<O extends ServiceOperation> = {
  params: O['pathParamCodec'] extends t.Any ? t.TypeOf<O['pathParamCodec']> : never;
  data: t.TypeOf<O['inputCodec']>;
};

interface ServiceOperationResult<P> {
  statusCode: number;
  headers: Http.IncomingHttpHeaders;
  payload: P;
}

type ServiceOperationFunction<O extends ServiceOperation> = (
  options: ServiceOperationOptions<O>
) => Promise<ServiceOperationResult<t.TypeOf<O['outputCodec']>>>;

export type Service<D extends ServiceManifest> = {
  [O in keyof D['operations']]: ServiceOperationFunction<D['operations'][O]>
};

export function createServiceClient<T extends ServiceManifest>(manifest: T): Client<T> & Service<T> {
  const serviceClient = new Client(manifest);

  return new Proxy(serviceClient, createServiceProxy(manifest)) as Client<T> & Service<T>;
}

class Client<T extends ServiceManifest> {
  private readonly client: typeof client;

  constructor(private readonly manifest: T) {
    this.client = client.withDefaults({
      baseUrl: manifest.baseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  async executeOperation<K extends keyof T['operations']>(
    operationName: K,
    options: ServiceOperationOptions<T['operations'][K]>
  ): Promise<t.TypeOf<T['operations'][K]['outputCodec']>> {
    const operation = this.manifest.operations[operationName as string] as T['operations'][K];
    let payload: any = undefined;

    if (operation.inputCodec) {
      if (!operation.inputCodec.is(options.data)) {
        throw new TypeError(`Invalid data`);
      }

      payload = JSON.stringify(operation.inputCodec.encode(options.data));
    }

    const path = operation.pathTemplate.replace(/\{([^}]+)\}/g, (_, $1) => {
      return (options.params as any)[$1];
    });
    const res = await this.client.request(operation.method, path, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'typed-http-client',
      },
      payload,
    });

    const resBuffer = await this.client.read(res);
    const decodedResPayload = operation.outputCodec
      .decode(JSON.parse(resBuffer.toString('utf8')))
      .getOrElseL(errors => {
        console.error(errors);
        throw new Error('Validation failed');
      });

    return {
      headers: res.headers,
      payload: decodedResPayload,
      statusCode: res.statusCode,
    };
  }
}

function createServiceProxy<T extends ServiceManifest>(manifest: T): ProxyHandler<Client<T>> {
  return {
    get<K extends keyof T['operations']>(
      client: Client<T>,
      operationName: K,
      receiver: any
    ): ServiceOperationFunction<T['operations'][K]> {
      if (!Object.prototype.hasOwnProperty.call(manifest.operations, operationName)) {
        return Reflect.get(client, operationName, receiver);
      }

      return function(
        options: ServiceOperationOptions<T['operations'][K]>
      ): t.TypeOf<T['operations'][K]['outputCodec']> {
        return client.executeOperation(operationName, options);
      };
    },
  };
}
