#!/usr/bin/env node
/**
 * 3.0 acceptance run — the executable half of docs/release/3.0-acceptance.md.
 *
 *   node scripts/release/acceptance.mjs                         # source guards only (no server)
 *   node scripts/release/acceptance.mjs --mode rendered --base-url http://localhost:3531
 *   node scripts/release/acceptance.mjs --mode all --base-url http://localhost:3531
 *   node scripts/release/acceptance.mjs --mode all --serve 3531 # starts `next start` itself, stops it after
 *   node scripts/release/acceptance.mjs --list                  # rows and their specs, nothing runs
 *   node scripts/release/acceptance.mjs --rows 3.0.6,G1         # only these rows
 *
 * Order: preflight (sha, tree, node) → source guards (every spec of the selected
 * rows that needs no browser page, no request fixture and no server) → rendered
 * specs against the base URL (Firebase emulators on :9099/:8080 must already run;
 * this script never starts or stops them; specs that only write to the emulators
 * in-process run with the rendered ones). Results go to
 * `.release/acceptance-<sha>.md` (gitignored), one line per acceptance row.
 *
 * What it will not do, by construction:
 *   - send mail: RESEND_API_KEY is blanked for every child process;
 *   - call a model: GEMINI_API_KEY, OPENROUTER_API_KEY, XAI_API_KEY, OPENAI_API_KEY and
 *     ANTHROPIC_API_KEY are blanked as well;
 *   - touch production data: the Firestore/Auth emulator hosts are forced, the
 *     Admin SDK credentials variable is removed, and a base URL on clean-core.io or
 *     *.run.app is refused for rendered specs — they seed and sign in.
 *
 * Run it under Node 22, as CI does (`npx --yes --package=node@22 -- node scripts/release/acceptance.mjs`);
 * on Node 20 one spec fails for a loader reason that CI never sees.
 *
 * Rendered mode against --base-url: that server must have been built with
 * NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true and started with the same blank keys and
 * test secrets as safeEnv() — the simplest way is --serve, which does exactly that.
 *
 * One worker by default, as CI runs (`--workers 4` to go faster): with parallel
 * workers, tests/workspace-print-sheet.spec.ts races on a shared esbuild output
 * file and fails for a reason CI never sees (reproduced 02.10.2026).
 *
 * Exit codes: 0 no failure · 1 a spec failed · 2 usage or refusal · 3 rendered
 * specs requested but the server did not answer.
 *
 * No new dependency: Node built-ins and the repository's own Playwright.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, '.release');

// ---------------------------------------------------------------------------
// Acceptance rows. `specs` are files under tests/. Whether a spec is a source
// guard or a rendered spec is not declared here but read from the file (see
// classify()), so a spec that gains a `page` fixture moves by itself. `manual`
// names what no spec can show — those rows are reported, never run.
// Keep in step with the tables in docs/release/3.0-acceptance.md.
// ---------------------------------------------------------------------------
export const ROWS = [
  // --- Block D and the 3.0 rows (docs/ROADMAP.md §4 "3.0 — Switch-over") ---
  { id: 'D', title: 'Block D — whole app on DESIGN.md, guards at zero', specs: ['design-source-guard.spec.ts', 'design-rendered-guard.spec.ts', 'a11y-source-guard.spec.ts', 'cc-token-guard.spec.ts', 'cc-style-guard.spec.ts'] },
  { id: '3.0.1', title: 'Switch for everyone; demo entry /demo/workspace; captures with a community account', specs: ['return-path-guard.spec.ts', 'preservation-workspace.spec.ts', 'demo-workspace-tour.spec.ts', 'workspace-shell-guard.spec.ts'], manual: 'in progress on feat/3.0.1-switch; at HEAD the shell is admin-only and WG-01/WG-02 assert that' },
  { id: '3.0.2', title: 'Existing projects open without loss of IDs, runs, signatures (C23-A02)', specs: ['legacy-projects.spec.ts', 'legacy-projects-page.spec.ts'] },
  { id: '3.0.3', title: 'Preservation register passes in the new workspace', specs: ['preservation-workspace.spec.ts', 'preservation-register.spec.ts'] },
  { id: '3.0.4', title: 'Accessibility baseline: keyboard, screen reader, forced-colors, phone, print, shortcuts', specs: ['workspace-a11y.spec.ts', 'a11y-source-guard.spec.ts', 'workspace-print-sheet.spec.ts'], manual: 'screen reader, forced-colors, print and phone checked by hand on the release build' },
  { id: '3.0.5', title: 'Old generator gone; Documentation from the engine (way C)', specs: ['process-documentation.spec.ts', 'documentation-blueprint-shape.spec.ts', 'documentation-stale-export.spec.ts'] },
  { id: '3.0.6', title: 'New landing page, public texts, SEO surface unchanged', specs: ['seo-surface-guard.spec.ts', 'landing-consistency-guard.spec.ts', 'landing-style-guard.spec.ts', 'landing-stage-timeline.spec.ts', 'landing-process-guard.spec.ts', 'landing-fragment-guard.spec.ts', 'landing-hero-rules.spec.ts', 'hero-preview-claims.spec.ts', 'sitemap-guard.spec.ts', 'public-pages-smoke.spec.ts', 'public-header-fit.spec.ts'] },
  { id: '3.0.7', title: 'Demo project and tour in the workspace', specs: ['demo-tour.spec.ts', 'demo-workspace-tour.spec.ts', 'demo-project.spec.ts', 'demo-design.spec.ts', 'demo-shared-boundary.spec.ts', 'demo-release-guard.spec.ts'] },
  { id: '3.0.8', title: 'Public repository texts of a piece (inventory, retired items, one spelling)', specs: ['public-texts-guard.spec.ts'], manual: '(a)/(b)/(c-executed) are test.fixme until PUBLIC_TEXTS_ARMED is true' },
  { id: '3.0.9', title: 'Mail deliverability (seed test inbox at Gmail and Microsoft)', specs: ['mail-seed-test.spec.ts', 'email-delivery-guard.spec.ts'], manual: 'seed run per docs/MAIL-SEED-TEST.md — Sonny, within the Resend daily quota' },
  { id: '3.0.10', title: 'Management view readable in seconds', specs: ['no-fabricated-figures.spec.ts', 'money-honesty-guard.spec.ts', 'management-overview.spec.ts', 'management-answers.spec.ts', 'management-executive.spec.ts', 'cc-severity-charts.spec.ts'] },
  { id: '3.0.11', title: 'Generation server-side with compare-and-swap', specs: ['generation-store-cas.spec.ts'] },
  { id: '3.0.12', title: 'Blocked accounts lose Firestore access immediately', specs: ['firestore-rules-suspended.spec.ts', 'suspended-account-api-reads.spec.ts', 'firestore-rules.spec.ts', 'rules-deploy-order.spec.ts'], manual: 'npm run rules:verify against production — Sonny' },
  { id: '3.0.13', title: 'BYOK hardening (a)–(g)', specs: ['byok-hardening.spec.ts', 'byok-hardening-routes.spec.ts'] },
  { id: '3.0.14', title: 'Everything public current and English only', specs: ['public-texts-guard.spec.ts'], manual: 'the guard reads .md/.txt only; code comments and test titles per docs/release/3.0-text-scan.md' },
  { id: '3.0.15', title: 'SAP Business AI Platform (formerly SAP BTP) naming', specs: ['sap-naming-guard.spec.ts'] },
  { id: '3.0.16', title: 'Final external review verified finding by finding', specs: [], manual: 'Codex review of 187ccbce: every finding fixed, refuted or scheduled — disposition list' },
  { id: 'IMPORT', title: 'File import: a BPMN 2.0 file comes in as a new revision (ADR-056)', specs: ['process-import.spec.ts', 'editor-import-dialog.spec.ts', 'process-revisions.spec.ts'] },
  // --- "Done when" of the 3.0 row ---
  { id: 'DW-1', title: 'All phase acceptances have run on main', specs: [], manual: 'CI validate job green on the main release commit (gh run list --branch main)' },
  { id: 'DW-2', title: 'Three complete paths plus the undecidable case, with negative probes', specs: ['g4-chain-acceptance.spec.ts', 'full-pipeline.spec.ts'], manual: 'protocol and findings: docs/release/g4-chain-acceptance.md; the owner watches one walk on the release build' },
  { id: 'DW-3', title: 'Copy CI green', specs: ['copy-ci-guard.spec.ts'] },
  { id: 'DW-4', title: 'New landing live with real product views, no mockup image', specs: ['landing-consistency-guard.spec.ts'], manual: 'captures re-recorded (CAPTURE_LANDING=1) with a community account; live check on clean-core.io after deploy' },
  { id: 'DW-5', title: 'Sign-in reachable as today', specs: ['public-pages-smoke.spec.ts'], manual: '/?auth=signin on clean-core.io after deploy' },
  { id: 'DW-6', title: 'Landing guards green', specs: ['landing-style-guard.spec.ts', 'landing-consistency-guard.spec.ts', 'seo-surface-guard.spec.ts'] },
  { id: 'DW-7', title: 'Signavio and money guards green', specs: ['signavio-claims-guard.spec.ts', 'money-honesty-guard.spec.ts', 'tco-cost-inputs-guard.spec.ts', 'tco-page-rendered.spec.ts'] },
  { id: 'DW-8', title: 'JSON-LD and visible FAQ congruent', specs: ['components-qa220.spec.ts', 'public-pages-qa220.spec.ts'] },
  { id: 'DW-9', title: 'Management: one sentence, four buckets, history, not determined, coverage, costs as simulation', specs: ['management-overview.spec.ts', 'no-fabricated-figures.spec.ts', 'money-honesty-guard.spec.ts'] },
  // --- Gates G0–G4 (docs/ROADMAP.md §15) ---
  { id: 'G0', title: 'Correct, refutable answers', specs: ['korpus-mutation.spec.ts', 'korpus-facets.spec.ts', 'korpus-engine.spec.ts', 'assessment-profile-wiring.spec.ts', 'catalog-two-dimensions.spec.ts', 'public-cloud-fit.spec.ts', 'luw-states.spec.ts', 'open-sql-discrimination.spec.ts', 'abap-table-dependencies.spec.ts'], manual: 'original mutants M01–M06 live in the private review package' },
  { id: 'G1', title: 'Trust boundaries', specs: ['project-access-matrix.spec.ts', 'run-bound-approval.spec.ts', 'repair-draft.spec.ts', 'repair-draft-runner.spec.ts', 'runner-isolation.spec.ts', 'admin-runner-selftest.spec.ts'], manual: 'runner negative test on the deployed profile (admin self-test on clean-core.io)' },
  { id: 'G2', title: 'One consistent work item', specs: ['workspace-revision-stand.spec.ts', 'generation-store-cas.spec.ts', 'process-revisions.spec.ts'], manual: 'Business → IT → Management → back after reload, by hand' },
  { id: 'G3', title: 'Decide first, then build', specs: ['rules-fit-firstlook.spec.ts', 'element-comparability.spec.ts', 'public-cloud-fit.spec.ts', 'usage-import-guard.spec.ts', 'usage-unknown-guard.spec.ts', 'project-decision.spec.ts', 'decision-card.spec.ts', 'steering-one-pager.spec.ts'] },
  { id: 'G4', title: 'Proven handover', specs: ['g4-chain-acceptance.spec.ts', 'trust-chain-e2e.spec.ts', 'trust-chain-binding.spec.ts', 'evidence-chain-covers.spec.ts', 'generation-follows-contract.spec.ts'], manual: 'fresh pack verified offline with the published key (scripts/verify-pack.mjs)' },
];

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { mode: 'source', baseUrl: null, serve: null, config: null, rows: null, list: false, workers: '1' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--mode') a.mode = v();
    else if (k === '--base-url') a.baseUrl = v();
    else if (k === '--serve') a.serve = Number(v());
    else if (k === '--config') a.config = v();
    else if (k === '--rows') a.rows = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--workers') a.workers = v();
    else if (k === '--list') a.list = true;
    else if (k === '--help' || k === '-h') { a.help = true; }
    else throw new Error(`unknown argument ${k}`);
  }
  if (!['source', 'rendered', 'all'].includes(a.mode)) throw new Error(`--mode must be source, rendered or all, not ${a.mode}`);
  if (a.serve && !a.baseUrl) a.baseUrl = `http://localhost:${a.serve}`;
  return a;
}

const FIXTURE_USE = /\{\s*[^}]*\b(page|request|context|browser|baseURL)\b[^}]*\}\s*(?:,\s*\w+)?\)\s*=>/;
const DIRECT_USE = /\bpage\.goto\b|\brequest\.(get|post|put|delete|patch)\(/;

const EMULATOR_USE = /firebase-admin|getAdminDb|admin-seed|rules-unit-testing|seedProject|seedUser/;

/**
 * 'source' when the spec needs nothing but files; 'emulator' when it writes to the
 * Firebase emulators in-process; 'rendered' when it needs a page, a request or a server.
 */
