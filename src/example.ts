import * as IoTs from 'io-ts';
import * as TypedHttpClient from './';

const PutWebtaskRequest = IoTs.exact(
  IoTs.type({
    code: IoTs.refinement(IoTs.string, s => !!s.match(/abcd/), 'ValidCode'),
    meta: IoTs.dictionary(IoTs.string, IoTs.string),
    secrets: IoTs.dictionary(IoTs.string, IoTs.string),
  })
);
type PutWebtaskRequest = IoTs.TypeOf<typeof PutWebtaskRequest>;

const PutWebtaskResponse = IoTs.type({
  name: IoTs.string,
  meta: IoTs.dictionary(IoTs.string, IoTs.string),
});
type PutWebtaskResponse = IoTs.TypeOf<typeof PutWebtaskResponse>;

export class WebtaskClient {
  private readonly putWebtaskFn: TypedHttpClient.RequestFunction<typeof PutWebtaskRequest, typeof PutWebtaskResponse>;

  constructor(baseUrl: string = 'https//sandbox.auth0-extend.com') {
    this.putWebtaskFn = TypedHttpClient.createRequestFunction({
      baseUrl,
      requestPayloadCodec: PutWebtaskRequest,
      responsePayloadCodec: PutWebtaskResponse,
    });
  }

  async putWebtask(container: string, name: string, payload: PutWebtaskRequest): Promise<PutWebtaskResponse> {
    const result = await this.putWebtaskFn(TypedHttpClient.HttpMethodKind.PUT, `/${container}/${name}`, {
      payload,
    });

    if (result.statusCode !== 200) {
      throw new Error(`Unexpected responsse: ${result.statusCode}`);
    }

    return result.payload;
  }
}
