import { HttpMethodKind } from './client';
import { t } from '.';

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

type ServiceOperationFunction<O extends ServiceOperation> = (
  options: ServiceOperationOptions<O>
) => Promise<t.TypeOf<O['outputCodec']>>;

export type Service<D extends ServiceManifest> = {
  [O in keyof D['operations']]: ServiceOperationFunction<D['operations'][O]>
};

export function createServiceClient<T extends ServiceManifest>(manifest: T): Client<T> & Service<T> {
  const serviceClient = new Client(manifest);

  return new Proxy(serviceClient, createServiceProxy(manifest)) as Client<T> & Service<T>;
}

class Client<T extends ServiceManifest> {
  constructor(private readonly manifest: T) {}

  executeOperation<K extends keyof T['operations']>(
    operationName: K,
    _: ServiceOperationOptions<T['operations'][K]>
  ): t.TypeOf<T['operations'][K]['outputCodec']> {
    const operation = this.manifest.operations[operationName as string] as T['operations'][K];

    console.log('operation', operationName, this.manifest);

    return operation.outputCodec.decode({}).getOrElseL(_ => {
      throw new Error('Validation failed');
    });
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
