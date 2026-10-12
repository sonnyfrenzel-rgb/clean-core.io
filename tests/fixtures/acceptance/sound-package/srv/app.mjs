// Fixture: an app factory with no side effect on import.
import http from 'node:http';
import { listItems } from './engine.mjs';

export function createApp() {
  return http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listItems()));
  });
}
