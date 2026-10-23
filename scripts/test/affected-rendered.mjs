#!/usr/bin/env node
/**
 * Which rendered specs to run before a push (release 3.0.21, test-quality measure 3).
 *
 * On run 39857130588, 25 tests failed in CI that nobody had run locally: the
 * changed pages and routes were covered by rendered specs, and only server-free
 * specs had been run before the push. This script lists the specs that matter
 * for a change, so they can be run against a production build first:
 *
 *   node scripts/test/affected-rendered.mjs [--base <ref>] [--json]
 *
 * It reads `git diff --name-only <base>...HEAD` (base: origin/dev, else dev),
 * maps every changed file under app/ to the URL paths it serves, and picks:
 *   - each spec that opens one of those paths (page.goto) or calls one of those
 *     routes (request.get/post/…, fetch) — a changed layout, loading/error file
 *     or colocated component counts for every page beneath it;
 *   - each changed spec that needs a server itself;
 *   - the core list: the 25 specs that failed in run 39857130588, always.
 * A change to middleware.ts counts for every spec that opens a path.
 *
 * It prints the commands: an emulator production build, then the specs with
 * CI=1 (playwright.config.ts then serves `npm start`, as CI does). The
 * Firebase emulators must run (CLAUDE.md, "Emulators for tests").
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The 25 spec files with a failed test in CI run 39857130588 (22.10.2026). Run on every change. */
export const CORE_SPECS = [
  'tests/admin-usage-panel.spec.ts',
  'tests/business-view-clarity.spec.ts',
  'tests/byok-hardening-routes.spec.ts',
  'tests/delivery-page-qa220.spec.ts',
  'tests/design-options-rendered.spec.ts',
  'tests/design-page-qa220.spec.ts',
  'tests/export-inertness-guard.spec.ts',
  'tests/g4-chain-acceptance.spec.ts',
  'tests/gemini-attempt-limit-route.spec.ts',
  'tests/machine-strings-guard.spec.ts',
  'tests/mfa-trust-chain-gate.spec.ts',
  'tests/mobile-responsive.spec.ts',
  'tests/process-map.spec.ts',
  'tests/process-revisions-route.spec.ts',
  'tests/process-tour-screens.spec.ts',
  'tests/signing-key-guard.spec.ts',
  'tests/source-change-guard.spec.ts',
  'tests/starter-example-quota.spec.ts',
  'tests/tco-page-qa220.spec.ts',
  'tests/terms-duties-guard.spec.ts',
  'tests/terms-reaccept-gate.spec.ts',
  'tests/testing-guided.spec.ts',
  'tests/trust-card-guard.spec.ts',
  'tests/trust-chain-binding.spec.ts',
  'tests/way-in-and-back-rendered.spec.ts',
];

const SPECIAL = /^(page|route|layout|template|loading|error|not-found|default)\.(t|j)sx?$/;
const ENDPOINT = /^(page|route)\.(t|j)sx?$/;

/** URL segments of an app/ directory: route groups `(x)` and slots `@x` serve no segment. */
function urlSegments(appDir) {
  return appDir
    .split('/')
    .filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
}

/** Every page and route handler under app/, from a list of repo paths. */
export function listEndpoints(appFiles) {
  return appFiles
    .filter((f) => f.startsWith('app/') && ENDPOINT.test(path.posix.basename(f)))
    .map((file) => {
      const dir = path.posix.dirname(file);
      return { file, dir, segments: urlSegments(dir.slice('app'.length)) };
    });
}

/**
 * The paths a spec opens or calls: the first argument of page.goto, request.get/post/…
 * and fetch, and constants named …PATH/…URL/…ROUTE, when it is a literal starting
 * with `/` (a leading `${BASE}` is dropped). `${…}` segments become wildcards.
 */
