import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Privacy policy section 7 says the public pages contact nobody but
 * clean-core.io before sign-in (`noRequestWithoutSignIn`,
 * lib/legal/open-values.ts). The Firebase SDK is what breaks that: initialising
 * Auth loads Google's sign-in frame on mobile browsers and Safari, and with a
 * persisted account it reloads it from identitytoolkit.googleapis.com
 * (@firebase/auth `_shouldInitProactively`, `reloadAndSetCurrentUserOrClear`).
 *
 * Source half (no server): no public page reaches a Firebase module through a
 * static import; the landing's dialogs mount only when asked or when a redirect
 * is pending; a redirect result is asked for only behind that mark, and the mark
 * is set before any redirect leaves. The rendered half, which records every
 * request a signed-out visit makes, is tests/public-no-third-party-requests.spec.ts.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Route entry files Next renders for a public URL: everything under app/ except the signed-in shell and the API. */
const ENTRY_NAMES = new Set(['page.tsx', 'layout.tsx', 'not-found.tsx', 'error.tsx', 'template.tsx', 'loading.tsx', 'global-error.tsx']);

/**
 * Public routes that are allowed to load Auth on their own load path, and why.
 * `/auth/action` is the page Firebase's own e-mails link to (password reset,
 * address confirmation): the reader is in the middle of an account action, and
 * the page cannot do its work without Auth.
 */
const ALLOWED_ENTRIES = new Set(['app/auth/action/page.tsx']);

function publicEntries(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (rel === 'app/(app)' || rel === 'app/api') continue;
        walk(rel);
      } else if (ENTRY_NAMES.has(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk('app');
  return out.sort();
}

/** Module specifiers that bring Firebase in: the SDK itself and the two modules that initialise it. */
const FORBIDDEN_FILES = new Set(['lib/firebase.ts', 'lib/firebase-app.ts']);
const isForbiddenPackage = (spec: string) => /^(firebase|@firebase)(\/|$)/.test(spec);

/**
 * The static imports of one source file — `import … from`, `export … from`,
 * bare `import '…'`. Type-only imports are erased by the compiler and dynamic
 * `import()` loads on demand, so neither is on the load path.
 */
function staticImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  const re = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";=()]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
  for (const m of code.matchAll(re)) {
    if (m[5]) {
      specs.push(m[5]);
      continue;
    }
    if (m[2]) continue; // import type … / export type …
    const clause = m[3] ?? '';
    // `import { type A, type B } from` is erased as a whole.
    const braces = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (braces && braces[1].split(',').every((part) => !part.trim() || /^type\s/.test(part.trim()))) continue;
    specs.push(m[4]);
  }
  return specs;
}

function resolve(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const abs = path.join(ROOT, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** Every path from `entry` to a Firebase module, as chains of files; empty when there is none. */
function firebaseChains(entry: string): string[] {
  const chains: string[] = [];
  const seen = new Set<string>();
  const visit = (rel: string, trail: string[]) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!/\.(tsx?|jsx?|mjs)$/.test(rel)) return;
    for (const spec of staticImports(read(rel))) {
      if (isForbiddenPackage(spec)) {
        chains.push([...trail, rel, spec].join(' -> '));
        continue;
      }
      const next = resolve(rel, spec);
      if (!next) continue;
      if (FORBIDDEN_FILES.has(next)) {
        chains.push([...trail, rel, next].join(' -> '));
        continue;
      }
      visit(next, [...trail, rel]);
    }
  };
  visit(entry, []);
  return chains;
}

test.describe('no public page loads Firebase on its own', () => {
  test('the import walker sees what it is meant to see', () => {
    // A guard that finds nothing must prove it can find something.
    expect(staticImports("import { getAuth } from '@/lib/firebase-app';")).toEqual(['@/lib/firebase-app']);
    expect(staticImports("import type { User } from 'firebase/auth';")).toEqual([]);
    expect(staticImports("import { type User } from 'firebase/auth';")).toEqual([]);
    expect(staticImports("const m = import('firebase/auth');")).toEqual([]);
    expect(staticImports("export { getAuth } from './firebase-app';")).toEqual(['./firebase-app']);
    expect(staticImports("import 'firebase/auth';")).toEqual(['firebase/auth']);
    // A type alias before an import must not hide the import behind it.
    expect(staticImports("export type Foo = { a: 1 };\nimport { x } from 'firebase/auth';")).toEqual(['firebase/auth']);
    expect(firebaseChains('components/LandingModals.tsx').length).toBeGreaterThan(0);
    expect(firebaseChains('app/(app)/layout.tsx').length).toBeGreaterThan(0);
  });

  test('every public route is found', () => {
    const entries = publicEntries();
    for (const rel of ['app/page.tsx', 'app/layout.tsx', 'app/datenschutz/page.tsx', 'app/impressum/page.tsx', 'app/terms/page.tsx', 'app/catalog/page.tsx']) {
      expect(entries, rel).toContain(rel);
    }
    expect(entries.some((rel) => rel.startsWith('app/(app)/'))).toBe(false);
  });

  for (const entry of publicEntries()) {
    if (ALLOWED_ENTRIES.has(entry)) continue;
    test(`${entry} reaches no Firebase module through a static import`, () => {
      expect(firebaseChains(entry), `${entry} loads Firebase on its load path`).toEqual([]);
    });
  }
});

