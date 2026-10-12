// Fixture: FP-TEST-03, the server starts on import unless NODE_ENV is 'test'.
import http from 'node:http';
import { listItems } from './engine.mjs';

export function createApp() {
  return http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listItems()));
  });
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(8080, () => console.log('listening on 8080'));
}
