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
 * Use with `npx playwright test -c playwright.port3100.config.ts`. Delete this
 * file once the parallel work is over; it is scaffolding, not configuration.
 */
const PORT = 3100;

export default {
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    ...(base.webServer as Record<string, unknown>),
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
};
