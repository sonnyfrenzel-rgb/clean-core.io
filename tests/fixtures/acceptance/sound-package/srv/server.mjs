// Fixture: the only place that starts a server, and only when run directly.
import { pathToFileURL } from 'node:url';
import { createApp } from './app.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(Number(process.env.PORT ?? 8080));
}