export function classify(spec) {
  const file = path.join(ROOT, 'tests', spec);
  if (!fs.existsSync(file)) return 'missing';
  const text = fs.readFileSync(file, 'utf8');
  if (FIXTURE_USE.test(text) || DIRECT_USE.test(text)) return 'rendered';
  return EMULATOR_USE.test(text) ? 'emulator' : 'source';
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** The environment every child gets: emulators forced, keys that send or spend blanked. */
function safeEnv(extra = {}) {
  const env = { ...process.env };
  // Blank, not deleted: Next.js fills a variable from .env.local only when it is
  // undefined (@next/env), so an empty string keeps the local key out of `next start`.
  for (const k of [
    'RESEND_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY', 'OPENROUTER_API_KEY', 'XAI_API_KEY',
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_SERVICE_ACCOUNT_KEY', 'QA_REVIEW_KEY', 'UX_REVIEW_KEY', 'SECURITY_AUDIT_PRIVATE_KEY',
  ]) env[k] = '';
  env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
  env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  // The visibly-test values playwright.config.ts sets at module scope. The server
  // started by --serve and the spec process must hold the same ones, or a spec
  // signs with one key and the server verifies with another (and seeding 404s on
  // a PILOT_APPROVAL_SECRET from .env.local).
  env.PILOT_APPROVAL_SECRET = 'test-approval-secret-key-1234567890';
  env.RATE_LIMIT_PEPPER = 'test-rate-limit-pepper-for-ci-test-runner-32';
  env.AUDIT_SIGNING_KEY = 'test-audit-signing-key-for-ci-test-runner-32';
  env.S4_ENCRYPTION_KEY = Buffer.alloc(32, 'clean-core-test-key').toString('base64');
  env.BYOK_ENCRYPTION_KEY = Buffer.alloc(32, 'clean-core-byok-test-key').toString('base64');
  return { ...env, ...extra };
}

function refuseProduction(url) {
  const host = new URL(url).hostname;
  if (/(^|\.)clean-core\.io$/i.test(host) || /\.run\.app$/i.test(host)) {
    throw new Error(`refusing ${url}: rendered specs seed accounts and projects; they run against a local server on the emulators, never against a deployed service`);
  }
}

/** A generated Playwright config: the repository's own, with the base URL replaced and no web server of its own. */
function writeConfig(baseUrl) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'playwright.acceptance.config.ts');
  const testDir = path.join(ROOT, 'tests').replace(/\\/g, '/');
  fs.writeFileSync(file, [
    "import base from '../playwright.config';",
    'export default {',
    '  ...base,',
    `  testDir: ${JSON.stringify(testDir)},`,
    "  reporter: [['json']],",
    `  use: { ...base.use${baseUrl ? `, baseURL: ${JSON.stringify(baseUrl)}` : ''} },`,
    '  webServer: undefined,',
    '};',
    '',
  ].join('\n'));
  return file;
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Any HTTP answer means the server is up. `/api/health` answers 503 "degraded"
    // whenever GEMINI_API_KEY is empty — which safeEnv() makes it on purpose — so
    // waiting for < 500 never ended and every rendered run stopped with exit 3.
    try { await fetch(url); return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Runs Playwright on a list of spec files and returns per-file results from its JSON report. */
function runPlaywright(specs, config, args) {
  if (!specs.length) return { files: {}, exit: 0, ms: 0 };
  const jsonOut = path.join(OUT_DIR, `pw-${Date.now()}.json`);
  const cli = [path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '-c', config, '--reporter=json', ...specs.map((s) => `tests/${s}`)];
  if (args.workers) cli.push(`--workers=${args.workers}`);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, cli, {
    cwd: ROOT,
    env: safeEnv({ PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut }),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ms = Date.now() - t0;
  const files = {};
  let report = null;
  try { report = JSON.parse(fs.readFileSync(jsonOut, 'utf8')); } catch { /* no report: a config or collection error */ }
  if (report) {
    const walk = (suite, file) => {
      const f = suite.file ? suite.file.replace(/\\/g, '/').replace(/^.*?tests\//, '') : file;
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const r = (files[f] ??= { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] });
          const status = t.status; // expected | unexpected | skipped | flaky
          if (status === 'expected') r.passed++;
          else if (status === 'skipped') r.skipped++;
          else if (status === 'flaky') { r.flaky++; r.passed++; }
          else { r.failed++; r.failures.push(spec.title); }
        }
      }
      for (const s of suite.suites ?? []) walk(s, f);
    };
    for (const s of report.suites ?? []) walk(s, null);
    for (const e of report.errors ?? []) {
      const f = (e.location?.file ?? '').replace(/\\/g, '/').replace(/^.*?tests\//, '') || '(collection)';
      const r = (files[f] ??= { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] });
      r.failed++; r.failures.push(`load error: ${(e.message ?? '').split('\n')[0].slice(0, 160)}`);
    }
    fs.rmSync(jsonOut, { force: true });
  } else {
    files['(playwright)'] = { passed: 0, failed: 1, skipped: 0, flaky: 0, failures: [(res.stderr || res.stdout || 'no report').split('\n').slice(0, 5).join(' ').slice(0, 300)] };
  }
  return { files, exit: res.status, ms };
}

