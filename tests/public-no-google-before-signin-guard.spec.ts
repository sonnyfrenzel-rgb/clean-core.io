import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { OWN_SIGNED_OUT_VIEW_ROUTES, PUBLIC_SHELL_ROUTES, SIGNED_IN_SHELL_ROUTES, isPublicShellPath } from '../lib/shell-routes';

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
 * is set before any redirect leaves.
 *
 * The public pages inside the signed-in shell (`app/(app)/`: About, Knowledge,
 * the demo …) do import Firebase — the shell serves the product too — so for
 * them the rule is on the calls, not the imports: every page of the shell is
 * classified in lib/shell-routes.ts, the shell starts Auth only behind
 * hooks/useAuthWanted.ts, and every other `getAuth()` / `getDb()` a public
 * page's code can reach is in a reviewed list below, with the reason it does
 * not run on load. The rendered half, which records every request a signed-out
 * visit makes, is tests/public-no-third-party-requests.spec.ts.
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
  expect(src).toContain("import { markAuthStarted, setSignedInHint } from './auth-hint';");
  expect(src).toMatch(/onAuthStateChanged\(authInstance, \(user\) => setSignedInHint\(Boolean\(user\)\)\);/);
  // The shell's public pages use a started Auth without the hint (a browser that keeps no storage).
  expect(src).toMatch(/authInstance = firebaseGetAuth\(getFirebaseApps\(\)\);\s*markAuthStarted\(\);/);
  // The non-starting read hands out the instance and never creates it.
  expect(src).toMatch(/export function getAuthIfStarted\(\): Auth \| null \{\s*return authInstance;\s*\}/);
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

/* ------------------------------------------------------------------------ */
/* The public pages inside the signed-in shell, app/(app)/                    */
/* ------------------------------------------------------------------------ */

const SHELL = 'app/(app)';

/** Every page of the shell, as its route in folder form (`/demo/[stage]`) and its file — read from the files. */
function shellPages(): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name === 'page.tsx') {
        const folder = rel.slice(SHELL.length, -'/page.tsx'.length);
        // A route group `(name)` is not part of the address.
        const route = folder.split('/').filter((segment) => !/^\(.*\)$/.test(segment)).join('/') || '/';
        out.push({ route, file: rel });
      }
    }
  };
  walk(SHELL);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** The files Next renders for a page of the shell: the page and every layout on its folder path below app/(app)/, the shell's own included. */
function shellLoadFiles(pageFile: string): string[] {
  const files = [pageFile];
  let dir = path.posix.dirname(pageFile);
  for (;;) {
    for (const name of ['layout.tsx', 'template.tsx', 'loading.tsx', 'error.tsx']) {
      const rel = `${dir}/${name}`;
      if (fs.existsSync(path.join(ROOT, rel))) files.push(rel);
    }
    if (dir === SHELL) break;
    dir = path.posix.dirname(dir);
  }
  return files;
}

/** Every source file reachable from `entries` through static imports, stopping at the Firebase modules themselves. */
function reachable(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const rel = stack.pop()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!/\.(tsx?|jsx?|mjs)$/.test(rel)) continue;
    for (const spec of staticImports(read(rel))) {
      const next = resolve(rel, spec);
      if (next && !FORBIDDEN_FILES.has(next)) stack.push(next);
    }
  }
  return seen;
}

