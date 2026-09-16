import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The attack-surface map — what a security team writes on the whiteboard
 * before anyone reads code in depth. Deterministic, first-party code only, no
 * dependencies: this runs in the job that holds the model key, so nothing here
 * may pull in a third-party package.
 *
 * It does not judge. It lists every entry point, trust boundary and dangerous
 * sink with its location, so the consultants read with intent instead of
 * reading everything — and it lists every file, so the report can state what was
 * covered by which method.
 */

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

/**
 * What the map leaves out, each with its reason — and nothing that runs. Served
 * or executable files (HTML under public/, scripts, anything .js/.ts) are always
 * in, wherever they sit; the exclusions are named in the map with their counts,
 * so the report can state them instead of implying a coverage it does not have
 * (QA review of 52b34aba4cb8, finding b9dfa00d5649).
 */
/*
 * Every rule names file types, never a whole directory: an extensionless helper
 * or a format nobody listed stays in the map (QA review of b5e277c2e263, finding
 * ffcb81ab61a8). Unknown means included.
 */
/**
 * Markdown that executable code loads as a model prompt — in the map whatever
 * the extension rule below says.
 *
 * `docs/security/ciso-brief.md` is this audit's own CISO system prompt
 * (`scripts/security/lib/team.mjs` names it, `scripts/security/audit.mjs` reads
 * it and sends it as the system message). Excluded as prose, a change to it
 * reached no consultant as repository data, and a line telling the CISO to
 * downgrade findings would have steered the sealed report without anything in
 * the audit ever looking at it (QA review of 33471220d6e9, finding f4561d983d92).
 * The QA and UX briefs are loaded the same way by `scripts/qa/lib/prompt.mjs`
 * and `scripts/ux/lib/prompt.mjs`.
 *
 * Deliberately these three files and not every `.md` in the repository: what
 * makes them reviewable is that code reads them as instructions, not that they
 * are documentation. Together they are about 25,000 characters — a quarter of
 * one consultant call.
 */
export const AGENT_PROMPTS = [
  'docs/security/ciso-brief.md',
  'docs/qa/reviewer-brief.md',
  'docs/ux/ux-brief.md',
];

export const EXCLUSIONS = [
  { reason: 'binary media, fonts and archives — no executable content', test: (p) => /\.(png|jpe?g|gif|ico|webp|pdf|mp3|mp4|woff2?|ttf|zip)$/.test(p) },
  { reason: 'Markdown prose — not built, not served; the briefs an agent loads as a model prompt are in the map (AGENT_PROMPTS)', test: (p) => /\.md$/.test(p) },
  { reason: 'data files under docs/ (JSON, text, the public key) — not built, not served', test: (p) => /^docs\/.*\.(json|txt|pem|csv)$/.test(p) },
  { reason: 'data files of the separate video project — not part of the app build or deployment', test: (p) => /^clean-core-video\/.*\.(json|txt)$/.test(p) },
  { reason: 'sample ABAP and static text assets — data, not code', test: (p) => /^abap-test-files\/.*\.(abap|txt)$/.test(p) || /^public\/.*\.(abap|txt|vtt|sha256)$/.test(p) },
  { reason: 'generated SAP catalog data (synced JSON) — excluded, not reviewed', test: (p) => /^lib\/abap\/generated\/.*\.json$/.test(p) },
  { reason: 'the npm lockfile — its advisories come from the dependency audit', test: (p) => /(^|\/)package-lock\.json$/.test(p) },
];

/**
 * Anything that can run or be rendered is never excluded, whichever directory it
 * sits in — a directory rule must not decide coverage for a script (QA review of
 * 2a8a69f791de, finding f9942b308569).
 */
const EXECUTABLE = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|sh|bash|zsh|ps1|psm1|cmd|bat|py|rb|pl|php|html?|mdx|svg|yml|yaml|toml|rules)$/i;