export function specPaths(source) {
  const found = new Set();
  const call = /(?:\bgoto|\.(?:get|post|put|patch|delete|head|fetch)|\bfetch)\(\s*(['"`])((?:\$\{[A-Za-z_$][\w$.]*\})?\/[^'"`\s]*)/g;
  const named = /\b(?:const|let)\s+[A-Za-z_$][\w$]*(?:PATH|URL|ROUTE|Path|Url|Route|path|url|route)[\w$]*\s*=\s*(['"`])(\/[^'"`\s]*)/g;
  for (const re of [call, named]) {
    let m;
    while ((m = re.exec(source))) {
      let p = m[2].replace(/^\$\{[^}]*\}/, '');
      if (!p.startsWith('/') || p.startsWith('//')) continue;
      p = p.replace(/[?#].*$/, '');
      found.add(p);
    }
  }
  return [...found];
}

function segmentsOf(urlPath) {
  return urlPath
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith('${') ? '*' : s.includes('${') ? `${s.slice(0, s.indexOf('${'))}*` : s));
}

/** 3 static, 2 dynamic, 1 catch-all — per segment, for Next's precedence. */
function rank(seg) {
  if (/^\[\[\.\.\..+\]\]$/.test(seg)) return 0;
  if (/^\[\.\.\..+\]$/.test(seg)) return 1;
  if (/^\[.+\]$/.test(seg)) return 2;
  return 3;
}

function matches(urlSegs, routeSegs) {
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    const kind = rank(r);
    if (kind <= 1) return kind === 0 || urlSegs.length > i; // catch-all: the rest (optional: also nothing)
    if (i >= urlSegs.length) return false;
    const u = urlSegs[i];
    if (kind === 2) continue;
    if (u === '*') continue;
    if (u.endsWith('*') ? !r.startsWith(u.slice(0, -1)) : u.toLowerCase() !== r.toLowerCase()) return false;
  }
  return urlSegs.length === routeSegs.length;
}

/**
 * The endpoints a URL path reaches. A literal path reaches the one Next would
 * pick (static before dynamic before catch-all); a path with a wildcard segment
 * may be any of the candidates, so it reaches all of them.
 */
export function resolvePath(urlPath, endpoints) {
  const segs = segmentsOf(urlPath);
  const candidates = endpoints.filter((e) => matches(segs, e.segments));
  if (candidates.length <= 1 || segs.some((s) => s.endsWith('*'))) return candidates;
  const score = (e) => e.segments.map(rank);
  candidates.sort((a, b) => {
    const x = score(a);
    const y = score(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (y[i] ?? -1) - (x[i] ?? -1);
    return 0;
  });
  return [candidates[0]];
}

/** Does a changed app/ file count for this endpoint? */
function changeReaches(changed, endpoint) {
  const base = path.posix.basename(changed);
  if (ENDPOINT.test(base)) return changed === endpoint.file;
  const dir = path.posix.dirname(changed);
  // A layout, template, loading/error file, stylesheet or colocated module: every endpoint at or beneath it.
  return endpoint.dir === dir || endpoint.dir.startsWith(`${dir}/`);
}

/** Needs a server: opens a page, or takes the page/request/context/browser fixture. */
export function isRendered(source) {
  return /\bpage\.goto\(/.test(source) || /\basync\s*\(\s*\{[^}]*\b(page|request|context|browser)\b[^}]*\}/.test(source);
}

/**
 * The whole selection, pure.
 * @param changed   repo paths from the diff
 * @param appFiles  every file under app/ now (deleted endpoints are added from `changed`)
 * @param specs     Map spec path → source
 */
export function affectedSpecs({ changed, appFiles, specs, core = CORE_SPECS }) {
  const endpoints = listEndpoints([...new Set([...appFiles, ...changed.filter((f) => f.startsWith('app/'))])]);
  const changedApp = changed.filter((f) => f.startsWith('app/'));
  const everything = changed.includes('middleware.ts');
  const reasons = new Map();
  const add = (spec, why) => {
    if (!reasons.has(spec)) reasons.set(spec, new Set());
    reasons.get(spec).add(why);
  };
  for (const [spec, source] of specs) {
    const paths = specPaths(source);
    if (everything && paths.length) add(spec, 'middleware.ts');
    for (const p of paths) {
      for (const e of resolvePath(p, endpoints)) {
        // Named by the nearest change: the page itself before the layout above it.
        const hit = changedApp.filter((c) => changeReaches(c, e)).sort((a, b) => b.length - a.length)[0];
        if (hit) add(spec, `${p} → ${hit}`);
      }
    }
    if (changed.includes(spec) && isRendered(source)) add(spec, 'changed rendered spec');
  }
  for (const c of core) if (specs.has(c)) add(c, 'core list (run 39857130588)');
  return [...reasons.keys()].sort().map((spec) => ({ spec, reasons: [...reasons.get(spec)] }));
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function defaultBase() {
  for (const ref of ['origin/dev', 'dev']) {
    try {
      git(['rev-parse', '--verify', '--quiet', ref]);
      return ref;
    } catch {
      /* try the next */
    }
  }
  throw new Error('no base: pass --base <ref>');
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(rel);
      } else out.push(rel);
    }
  };
  walk(dir);
  return out;
}

export function commandsFor(list) {
  return [
    'NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run build',
    `CI=1 npx playwright test ${list.join(' ')}`,
  ];
}

function main(argv) {
  const at = argv.indexOf('--base');
  const base = at >= 0 ? argv[at + 1] : defaultBase();
  const changed = git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);
  const specFiles = listFiles('tests').filter((f) => /\.(spec|test)\.(c|m)?[jt]sx?$/.test(f));
  const specs = new Map(specFiles.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  const result = affectedSpecs({ changed, appFiles: listFiles('app'), specs });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ base, changed: changed.length, specs: result }, null, 2));
    return;
  }
  console.log(`${changed.length} files changed since ${base}; ${result.length} rendered specs to run:`);
  for (const r of result) console.log(`  ${r.spec}  (${r.reasons.slice(0, 3).join('; ')}${r.reasons.length > 3 ? '; …' : ''})`);
  const [build, run] = commandsFor(result.map((r) => r.spec));
  console.log('\nWith the emulators running (firebase emulators:start --only auth,firestore --project=cleancore-491216):');
  console.log(`  ${build}`);
  console.log(`  ${run}`);
  console.log('\nPowerShell:');
  console.log(`  $env:NEXT_PUBLIC_USE_FIREBASE_EMULATOR='true'; npm run build; $env:CI='1'; npx playwright test ${result.map((r) => r.spec).join(' ')}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`affected-rendered: ${e.message}`);
    process.exit(1);
  }
}