/** Calls that start the Auth SDK or Firestore. `getAuthIfStarted()` is the read that starts nothing. */
const STARTING_CALL = /\bget(Auth|Db)\(/;

/**
 * Without block and whole-line comments. A string that names a call (a note in
 * lib/legal/open-values.ts, say) still counts: a false alarm here is a review,
 * a missed call is a request to Google — so write such notes without the
 * parentheses.
 */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const GATED = 'behind useAuthWanted() (hooks/useAuthWanted.ts): no Auth on a public page without the signed-in hint';
const CLICK_ONLY = 'only in a handler the reader starts (a click, a save) — never on load';
const DEMO_AFTER_GATE =
  'reached through the demo workspace or the demo\'s Analyze, Business, which render it only once a profile exists (components/demo/DemoWorkspaceShell.tsx, components/demo/DemoAnalyzeBusiness.tsx, `if (profileLoading || !enabled)`) — a visitor without the hint is sent to sign in first';

/**
 * Every file a public page of the shell can reach that calls `getAuth()` or
 * `getDb()`, and why the call does not run when a visitor without the hint
 * opens the page. A new entry needs the same review: a call on load would
 * contact Google on mobile browsers and Safari. Prefer `getAuthIfStarted()`
 * for a read of who is signed in (lib/firebase-app.ts).
 */
const REVIEWED_SHELL_CALLS: Record<string, string> = {
  'app/(app)/layout.tsx': `${GATED}; "Sign out" is ${CLICK_ONLY}`,
  'hooks/useUserProfile.ts': `${GATED}; createProfile/updateProfile are ${CLICK_ONLY}`,
  'components/UserOnboarding.tsx': GATED,
  'components/TermsReacceptGate.tsx': `${CLICK_ONLY}; the render reads getAuthIfStarted()`,
  'components/design/FunctionalRequirements.tsx': `asks only with a project id (the demo has none), otherwise ${CLICK_ONLY}`,
  'components/requirements/RequirementsWorkspace.tsx': `asks only outside demo mode, with a project id, otherwise ${CLICK_ONLY}`,
  'hooks/useSpecAutosave.ts': `saves on an edit outside the demo — ${CLICK_ONLY}`,
  'lib/process-states-client.ts': 'read by useProcessStates only with a project id; the demo passes none (hooks/useOpenQuestions.ts)',
  'lib/project-loader.ts': `the assistant loads a project only inside /project/<id> (components/GlossaryChatbot.tsx); otherwise ${DEMO_AFTER_GATE}`,
  'lib/project-artefacts-client.ts': 'reached through lib/project-loader.ts only, see there',
  'components/workspace/BusinessRulesEditor.tsx': DEMO_AFTER_GATE,
  'components/workspace/FitCheckPanel.tsx': DEMO_AFTER_GATE,
  'components/workspace/ItAnswers.tsx': DEMO_AFTER_GATE,
  'components/workspace/ItRail.tsx': DEMO_AFTER_GATE,
  'components/workspace/SteeringOnePager.tsx': DEMO_AFTER_GATE,
  'components/workspace/TargetChange.tsx': DEMO_AFTER_GATE,
  'hooks/useProjectEvidence.ts': DEMO_AFTER_GATE,
  'lib/engine-run.ts': DEMO_AFTER_GATE,
  'lib/process-naming-client.ts': DEMO_AFTER_GATE,
  'lib/process-revisions-client.ts': DEMO_AFTER_GATE,
  'lib/project-command-client.ts': DEMO_AFTER_GATE,
};

test.describe('the public pages of the signed-in shell start Auth only behind the hint', () => {
  test('every page of the shell is classified once, and every classified route is a page', () => {
    const pages = shellPages();
    // A guard that finds nothing must prove it can find something.
    expect(pages.map((p) => p.route)).toEqual(expect.arrayContaining(['/knowledge', '/demo/[stage]', '/project/[projectId]/analyze']));
    const routes = new Set(pages.map((p) => p.route));
    const unclassified = pages.filter((p) => !PUBLIC_SHELL_ROUTES.includes(p.route) && !SIGNED_IN_SHELL_ROUTES.includes(p.route));
    expect(unclassified.map((p) => p.file), 'a page of the shell in neither list of lib/shell-routes.ts').toEqual([]);
    const both = PUBLIC_SHELL_ROUTES.filter((route) => SIGNED_IN_SHELL_ROUTES.includes(route));
    expect(both, 'a route in both lists of lib/shell-routes.ts').toEqual([]);
    const stale = [...PUBLIC_SHELL_ROUTES, ...SIGNED_IN_SHELL_ROUTES].filter((route) => !routes.has(route));
    expect(stale, 'a route in lib/shell-routes.ts without a page').toEqual([]);
  });

  test('a pathname is matched to its route the way usePathname() reports it', () => {
    for (const pathname of ['/knowledge', '/knowledge/', '/about', '/demo', '/demo/analyze', '/demo/design/requirements', '/demo/workspace', '/verify-pack', '/admin/design-system/first-render']) {
      expect(isPublicShellPath(pathname), pathname).toBe(true);
    }
    for (const pathname of ['/', '/dashboard', '/settings', '/project/abc', '/project/abc/analyze', '/admin', '/admin/workspace', '/admin/design-system', '/invitation/a/b', '/portfolio/shared/x', '/knowledgebase', '/demo/a/b/c']) {
      expect(isPublicShellPath(pathname), pathname).toBe(false);
    }
  });

  test('the shell asks Firebase on a public page only behind useAuthWanted()', () => {
    const gate = read('hooks/useAuthWanted.ts');
    // Since 09.11.2026 every page of the shell waits for the hint or a started Auth — a page that needs an
    // account no longer starts Auth on load (network capture 09.11.2026: /dashboard signed out contacted Google on Safari).
    expect(gate).not.toMatch(/return true;/);
    expect(gate).toMatch(/export function useAccountPage\(\): boolean \{\s*const pathname = usePathname\(\);[^}]*return !isPublicShellPath\(pathname \?\? '\/'\) && !hasOwnSignedOutView\(pathname \?\? '\/'\);/);
    // The two invitation links show their own signed-out state and start Auth only behind the hint.
    expect(OWN_SIGNED_OUT_VIEW_ROUTES).toEqual(['/invitation/[projectId]/[invitationId]', '/portfolio/invitation/[selectionId]/[invitationId]']);
    for (const route of OWN_SIGNED_OUT_VIEW_ROUTES) expect(SIGNED_IN_SHELL_ROUTES).toContain(route);
    for (const file of ['app/(app)/invitation/[projectId]/[invitationId]/page.tsx', 'components/portfolio/PortfolioInvitation.tsx']) {
      const src = withoutComments(read(file));
      expect(src, file).toContain('const authWanted = useAuthWanted();');
      expect(src, file).toContain('const user = authWanted === false ? null : authUser;');
      expect(src, file).toMatch(/useEffect\(\(\) => \{\s*if \(!authWanted\) return;\s*(const auth = getAuth\(\);|return onAuthStateChanged\(getAuth\(\),)/);
    }
    expect(gate).toMatch(/const clientSnapshot = \(\): Known => \(hasSignedInHint\(\) \|\| isAuthStarted\(\) \? 'yes' : 'no'\);/);
    // The server cannot read the browser's storage: the hydrating render is "not known yet".
    expect(gate).toMatch(/const serverSnapshot = \(\): Known \| null => null;/);
    expect(firebaseChains('hooks/useAuthWanted.ts')).toEqual([]);
    expect(firebaseChains('lib/shell-routes.ts')).toEqual([]);

    const layout = withoutComments(read('app/(app)/layout.tsx'));
    expect(layout).toContain('const authWanted = useAuthWanted();');
    expect(layout.split('onAuthStateChanged(').length - 1).toBe(1);
    expect(layout).toMatch(/useEffect\(\(\) => \{\s*if \(!authWanted\) return;\s*let uid[^;]*;\s*return onAuthStateChanged\(getAuth\(\),/);
    // Signed out without asking: the "Sign in" link, not a placeholder.
    expect(layout).toContain('const signedIn = authWanted === false ? false : authWanted === undefined ? undefined : firebaseSignedIn;');
    // A page that needs an account, without the hint: not rendered, and the reader goes to sign in and back.
    expect(layout).toContain('const holdAccountPage = accountPage && authWanted !== true;');
    expect(layout).toContain("if (accountPage && authWanted === false) router.replace(signInLinkFor(pathname ?? '/'));");
    expect(layout).toContain('{holdAccountPage ? null : children}');

    const profile = read('hooks/useUserProfile.ts');
    expect(profile).toContain('const auth = authWanted ? getAuth() : null;');
    expect(profile).toContain('const db = authWanted ? getDb() : null;');
    expect(profile).toMatch(/useEffect\(\(\) => \{\s*if \(authWanted === undefined\) return;\s*if \(!auth \|\| !db\) \{\s*setLoading\(false\);/);
    expect(profile).toContain('}, [authWanted, auth, db]);');

    expect(read('components/UserOnboarding.tsx')).toContain('const auth = authWanted ? getAuth() : null;');
  });

  test('who is signed in is read without starting Auth where it runs on load', () => {
    // The assistant (mounted on every page of the shell), the Terms gate's render and the demo workspace's lookups.
    expect(read('lib/gemini.ts')).toContain('const user = getAuthIfStarted()?.currentUser;');
    const model = read('hooks/useModelAvailability.ts');
    expect(model).toContain('const user = getAuthIfStarted()?.currentUser ?? null;');
    expect(model).toContain('if (!getAuthIfStarted()?.currentUser && left > 0) {');
    expect(read('components/TermsReacceptGate.tsx')).toContain('const declined = declinedInThisSignIn(declinedMark, getAuthIfStarted()?.currentUser ?? null);');
    expect(read('hooks/useFunctionModuleAnswers.ts')).toContain('const token = await getAuthIfStarted()?.currentUser?.getIdToken();');
    expect(read('hooks/useAbcdCatalogLookup.ts')).toContain('const token = await getAuthIfStarted()?.currentUser?.getIdToken();');
  });

  test('every Auth or Firestore call a public page of the shell can reach is reviewed', () => {
    expect(STARTING_CALL.test(withoutComments('const auth = getAuth();'))).toBe(true);
    expect(STARTING_CALL.test(withoutComments('const db = getDb();'))).toBe(true);
    expect(STARTING_CALL.test(withoutComments('// getDb()\n/* getAuth() */'))).toBe(false);
    expect(STARTING_CALL.test(withoutComments('const user = getAuthIfStarted()?.currentUser;'))).toBe(false);
    const publicPages = shellPages().filter((p) => PUBLIC_SHELL_ROUTES.includes(p.route));
    expect(publicPages.length).toBe(PUBLIC_SHELL_ROUTES.length);
    const callers = new Set<string>();
    const unreviewed: string[] = [];
    for (const page of publicPages) {
      for (const rel of reachable(shellLoadFiles(page.file))) {
        if (!/\.tsx?$/.test(rel) || !STARTING_CALL.test(withoutComments(read(rel)))) continue;
        callers.add(rel);
        if (!(rel in REVIEWED_SHELL_CALLS)) unreviewed.push(`${page.route}: ${rel}`);
      }
    }
    expect([...new Set(unreviewed)], 'a getAuth()/getDb() call a public page can reach, not reviewed in this spec').toEqual([]);
    // A reviewed file that no public page reaches any more, or that no longer calls, leaves the list.
    const stale = Object.keys(REVIEWED_SHELL_CALLS).filter((rel) => !callers.has(rel));
    expect(stale, 'a reviewed entry that is no longer reached or no longer calls').toEqual([]);
  });
});
