import * as Http from 'http';

/**
 * Create a temporary server
 *
 * @param {(request: Http.IncomingMessage, response: Http.ServerResponse) => void} requestListener
 * @returns {Promise<Http.Server>}
 */
export function createHttpServer(
  requestListener: (req: Http.IncomingMessage, res: Http.ServerResponse) => any
): Promise<Http.Server> {
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
