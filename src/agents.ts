import * as Http from 'http';
import * as Https from 'https';

let globalHttpAgent: Http.Agent;
export function getGlobalHttpAgent() {
  if (!globalHttpAgent) {
    globalHttpAgent = new Http.Agent({
      keepAlive: true,
      maxSockets: Infinity,
    });
  }

  return globalHttpAgent;
}

let globalHttpsAgent: Https.Agent;
export function getGlobalHttpsAgent() {
  if (!globalHttpAgent) {
    globalHttpAgent = new Https.Agent({
      keepAlive: true,
      maxSockets: Infinity,
    });
  }

  return globalHttpsAgent;
}