const excludedBy = (path) =>
  EXECUTABLE.test(path) || AGENT_PROMPTS.includes(path) ? null : EXCLUSIONS.find((e) => e.test(path)) || null;

/** Domains the consultants are split by. The first match wins. */
export const DOMAINS = [
  // The agent prompts go to `ci-cloud-ai`, the consultant whose brief already covers
  // prompt injection and model output used in security decisions (lib/team.mjs).
  { domain: 'ci-cloud', test: (p) => AGENT_PROMPTS.includes(p) || /^\.github\/|^(Dockerfile|cloudbuild|firebase\.json|firebase\.rules-all-dbs\.json|vercel\.json)|^scripts\//.test(p) },
  { domain: 'data-rules', test: (p) => /^firestore\.rules$|^hooks\/|^lib\/(firebase|consent|usage|survey)/.test(p) },
  { domain: 'identity-crypto', test: (p) => /(mfa|approval-token|audit-|signing|signature|run-guard|s4-credentials|verify-pack|\.well-known|account\/|auth)/.test(p) },
  { domain: 'appsec-api', test: (p) => /^app\/api\/|^middleware\.ts$|^lib\/(gemini|rate-limit|safe-fetch|sanitize|runner|test-verdicts|abap\/)/.test(p) },
  { domain: 'frontend', test: (p) => /^(app|components)\//.test(p) },
  { domain: 'tests-and-config', test: () => true },
];

export function inventory(paths = git(['ls-files']).split('\n').filter(Boolean)) {
  return paths.filter((p) => !excludedBy(p)).map((path) => ({ path, domain: DOMAINS.find((d) => d.test(path)).domain }));
}

/** The files left out, grouped by reason, with a few examples each. */
export function exclusions(paths = git(['ls-files']).split('\n').filter(Boolean)) {
  return EXCLUSIONS.map(({ reason, test }) => {
    const hit = paths.filter((p) => excludedBy(p)?.test === test);
    return { reason, count: hit.length, examples: hit.slice(0, 3) };
  }).filter((e) => e.count);
}

const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

/** Line numbers of every match — locations, never the matched text beyond a short excerpt. */
function locate(path, text, re) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (re.test(line)) out.push({ path, line: i + 1, excerpt: line.trim().slice(0, 140) });
  });
  return out;
}

