import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PRODUCT_GEMINI_MODEL } from '../lib/constants';

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