function verdict(row, results, mode) {
  if (row.specs.length === 0) return { status: 'manual', detail: row.manual ?? '' };
  const parts = [];
  let fail = 0; let pass = 0; let skip = 0; let notRun = 0; let missing = 0;
  for (const s of row.specs) {
    const kind = classify(s);
    if (kind === 'missing') { missing++; parts.push(`${s}: missing`); continue; }
    const r = results[s];
    if (!r) { notRun++; continue; }
    if (r.failed) { fail++; parts.push(`${s}: ${r.failed} failed (${r.failures.slice(0, 3).join('; ')})`); }
    else if (r.passed) { pass++; if (r.skipped) parts.push(`${s}: ${r.skipped} skipped/fixme`); }
    else { skip++; parts.push(`${s}: all skipped/fixme`); }
  }
  let status;
  if (fail || missing) status = 'FAIL';
  else if (notRun && !pass) status = mode === 'all' ? 'not run' : `not run (${mode === 'source' ? 'rendered' : 'source'} only)`;
  else if (notRun) status = 'partial';
  else if (skip && !pass) status = 'skipped';
  else status = 'pass';
  if (row.manual && (status === 'pass' || status === 'partial')) status += ' + manual';
  if (notRun && !status.startsWith('FAIL')) parts.push(`${notRun} spec(s) not in this mode`);
  if (row.manual) parts.push(`manual: ${row.manual}`);
  return { status, detail: parts.join(' · ') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = args.rows ? ROWS.filter((r) => args.rows.includes(r.id)) : ROWS;
  if (args.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 0; }
  if (args.list) {
    for (const r of rows) console.log(`${r.id.padEnd(8)} ${r.title}\n         ${r.specs.map((s) => `${s} [${classify(s)}]`).join(', ') || '(manual)'}`);
    return 0;
  }
  if (!rows.length) throw new Error('no rows selected');

  const sha = git('rev-parse', 'HEAD');
  const short = sha.slice(0, 8);
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  const started = new Date();
  console.log(`acceptance @ ${short} · mode ${args.mode} · ${rows.length} rows · node ${process.version}${dirty ? ' · tree has local changes' : ''}`);
  // CI runs Node 22. On Node 20 a spec that dynamic-imports a lib module fails with
  // "Unexpected token 'export'" (generation-follows-contract, 02.10.2026) — not a product failure.
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeNote = nodeMajor < 22 ? `node ${process.version} < 22: run under Node 22 as CI does — npx --yes --package=node@22 -- node scripts/release/acceptance.mjs …` : null;
  if (nodeNote) console.warn(`warning: ${nodeNote}`);

  const allSpecs = [...new Set(rows.flatMap((r) => r.specs))];
  const source = allSpecs.filter((s) => classify(s) === 'source');
  const rendered = allSpecs.filter((s) => ['emulator', 'rendered'].includes(classify(s)));
  const results = {};
  const runs = [];

  if (args.mode === 'source' || args.mode === 'all') {
    const config = args.config ? path.resolve(ROOT, args.config) : writeConfig(null);
    console.log(`source guards: ${source.length} spec files …`);
    const r = runPlaywright(source, config, args);
    Object.assign(results, r.files);
    runs.push(`source guards: ${source.length} files, exit ${r.exit}, ${(r.ms / 1000).toFixed(0)} s`);
  }

  let server = null;
  let unreachable = false;
  if (args.mode === 'rendered' || args.mode === 'all') {
    if (!args.baseUrl) throw new Error('--mode rendered/all needs --base-url or --serve');
    refuseProduction(args.baseUrl);
    if (args.serve) {
      if ([3000, 3300].includes(args.serve)) throw new Error('ports 3000 and 3300 are reserved for the owner and the other agents');
      console.log(`starting next start on :${args.serve} (needs a build made with NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true) …`);
      server = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(args.serve)], {
        cwd: ROOT, env: safeEnv({ PORT: String(args.serve) }), stdio: 'ignore',
      });
    }
    const up = await waitFor(`${args.baseUrl}/api/health`, args.serve ? 120_000 : 10_000);
    if (!up) {
      unreachable = true;
      runs.push(`rendered specs: not run — ${args.baseUrl}/api/health did not answer`);
    } else {
      const config = args.config ? path.resolve(ROOT, args.config) : writeConfig(args.baseUrl);
      console.log(`rendered specs: ${rendered.length} spec files against ${args.baseUrl} …`);
      const r = runPlaywright(rendered, config, args);
      Object.assign(results, r.files);
      runs.push(`rendered specs: ${rendered.length} files against ${args.baseUrl}, exit ${r.exit}, ${(r.ms / 1000).toFixed(0)} s`);
    }
    if (server) { server.kill(); runs.push(`server on :${args.serve} stopped`); }
  }

  const lines = rows.map((r) => ({ row: r, ...verdict(r, results, args.mode) }));
  const count = (st) => lines.filter((l) => l.status.split(' + ')[0] === st).length;
  const tot = Object.values(results).reduce((a, r) => ({ p: a.p + r.passed, f: a.f + r.failed, s: a.s + r.skipped }), { p: 0, f: 0, s: 0 });
  runs.push(`tests: ${tot.p} passed, ${tot.f} failed, ${tot.s} skipped/fixme across ${Object.keys(results).length} spec files`);
  if (nodeNote) runs.push(`warning: ${nodeNote}`);
  const md = [
    `# 3.0 acceptance run — ${short}`,
    '',
    `Commit \`${sha}\`${dirty ? ' (working tree had local changes to tracked files)' : ''} · mode \`${args.mode}\`${args.baseUrl ? ` · base URL ${args.baseUrl}` : ''} · ${started.toISOString()} · node ${process.version}`,
    '',
    `**${count('pass')} pass · ${count('FAIL')} fail · ${lines.filter((l) => l.status.startsWith('not run') || l.status.startsWith('partial')).length} not run or partial · ${count('skipped')} skipped · ${count('manual')} manual**`,
    '',
    ...runs.map((r) => `- ${r}`),
    '',
    '| Row | Condition | Result | Detail |',
    '|---|---|---|---|',
    ...lines.map((l) => `| ${l.row.id} | ${l.row.title} | ${l.status} | ${l.detail.replace(/\|/g, '\\|')} |`),
    '',
    'Rows marked manual are checked by hand per docs/release/3.0-acceptance.md. A pass here is a spec result at this commit, not a production acceptance.',
    '',
  ].join('\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `acceptance-${short}.md`);
  fs.writeFileSync(out, md);
  console.log(md.split('\n').slice(4, 6).join('\n'));
  console.log(`wrote ${path.relative(ROOT, out)}`);
  if (count('FAIL')) return 1;
  return unreachable ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (err) => { console.error(`acceptance: ${err.message}`); process.exit(2); });
}
