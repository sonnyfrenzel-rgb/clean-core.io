import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The same suite, on a port nobody else is holding.
 *
 * Several agents run this suite against this machine at the same time, and the
 * shared config reuses whatever dev server is listening on 3000. When one run
 * finishes it stops the server the others are still using, and every spec left
 * standing dies with ERR_CONNECTION_REFUSED or `TypeError: fetch failed` from
 * the seed helper — a failure that looks exactly like a broken change and is
 * not one.
 *
 * Use with `npx playwright test -c playwright.port4200.config.ts`. Export
 * `TEST_BASE_URL=http://localhost:4200` in the shell as well: `webServer.env`
 * reaches the dev server, and `tests/helpers/admin-seed.ts` runs in the test
 * process, which would otherwise seed the app on port 3000.
 *
 * Delete this file once the parallel work is over; it is scaffolding, not
 * configuration.
 */
const PORT = 4200;
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    ...server,
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    env: { ...(server?.env ?? {}), TEST_BASE_URL: `http://localhost:${PORT}` },
  },
});
