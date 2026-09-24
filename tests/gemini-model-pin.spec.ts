import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PRODUCT_GEMINI_MODEL, NAMING_GEMINI_MODEL } from '../lib/constants';

/**
 * One place decides which model the product calls.
 *
 * It did not, until 23.09.2026: `'gemini-3-flash-preview'` was written out at
 * twelve call sites across `app/`, `components/`, `hooks/` and `lib/`, so the
 * default parameter in `lib/gemini.ts` was the default of nothing — every caller
 * passed the string. A model change meant editing twelve files and hoping none
 * was missed, which is how a product ends up half on one model and half on
 * another without anyone deciding it.
 *
 * That it was a *preview* model made it worse than untidy. `app/api/gemini/route.ts`
 * said so itself ("PREVIEW = opt-in canary (may change or retire)"), the 3-flash
 * line never reached GA, and Google shipped 3.5, 3.6, 3.7 and 3.8 flash as GA
 * while it stayed a canary. Sonny, 23.09.2026: `gemini-3.8-flash`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

/** Every reviewable source file, excluding the two places a model name belongs. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.next', '.git', 'docs', 'scratch', 'tmp', 'dist', 'tests']);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.resolve(ROOT, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
    }
  };
  for (const top of ['app', 'components', 'hooks', 'lib']) walk(top);
  return out;
}

test('the model the product calls is named in exactly one place', () => {
  // `lib/constants.ts` holds the choice; `app/api/gemini/route.ts` holds the
  // register of what may be called at all. Everywhere else reads the constant.
  const allowed = new Set(['lib/constants.ts', 'app/api/gemini/route.ts']);
  const offenders = sourceFiles().filter((file) => !allowed.has(file) && /['"`]gemini-[0-9]/.test(read(file)));
  expect(offenders, `these files name a Gemini model instead of importing PRODUCT_GEMINI_MODEL:\n${offenders.join('\n')}`).toEqual([]);

  // The fixture is not vacuous: there really are call sites, and they really
  // reach the constant.
  const callers = sourceFiles().filter((f) => /PRODUCT_GEMINI_MODEL/.test(read(f)));
  expect(callers.length, 'nothing imports the constant — the sweep above would pass on an empty repository').toBeGreaterThan(5);
});

test('the product model is a GA model, and the register agrees with it', () => {
  // The whole point of the move: not a newer model, a model that cannot be
  // withdrawn under the product.
  expect(PRODUCT_GEMINI_MODEL, 'the product default is a preview model again').not.toMatch(/preview/i);

  const route = read('app/api/gemini/route.ts');
  const register = route.slice(route.indexOf('const ALLOWED_MODELS'), route.indexOf('])', route.indexOf('const ALLOWED_MODELS')));
  expect(register, 'the product default is not in the server-side register, so every call would be refused').toContain(PRODUCT_GEMINI_MODEL);
});

test('the naming stage has its own model, a GA one, in the register, and only it uses it (17.3)', () => {
  expect(NAMING_GEMINI_MODEL, 'the naming model is a preview model').not.toMatch(/preview/i);
  const route = read('app/api/gemini/route.ts');
  const register = route.slice(route.indexOf('const ALLOWED_MODELS'), route.indexOf('])', route.indexOf('const ALLOWED_MODELS')));
  expect(register, 'the naming model is not in the server-side register, so every naming call would be refused').toContain(NAMING_GEMINI_MODEL);
  // The exception is one stage wide: the naming client, and nothing else.
  const users = sourceFiles().filter((f) => f !== 'lib/constants.ts' && /NAMING_GEMINI_MODEL/.test(read(f)) && !f.startsWith('tests/'));
  expect(users).toEqual(['lib/process-naming-client.ts']);
});

test('the deploy-time escape hatch cannot run an unreviewed model', async () => {
  const route = read('app/api/gemini/route.ts');
  // `GEMINI_MODEL` exists for one case: Google withdraws a model and the product
  // stops until a deploy lands. It must not become a way around the register —
  // the check and the fallback are what make it safe, so both are pinned.
  expect(route).toMatch(/const override = process\.env\.GEMINI_MODEL\?\.trim\(\);/);
  expect(route).toMatch(/if \(override && ALLOWED_MODELS\.has\(override\)\) return override;/);
  expect(route).toMatch(/return PRODUCT_GEMINI_MODEL;/);
  // And the body default goes through it rather than around it.
  expect(route).toMatch(/model = productModel\(\),/);
});

/**
 * Roadmap 17.1 — every entry of the register has been called, and answered.
 *
 * `gemini-2.5-pro` stood in the register as "GA — stable fallback" while the
 * production key got HTTP 404, "no longer available to new users", for it. The
 * escape hatch `GEMINI_MODEL` accepted the name, so the one thing the register
 * is for — a model that can be switched to without a deploy when Google
 * withdraws the default — pointed at a door that was walled up.
 *
 * The check that would have caught it is a real `generateContent` call, and it
 * is deliberately *not* in this file. The suite runs on every push, in
 * environments with no Gemini key and sometimes no network, and a spec that
 * reaches the provider would go red for the environment instead of for the
 * register. `ListModels` is no substitute either: it still lists
 * `gemini-2.5-pro` for the key that cannot call it.
 *
 * So the call lives in `scripts/check-gemini-register.mjs`, which writes what
 * came back, and what this test holds is the register and that record together:
 * a model may be in the register only if it has been called and answered. The
 * test needs no key and no network, costs nothing, and goes red for exactly one
 * reason — somebody added a model without probing it, or the probe found a dead
 * one. Re-running the script is the whole remedy.
 *
 * What it cannot do is notice that a model died *after* the last probe; nothing
 * offline can. That is a recurring network call, and it belongs where the other
 * recurring checks already are — `.github/workflows/qa-weekly-health.yml` — as
 * `node scripts/check-gemini-register.mjs`, which exits 1 on a dead entry and 2
 * when there is no key. Wiring it in is not part of this step.
 */
test('every model in the register has been called, and answered', () => {
  const route = read('app/api/gemini/route.ts');
  const start = route.indexOf('const ALLOWED_MODELS');
  const block = route.slice(start, route.indexOf('])', start));
  const register = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  expect(register.length, 'no model names were parsed out of the register — the assertions below would be empty').toBeGreaterThan(0);

  const ledger = JSON.parse(read('tests/gemini-register-liveness.json')) as {
    models: Record<string, { httpStatus: number; answered: boolean; checkedAt: string; providerMessage?: string }>;
  };

  const unprobed = register.filter((m) => !ledger.models[m]);
  expect(
    unprobed,
    `these models may be called but were never probed. Run: node scripts/check-gemini-register.mjs --write\n${unprobed.join('\n')}`,
  ).toEqual([]);

  const dead = register
    .filter((m) => !ledger.models[m].answered)
    .map((m) => `${m} — HTTP ${ledger.models[m].httpStatus} on ${ledger.models[m].checkedAt}: ${ledger.models[m].providerMessage ?? 'no message recorded'}`);
  expect(dead, `the register offers models the provider refused:\n${dead.join('\n')}`).toEqual([]);

  // The record describes this register and no other: a leftover entry for a
  // model that has since been struck is how a ledger starts drifting into a
  // list of models nobody has looked at in a year.
  expect(Object.keys(ledger.models).sort(), 'the record names models that are not in the register').toEqual([...register].sort());

  // Each record says which call was made and when, so the claim can be re-read
  // rather than taken on trust.
  for (const model of register) {
    expect(ledger.models[model].checkedAt, `no date recorded for ${model}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof ledger.models[model].httpStatus, `no HTTP status recorded for ${model}`).toBe('number');
  }
});
