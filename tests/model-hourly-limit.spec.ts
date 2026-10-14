import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { admitToWindow } from '../lib/rate-limit';
import {
  ADMIN_MODEL_CALLS_PER_HOUR,
  MODEL_CALLS_PER_HOUR,
  MODEL_HOURLY_WINDOW_MS,
  modelHourlyLimit,
} from '../lib/model-hourly-limit';

/**
 * Administrators have an hourly model-call limit of their own (SEC-2026-827,
 * roadmap 3.0.13, owner decision 13.10.2026).
 *
 * Server-free. `assertRateLimit` skips itself under the emulator flag every
 * spec runs with, so the counting rule is checked here through
 * `admitToWindow` — the function `assertRateLimit` applies inside its
 * Firestore transaction — with an in-memory store per key standing in for
 * `rate_limits`. The route's wiring is held in its source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** One `rate_limits` collection in memory: key → stored timestamps, counted by the real rule. */
function store() {
  const docs = new Map<string, number[]>();
  return {
    call(uid: string, isAdmin: boolean, now: number): boolean {
      const { key, max } = modelHourlyLimit(uid, isAdmin);
      const decision = admitToWindow(docs.get(key), now, max, MODEL_HOURLY_WINDOW_MS);
      if (decision.admitted) docs.set(key, decision.timestamps);
      return decision.admitted;
    },
    keys: () => [...docs.keys()],
  };
}

test.describe('the administrators’ hourly model-call limit', () => {
  test('is 200 an hour, in a bucket of its own; a normal account keeps 20', () => {
    expect(ADMIN_MODEL_CALLS_PER_HOUR).toBe(200);
    expect(MODEL_CALLS_PER_HOUR).toBe(20);
    expect(MODEL_HOURLY_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(modelHourlyLimit('a1', true)).toEqual({ key: 'gemini-admin:a1', max: 200 });
    expect(modelHourlyLimit('u1', false)).toEqual({ key: 'gemini:u1', max: 20 });
  });

  test('an administrator’s calls are counted, and the 201st in an hour is refused', () => {
    const s = store();
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < 200; i++) {
      expect(s.call('admin-1', true, t0 + i * 1000), `call ${i + 1} is admitted`).toBe(true);
    }
    expect(s.call('admin-1', true, t0 + 200 * 1000), 'the 201st call in the hour').toBe(false);
    // Still refused just before the first call leaves the window, admitted once it has.
    expect(s.call('admin-1', true, t0 + MODEL_HOURLY_WINDOW_MS - 1)).toBe(false);
    expect(s.call('admin-1', true, t0 + MODEL_HOURLY_WINDOW_MS)).toBe(true);
    expect(s.keys()).toEqual(['gemini-admin:admin-1']);
  });

  test('a normal account is still refused at its 21st call, and the two buckets never share an allowance', () => {
    const s = store();
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < 20; i++) expect(s.call('user-1', false, t0 + i)).toBe(true);
    expect(s.call('user-1', false, t0 + 20)).toBe(false);
    // The same uid with the admin claim is counted elsewhere and is not refused by the normal window.
    expect(s.call('user-1', true, t0 + 21)).toBe(true);
    expect(s.keys().sort()).toEqual(['gemini-admin:user-1', 'gemini:user-1']);
  });

  test('the refusal names the time until the oldest call leaves the window', () => {
    const full = Array.from({ length: 200 }, (_, i) => 1000 + i);
    const decision = admitToWindow(full, 1000 + 30 * 60 * 1000, 200, MODEL_HOURLY_WINDOW_MS);
    expect(decision).toEqual({ admitted: false, retryAfterSeconds: 30 * 60 });
  });

  test('/api/gemini counts an administrator’s unleased call, with one call to the limiter', () => {
    const src = read('app/api/gemini/route.ts');
    expect(src).not.toMatch(/!decodedToken\.admin/);
    expect(src.match(/assertRateLimit\(/g)).toHaveLength(1);
    const choose = src.indexOf('const hourly = modelHourlyLimit(decodedToken.uid, decodedToken.admin === true);');
    const call = src.indexOf('await assertRateLimit(hourly.key, hourly.max, MODEL_HOURLY_WINDOW_MS);');
    expect(choose).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(choose);
  });

  test('the lease route charges an administrator’s lease to the administrators’ bucket', () => {
    const src = read('app/api/transformation/lease/route.ts');
    expect(src).not.toMatch(/!decodedToken\.admin/);
    const choose = src.indexOf('const hourly = modelHourlyLimit(decodedToken.uid, decodedToken.admin === true);');
    expect(choose).toBeGreaterThan(-1);
    expect(src.indexOf('await assertRateLimit(hourly.key, hourly.max, MODEL_HOURLY_WINDOW_MS);')).toBeGreaterThan(choose);
  });

  test('assertRateLimit counts with admitToWindow, so this spec checks the rule production runs', () => {
    const src = read('lib/rate-limit.ts');
    const body = src.slice(src.indexOf('export async function assertRateLimit('), src.indexOf('export function admitToWindow('));
    expect(body).toContain('admitToWindow(snap.data()!.timestamps, now, maxRequests, windowMs)');
    expect(body).toContain('timestamps: decision.timestamps');
  });
});

test('only the limiter\'s own refusal reaches the caller; another error is answered without its text (SEC-2026-831)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/api/gemini/route.ts'), 'utf8').replace(/\r\n/g, '\n');
  const at = src.indexOf('} catch (rateErr');
  expect(at).toBeGreaterThan(0);
  const block = src.slice(at, src.indexOf('\n    }\n', at));
  expect(block).toMatch(/if \(rateErr instanceof QuotaError\) \{\n\s*return NextResponse\.json\(\{ error: rateErr\.message/);
  // Outside that branch nothing of the error's message is returned.
  const rest = block.slice(block.indexOf('}', block.indexOf('instanceof QuotaError')));
  expect(rest).not.toMatch(/rateErr\.message/);
  expect(rest).toMatch(/status: 503/);
});