const AUTH_MARKERS = /verifyRequestAuth|verifyAdminRequest|assert[A-Z]\w*\(|requireAdmin|verifyIdToken|getAuth\(\)\.verify/;

export function apiRoutes(files) {
  return files
    .filter((f) => /^app\/api\/.*\/route\.ts$/.test(f.path))
    .map(({ path }) => {
      const src = read(path);
      return {
        path,
        methods: [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]),
        authMarkers: [...new Set([...src.matchAll(new RegExp(AUTH_MARKERS, 'g'))].map((m) => m[0].replace(/\($/, '')))],
        readsBody: /req(uest)?\.(json|formData|text)\(\)/.test(src),
        outboundFetch: /\b(fetch|safeFetch)\(/.test(src),
        childProcess: /child_process|spawn\(|exec(File)?(Sync)?\(/.test(src),
        envVars: [...new Set([...src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))],
      };
    });
}

const SINKS = [
  { sink: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ },
  { sink: 'innerHTML assignment', re: /\.innerHTML\s*=/ },
  { sink: 'eval / Function constructor', re: /\beval\(|new Function\(/ },
  { sink: 'child process', re: /child_process|\bspawn\(|\bexecSync\(|\bexecFile\(/ },
  { sink: 'dynamic redirect / window.open', re: /window\.location\s*=|location\.href\s*=|window\.open\(|router\.push\(\s*[a-zA-Z_$]/ },
  { sink: 'postMessage', re: /postMessage\(/ },
  { sink: 'token in web storage', re: /(localStorage|sessionStorage)\.setItem\([^)]*(token|key|secret)/i },
  { sink: 'raw SQL / query string build', re: /\$\{[^}]+\}.*\b(WHERE|SELECT)\b/ },
  { sink: 'client write to Firestore', re: /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\(/ },
  { sink: 'server env read in client file', re: /process\.env\.(?!NEXT_PUBLIC_)[A-Z]/ },
];

export function sinks(files) {
  const out = [];
  for (const { path } of files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(path)) continue;
    const src = read(path);
    const isClient = /^['"]use client['"]/m.test(src);
    for (const s of SINKS) {
      if (s.sink === 'server env read in client file' && !isClient) continue;
      for (const hit of locate(path, src, s.re)) out.push({ sink: s.sink, ...hit });
    }
  }
  return out;
}

export function workflows(files) {
  return files
    .filter((f) => /^\.github\/workflows\/.*\.ya?ml$/.test(f.path))
    .map(({ path }) => {
      const src = read(path);
      return {
        path,
        triggers: [...src.matchAll(/^\s{2}(push|pull_request_target|pull_request|schedule|workflow_dispatch|workflow_run|issue_comment):/gm)].map((m) => m[1]),
        writePermissions: [...new Set([...src.matchAll(/^\s+([a-z-]+):\s*write/gm)].map((m) => m[1]))],
        unpinnedActions: locate(path, src, /uses:\s*[^@\s]+@(?![0-9a-f]{40}\b)/),
        expressionsInRun: locate(path, src, /^\s*run:.*\$\{\{\s*(github\.event|inputs)\./),
        secretsUsed: [...new Set([...src.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))],
      };
    });
}

export function firestoreRules() {
  const src = read('firestore.rules');
  return {
    matches: locate('firestore.rules', src, /^\s*match\s+\//).map((m) => ({ line: m.line, match: m.excerpt })),
    openRules: locate('firestore.rules', src, /allow\s+[a-z, ]+:\s*if\s+true/),
  };
}

/**
 * `npm audit --json` output read strictly. Only a result with vulnerability
 * metadata counts as a scan; an error object (registry down, no network) or
 * anything else is reported as unavailable — never as zero findings (finding
 * 5be8e955fc64).
 */
export function readDependencyAudit(stdout) {
  let j;
  try {
    j = JSON.parse(stdout || '');
  } catch {
    return { error: 'npm audit output could not be read' };
  }
  if (j?.error || typeof j?.metadata?.vulnerabilities !== 'object' || j.metadata.vulnerabilities === null) {
    return { error: 'npm audit returned no audit result (registry or network error)' };
  }
  return {
    vulnerabilities: j.metadata.vulnerabilities,
    advisories: Object.values(j.vulnerabilities || {})
      .filter((v) => ['high', 'critical', 'moderate'].includes(v.severity))
      .map((v) => ({ package: v.name, severity: v.severity, direct: v.isDirect, fixAvailable: Boolean(v.fixAvailable) })),
  };
}

export function dependencyAudit() {
  try {
    return readDependencyAudit(execFileSync('npm', ['audit', '--package-lock-only', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }));
  } catch (err) {
    // npm audit exits non-zero when it finds something; the JSON is still on stdout.
    return readDependencyAudit(err.stdout);
  }
}

export function surfaceMap() {
  const tracked = git(['ls-files']).split('\n').filter(Boolean);
  const files = inventory(tracked);
  const byDomain = {};
  for (const f of files) byDomain[f.domain] = (byDomain[f.domain] || 0) + 1;
  return {
    version: 1,
    head: git(['rev-parse', 'HEAD']),
    files: { total: files.length, byDomain, list: files, excluded: exclusions(tracked) },
    apiRoutes: apiRoutes(files),
    sinks: sinks(files),
    workflows: workflows(files),
    firestoreRules: firestoreRules(),
    middleware: { csp: locate('middleware.ts', read('middleware.ts'), /(script|style|connect|frame|img)-src/) },
    dependencies: dependencyAudit(),
  };
}
