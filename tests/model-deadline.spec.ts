import { test, expect } from '@playwright/test';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import { installModelFetchDispatcher, MODEL_FETCH_TIMEOUTS_MS } from '../lib/model-fetch-dispatcher';
import {
  CLOUD_RUN_REQUEST_TIMEOUT_MS,
  MODEL_CALL_DEADLINE_MS,
  MODEL_TIMEOUT_CODE,
  modelDeadline,
  modelTimeoutMessage,
} from '../lib/model-deadline';

/**
 * The deadline of one `/api/gemini` request (`lib/model-deadline.ts`).
 *
 * 13.10.2026, production: an engine-led Transformation of a 1,848-line program
 * made fill calls of 9–292 s; one reached Cloud Run's 300 s limit and was
 * answered 504 with no body — the route had no bound of its own, the provider
 * call ran on until the request went away, and the browser read "Unknown
 * error". The route now ends the call itself before that limit, with a code.
 *
 * Server-free: the helper is pure, the route is read in its source. The route
 * itself runs in `tests/gemini-route-deadline.spec.ts` — a provider that never
 * answers until its signal aborts, a 504 with this code, the signal observed
 * (emulators; under CI a missing emulator fails it instead of skipping).
 */

const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

test.describe('the deadline', () => {
  test('ends the call before Cloud Run ends the request, with room for the gates and the receipt', () => {
    expect(MODEL_CALL_DEADLINE_MS).toBeLessThanOrEqual(CLOUD_RUN_REQUEST_TIMEOUT_MS - 20_000);
    expect(MODEL_CALL_DEADLINE_MS).toBeGreaterThanOrEqual(240_000);
    expect(MODEL_CALL_DEADLINE_MS).toBeGreaterThanOrEqual(CLOUD_RUN_REQUEST_TIMEOUT_MS - 60_000);
    expect(modelTimeoutMessage()).toContain(`${MODEL_CALL_DEADLINE_MS / 1000} seconds`);
    // Owner decision 13.10.2026: the app service runs requests for 900 s, the deadline 870 s.
    expect(CLOUD_RUN_REQUEST_TIMEOUT_MS).toBe(900_000);
    expect(MODEL_CALL_DEADLINE_MS).toBe(870_000);
  });

  test('the app service keeps the request limit the deadline is measured against', () => {
    // deploy.yml sets --timeout=900 for the app service (owner, 13.10.2026);
    // without one Cloud Run's default of 300 s applies. Either way it must be
    // the CLOUD_RUN_REQUEST_TIMEOUT_MS the deadline is measured against.
    const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const app = yml.slice(yml.lastIndexOf('deploy-cloudrun@'));
    const set = app.match(/--timeout=(\d+)/);
    expect(set ? Number(set[1]) * 1000 : 300_000).toBe(CLOUD_RUN_REQUEST_TIMEOUT_MS);
  });

  test('aborts when it passes, and says that it was the deadline', async () => {
    const d = modelDeadline(20);
    expect(d.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(true);
    d.clear();
  });

  test('follows the caller going away, which is not a timeout', () => {
    const outer = new AbortController();
    const d = modelDeadline(60_000, outer.signal);
    outer.abort();
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(false);
    d.clear();
    const gone = new AbortController();
    gone.abort();
    expect(modelDeadline(60_000, gone.signal).signal.aborted).toBe(true);
  });

  test('cleared, it never fires', async () => {
    const d = modelDeadline(20);
    d.clear();
    await new Promise((r) => setTimeout(r, 60));
    expect(d.signal.aborted).toBe(false);
    expect(d.timedOut()).toBe(false);
  });
});

test.describe('the Gemini route keeps it', () => {
  const src = code('app/api/gemini/route.ts');

  test('counted from the request\'s arrival, handed to the provider call and to the retries', () => {
    expect(src).toMatch(/const arrivedAt = Date\.now\(\);\s*let deadline: ModelDeadline \| null = null;\s*try \{/);
    expect(src).toContain('deadline = modelDeadline(Math.max(1_000, MODEL_CALL_DEADLINE_MS - (Date.now() - arrivedAt)), abortSignal);');
    const call = src.slice(src.indexOf('const answer: ModelAnswer = stubbed'), src.indexOf('const completion = modelCompletion(answer)'));
    expect(call.match(/abortSignal: callSignal/g)).toHaveLength(2);
    expect(call).toContain('}, undefined, undefined, callSignal);');
    // No provider call without it.
    expect(call).not.toMatch(/:\s*undefined,\s*\}\);/);
  });

  test('a call the deadline ended is answered 504 with its code, and the timer is cleared whatever happens', () => {
    const caught = src.slice(src.lastIndexOf('} catch (error: unknown) {'));
    expect(caught).toMatch(/if \(deadline\?\.timedOut\(\)\) \{[\s\S]*?return NextResponse\.json\(\{ error: modelTimeoutMessage\(\), code: MODEL_TIMEOUT_CODE \}, \{ status: 504 \}\);/);
    expect(src.slice(src.lastIndexOf('} finally {'))).toContain('deadline?.clear();');
    expect(MODEL_TIMEOUT_CODE).toBe('model-timeout');
  });
});

/**
 * Hotfix 3.0.22 (HF-c): Node's `fetch` gives up after 300 s without a response
 * header — before the 870 s deadline. The server raises that limit at start
 * (`instrumentation.ts` → `lib/model-fetch-dispatcher.ts`). Measured here with
 * the real built-in `fetch` against a server that answers after 1.5 s.
 */
test.describe('the transport under the deadline', () => {
  test('lets a call run to the deadline: header and body limits at Cloud Run\'s request limit', () => {
    expect(MODEL_FETCH_TIMEOUTS_MS.headersTimeout).toBeGreaterThan(MODEL_CALL_DEADLINE_MS);
    expect(MODEL_FETCH_TIMEOUTS_MS.bodyTimeout).toBeGreaterThan(MODEL_CALL_DEADLINE_MS);
    expect(MODEL_FETCH_TIMEOUTS_MS.headersTimeout).toBe(CLOUD_RUN_REQUEST_TIMEOUT_MS);
  });

  test('is installed when the server starts, in the Node runtime only', () => {
    const src = code('instrumentation.ts');
    expect(src).toMatch(/export async function register\(\)/);
    expect(src).toMatch(/if \(process\.env\.NEXT_RUNTIME !== 'nodejs'\) return;/);
    expect(src).toContain('installModelFetchDispatcher();');
  });

  test('is the dispatcher the built-in fetch really uses', async () => {
    const server = http.createServer((_req, res) => { setTimeout(() => res.end('late'), 1_500); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/`;
    try {
      installModelFetchDispatcher({ headersTimeout: 300, bodyTimeout: 300 });
      const tooShort = await fetch(url).then(() => 'answered', (err: { cause?: { code?: string } }) => err.cause?.code);
      expect(tooShort).toBe('UND_ERR_HEADERS_TIMEOUT');

      installModelFetchDispatcher({ headersTimeout: 10_000, bodyTimeout: 10_000 });
      expect(await (await fetch(url)).text()).toBe('late');
    } finally {
      installModelFetchDispatcher();
      server.close();
    }
  });
});