test.describe('the landing asks Firebase only when the reader does', () => {
  test('the dialogs mount when asked or when a redirect is pending, not when the browser is idle', () => {
    const lazy = read('components/landing/LandingModalsLazy.tsx');
    expect(lazy).not.toContain('requestIdleCallback');
    expect(lazy).not.toMatch(/setTimeout\(/);
    expect(lazy).toMatch(/searchParams\.has\('auth'\) \|\| searchParams\.has\('legal'\)/);
    expect(lazy).toMatch(/useSyncExternalStore\(noChanges, isRedirectPending, \(\) => false\)/);
    expect(lazy).toMatch(/const wanted = asked \|\| redirectPending;/);
    expect(lazy).toMatch(/if \(!wanted && !mounted\) return null;/);
    // The dialog component itself stays a dynamic import.
    expect(lazy).toMatch(/dynamic\(\(\) => import\('@\/components\/LandingModals'\)/);
    expect(staticImports(lazy)).not.toContain('@/components/LandingModals');
  });

  test('LandingModals does not initialise Auth on render', () => {
    const src = read('components/LandingModals.tsx');
    const body = src.slice(src.indexOf('export default function LandingModals()'));
    // The first statements of the component used to be `const auth = getAuth();`.
    const head = body.slice(0, body.indexOf('const afterSignIn'));
    expect(head).not.toContain('getAuth(');
    // Every getAuth() call sits inside a handler or an effect, never at the component's top level.
    for (const line of body.split('\n')) {
      if (/^ {2}const auth = getAuth\(\)/.test(line)) throw new Error(`top-level Auth initialisation: ${line.trim()}`);
    }
    // Initialised once the access dialog is open, so a Safari popup is not blocked.
    expect(body).toMatch(/useEffect\(\(\) => \{\s*if \(authDialogOpen\) getAuth\(\);\s*\}, \[authDialogOpen\]\);/);
  });

  test('a redirect result is asked for only behind the pending mark, and the mark is cleared after', () => {
    const src = read('components/LandingModals.tsx');
    const calls = src.split('getRedirectResult(').length - 1;
    expect(calls).toBe(1);
    const at = src.indexOf('getRedirectResult(auth)');
    expect(at).toBeGreaterThan(-1);
    const effect = src.slice(src.lastIndexOf('useEffect(() => {', at), at);
    expect(effect).toMatch(/if \(redirectChecked\.current \|\| !isRedirectPending\(\)\) return;/);
    const after = src.slice(at, src.indexOf('}, [router, afterSignIn]);', at));
    expect(after).toContain('.finally(clearRedirectPending)');
  });
});

test('the one Auth instance keeps the signed-in hint in step with Firebase', () => {
  // Every sign-in and sign-out anywhere in the product goes through this
  // instance, so the hint the public headers read cannot outlive a session by
  // more than the one SDK load that removes it (lib/auth-hint.ts).
  const src = read('lib/firebase-app.ts');
  expect(src).toContain("import { setSignedInHint } from './auth-hint';");
  expect(src).toMatch(/onAuthStateChanged\(authInstance, \(user\) => setSignedInHint\(Boolean\(user\)\)\);/);
  // Nothing else writes the hint.
  const writers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && rel !== 'lib/auth-hint.ts' && /setSignedInHint\(/.test(read(rel))) writers.push(rel);
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
  expect(writers).toEqual(['lib/firebase-app.ts']);
});

/**
 * Whether every `signInWithRedirect(` in `source` has `markRedirectPending()`
 * before it in the same function. Nothing calls a redirect today (the Google
 * button opens a popup), so the guard holds the order for the day one does.
 */
function redirectsWithoutMark(source: string): number {
  let missing = 0;
  let from = 0;
  for (;;) {
    const at = source.indexOf('signInWithRedirect(', from);
    if (at < 0) break;
    from = at + 1;
    // The enclosing function: back to the nearest arrow or function head.
    const head = Math.max(source.lastIndexOf('=> {', at), source.lastIndexOf('function ', at));
    const mark = source.lastIndexOf('markRedirectPending()', at);
    if (mark < 0 || mark < head) missing++;
  }
  return missing;
}

test('every redirect sign-in sets the pending mark before it leaves', () => {
  expect(redirectsWithoutMark('const go = async () => {\n  await signInWithRedirect(auth, provider);\n};')).toBe(1);
  expect(redirectsWithoutMark('const go = async () => {\n  markRedirectPending();\n  await signInWithRedirect(auth, provider);\n};')).toBe(0);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name) && redirectsWithoutMark(read(rel)) > 0) offenders.push(rel);
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
  expect(offenders).toEqual([]);
});
