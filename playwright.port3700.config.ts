import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The same suite, on a port nobody else is holding.
 *
 * A copy of `playwright.port3100.config.ts` for roadmap step 0.17: 3100, 3200,
 * 3500 and 3600 were all taken by other agents on this machine at the time, and
 * the shared config reuses whatever dev server is listening on 3000. When one
 * run finishes it stops the server the others are still using, and every spec
 * left standing dies with ERR_CONNECTION_REFUSED or `TypeError: fetch failed`
 * from the seed helper — a failure that looks exactly like a broken change and
 * is not one.
 *
 * Use with `npx playwright test -c playwright.port3700.config.ts`. Delete this
 * file once the parallel work is over; it is scaffolding, not configuration.
 */
const PORT = 3700;
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    ...server,
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    // The seed helper posts to the app under test, so it has to be told where
    // that is — the same reason this file exists.
    env: { ...(server?.env ?? {}), TEST_BASE_URL: `http://localhost:${PORT}` },
  },
});
