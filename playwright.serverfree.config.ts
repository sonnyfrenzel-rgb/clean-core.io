/**
 * The suite's config without a web server: for specs that read source, call
 * library code or run scripts, and need neither `next` nor the emulators.
 *
 *   npx playwright test -c playwright.serverfree.config.ts <spec names>
 *
 * A spec that opens a page or calls a route fails here with a connection error;
 * those run with playwright.config.ts (docs/QA-REVIEW-LOOP.md, "Before a push").
 * The gitignored playwright.serverfree.local.config.ts some checkouts keep has
 * the same content and keeps working.
 */
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, webServer: undefined, workers: 4 });
