import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The QA agent (docs/QA-REVIEW-LOOP.md): every push to dev gets a delta review by
 * one pinned model and a smoke check of the deployed revision.
 *
 * What these tests hold, in the order it matters: nothing security-relevant
 * leaves the runner unsealed; the agent can only read; spend is capped; only the
 * delta is reviewed; and the report a maintainer acts on is honest about what it
 * did not cover.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const lib = (name: string) => import(path.resolve(ROOT, 'scripts/qa/lib', name));

test.describe('the workflow', () => {
  const wf = () => read('.github/workflows/qa-review.yml');

  test('runs on pushes to dev and can be revoked by one variable', () => {
    expect(wf()).toMatch(/on:\s*\n\s*push:\s*\n\s*branches:\s*\[dev\]/);
    expect(wf().match(/if: vars\.QA_REVIEW_ENABLED != 'false'/g)?.length).toBe(2);
    expect(wf()).not.toMatch(/pull_request_target/);
  });

  test('holds a read-only token and never writes to GitHub', () => {
    const perms = wf().slice(wf().indexOf('permissions:'), wf().indexOf('concurrency:'));
    expect(perms).toMatch(/contents:\s*read/);
    expect(perms).toMatch(/actions:\s*read/);
    expect(perms).not.toMatch(/write/);
    expect(wf()).not.toMatch(/gh (issue|pr) (create|comment)|gh api .*-X (POST|PATCH|PUT)|git push/);
    expect(wf().match(/persist-credentials: false/g)?.length).toBe(2);
  });

  test('passes secrets and inputs as environment, never as shell text', () => {
    // Every line that expands a secret, an input or event data must be an `env:` entry.
    for (const line of wf().split('\n').filter((l) => /\$\{\{\s*(secrets|inputs|github\.event)\./.test(l))) {
      expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{/);
    }
  });

  test('uploads only sealed files, and every action is pinned to a commit', () => {
    expect(wf()).toContain('path: .qa-review/out/qa-review.enc.json');
    expect(wf()).toContain('path: .qa-review/out/qa-smoke.enc.json');
    for (const uses of wf().match(/uses: [^\s]+/g) || []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });
});

test.describe('nothing security-relevant is exposed', () => {
  test('a sealed report opens only with the key and detects tampering', async () => {
    const { seal, open } = await lib('crypto.mjs');
    const key = 'k'.repeat(40);
    const env = seal({ findings: [{ title: 'secret detail' }] }, key);
    expect(JSON.stringify(env)).not.toContain('secret detail');
    expect(open(env, key).findings[0].title).toBe('secret detail');
    expect(() => open(env, 'x'.repeat(40))).toThrow();
    const tampered = { ...env, data: Buffer.from('tampered').toString('base64') };
    expect(() => open(tampered, key)).toThrow();
    expect(() => seal({}, 'short')).toThrow(/32 characters/);
  });

  test('the public summary carries no verdict, counts, titles or files', async () => {
    const { publicSummary } = await lib('report.mjs');
    const s = publicSummary({
      range: { head: 'a'.repeat(40) },
      verdict: 'no_go',
      findings: [{ severity: 'critical', title: 'SQL injection in route', file: 'app/api/x/route.ts' }],
      meta: { modelCalls: 1, costUsd: 0.42 },
    });
    const text = JSON.stringify(s);
    for (const leak of ['no_go', 'critical', 'SQL', 'app/api']) expect(text).not.toContain(leak);
    expect(Object.keys(s).sort()).toEqual(['costUsd', 'head', 'modelCalls', 'status']);
  });

  test('credentials in a delta are redacted before sending, and counted', async () => {
    const { redactSecrets } = await lib('redact.mjs');
    const googleKey = 'AIza' + 'B'.repeat(35);
    const input = [`const k = '${googleKey}';`, `OPENROUTER_API_KEY="sk-or-v1-${'a'.repeat(64)}"`, "PILOT_APPROVAL_SECRET = 'test-approval-secret-key-1234567890';"].join('\n');
    const { text, hits } = redactSecrets(input);
    expect(text).not.toContain(googleKey);
    expect(text).not.toMatch(/sk-or-v1-a{64}/);
    // Test fixtures are not credentials and stay readable for the reviewer.
    expect(text).toContain('test-approval-secret-key-1234567890');
    expect(hits.map((h: { kind: string }) => h.kind)).toEqual(expect.arrayContaining(['Google API key', 'OpenRouter key']));
  });

  test("the project's own key names are redacted too", async () => {
    const { redactSecrets } = await lib('redact.mjs');
    const value = require('crypto').randomBytes(32).toString('hex');
    for (const name of ['QA_REVIEW_KEY', 'AUDIT_SIGNING_KEY', 'S4_ENCRYPTION_KEY', 'SECURITY_AUDIT_PRIVATE_KEY']) {
      const { text, hits } = redactSecrets(`const ${name} = '${value}';`);
      expect(text).not.toContain(value);
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  test('credential-shaped files are never read', async () => {
    const { isReviewable } = await lib('git-delta.mjs');
    for (const p of ['.env.local', '.env', 'certs/server.pem', 'firebase-adminsdk-abc.json', 'config/service-account.json']) expect(isReviewable(p)).toBe(false);
  });

  test('scripts print only messages, never stacks or response bodies', () => {
    for (const f of ['scripts/qa/review.mjs', 'scripts/qa/smoke.mjs']) {
      const src = read(f);
      expect(src).toMatch(/console\.error\(`QA \w+ failed: \$\{err\?\.message \|\| err\}`\)/);
      expect(src).not.toMatch(/console\.(log|error)\([^)]*\.stack/);
    }
    expect(read('scripts/qa/lib/openrouter.mjs')).not.toMatch(/await res\.text\(\)/);
  });

  test('the refuted list is committed sealed, and .qa-review/ is ignored', async () => {
    const { REFUTED_PATH } = await lib('store.mjs');
    expect(REFUTED_PATH).toMatch(/\.enc\.json$/);
    expect(read('.gitignore')).toMatch(/^\.qa-review\/$/m);
  });
});

test.describe('the reviewer', () => {
  test('is one pinned model, with no tools, no fallbacks and no data collection', async () => {
    const { QA_MODEL } = await lib('config.mjs');
    const { buildRequest } = await lib('openrouter.mjs');
    expect(QA_MODEL).toBe('openai/gpt-6-astra');
    const req = buildRequest({ system: 's', user: 'u', schema: { type: 'object' }, effort: 'medium' });
    expect(req.model).toBe(QA_MODEL);
    expect(req.tools).toBeUndefined();
    expect(req.provider).toEqual({ allow_fallbacks: false, data_collection: 'deny' });
    expect(req.response_format.json_schema.strict).toBe(true);
    // The model id lives in exactly one file.
    const hits = fs.readdirSync(path.resolve(ROOT, 'scripts/qa'), { recursive: true }).filter((f) => String(f).endsWith('.mjs') && read(`scripts/qa/${String(f).replace(/\\/g, '/')}`).includes('gpt-6-astra'));
    expect(hits.map(String)).toEqual([path.join('lib', 'config.mjs')]);
  });

  test('retries a rate limit, then gives up with the status only', async () => {
    const { callReviewer } = await lib('openrouter.mjs');
    let calls = 0;
    const ok = async () => {
      calls++;
      if (calls === 1) return new Response('{"error":"echo of the prompt"}', { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"go"}' } }], usage: { cost: 0.1 } }), { status: 200 });
    };
    test.setTimeout(30_000);
    const r = await callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: ok });
    expect(r.review.verdict).toBe('go');
    expect(calls).toBe(2);

    const denied = async () => new Response('{"error":"echo of the prompt"}', { status: 401 });
    await expect(callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: denied })).rejects.toThrow(/^OpenRouter answered HTTP 401 \(key rejected\)$/);
    // The hint comes from the status, never from the body.
    const gated = async () => new Response('{"error":{"message":"echo of the prompt"}}', { status: 403 });
    const e403 = await callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: gated }).catch((e: Error) => e);
    expect(String((e403 as Error).message)).toMatch(/^OpenRouter answered HTTP 403 \(key or account not permitted for this model/);
    expect(String((e403 as Error).message)).not.toContain('echo');
    const teapot = async () => new Response('echo of the prompt', { status: 418 });
    await expect(callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: teapot })).rejects.toThrow(/^OpenRouter answered HTTP 418$/);
  });

  test('another agent can pin its own model and send screenshots through the same transport', async () => {
    const { buildRequest, callReviewer } = await lib('openrouter.mjs');
    const parts = [{ type: 'text', text: 'Screenshot 03-analyze-desktop-s1' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }];
    const req = buildRequest({ system: 's', user: parts, schema: { type: 'object' }, effort: 'low', model: 'meta/muse-spark-1.3', maxTokens: 8000, name: 'ux_review' });
    expect(req).toMatchObject({ model: 'meta/muse-spark-1.3', max_tokens: 8000, provider: { allow_fallbacks: false, data_collection: 'deny' } });
    expect(req.messages[1].content).toEqual(parts);
    expect(req.response_format.json_schema.name).toBe('ux_review');
    let headers: Record<string, string> = {};
    const capture = async (_url: string, init: { headers: Record<string, string> }) => {
      headers = init.headers;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: { cost: 0.01 } }), { status: 200 });
    };
    const r = await callReviewer({ apiKey: 'k', system: 's', user: parts, schema: { type: 'object' }, effort: 'low', model: 'meta/muse-spark-1.3', title: 'Clean-Core.io UX Review', fetchImpl: capture });
    expect(headers['X-Title']).toBe('Clean-Core.io UX Review');
    expect(r.model).toBe('meta/muse-spark-1.3');
  });

  test('never retries what may already have been generated and billed', async () => {
    const { callReviewer } = await lib('openrouter.mjs');
    for (const outcome of [() => new Response('upstream', { status: 503 }), () => Promise.reject(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))]) {
      let calls = 0;
      const fetchImpl = async () => {
        calls++;
        return outcome();
      };
      await expect(callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl })).rejects.toThrow();
      expect(calls).toBe(1);
    }
  });

  test('a malformed answer never quotes itself into the error a public log prints', async () => {
    const { callReviewer } = await lib('openrouter.mjs');
    const sentinel = 'PRIVATE-REVIEW-SENTINEL';
    const notJson = async () => new Response(`${sentinel} this is not json`, { status: 200 });
    const error = await callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: notJson }).catch((e: Error) => e);
    expect(String(error.message)).toBe('OpenRouter returned a response that is not JSON.');
    const emptyContent = async () => new Response(JSON.stringify({ choices: [{ finish_reason: sentinel, message: { content: '' } }], usage: { completion_tokens: sentinel } }), { status: 200 });
    const error2 = await callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: emptyContent }).catch((e: Error) => e);
    expect(String(error2.message)).toMatch(/^OpenRouter returned no review content/);
    // finish_reason is echoed only when it is a known value; a count that is not a number is dropped.
    expect(String(error2.message)).not.toContain('PRIVATE');
    expect(String(error2.message)).toContain('finish_reason=unrecognised');
    const lowercase = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'private_verdict', message: { content: '' } }] }), { status: 200 });
    const error3 = await callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: {}, effort: 'medium', fetchImpl: lowercase }).catch((e: Error) => e);
    expect(String(error3.message)).not.toContain('private_verdict');
  });

  test('valid JSON that is not a review is rejected, not approved', async () => {
    const { callReviewer } = await lib('openrouter.mjs');
    const { REVIEW_SCHEMA } = await lib('prompt.mjs');
    const answer = (content: unknown) => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost: 0.1 } }), { status: 200 });
    const call = (content: unknown) => callReviewer({ apiKey: 'k', system: 's', user: 'u', schema: REVIEW_SCHEMA, effort: 'medium', fetchImpl: answer(content) }).catch((e: Error) => e);
    const good = { verdict: 'go', summary: '', findings: [], acceptance: [], test_gaps: [], previous_findings: [], coverage_notes: '' };
    expect((await call(good) as { review?: unknown }).review).toEqual(good);
    expect(String((await call({}) as Error).message)).toBe('The review did not match the schema at $.verdict.');
    expect(String((await call({ ...good, verdict: 'ship it' }) as Error).message)).toMatch(/at \$\.verdict\.$/);
    const badFinding = { ...good, findings: [{ severity: 'catastrophic', category: 'correctness', file: 'a', line: 1, title: 't', failure_scenario: 'f', evidence: 'e', suggested_fix: 's', confidence: 1 }] };
    expect(String((await call(badFinding) as Error).message)).toMatch(/at \$\.findings\[0\]\.severity\.$/);
    // Prototype names are undeclared keys like any other — parsed from JSON, where they are own properties.
    const { firstViolation } = await lib('validate.mjs');
    const withKey = (key: string) => JSON.parse(JSON.stringify(good).replace(/^\{/, `{"${key}":{"x":1},`));
    expect(firstViolation(REVIEW_SCHEMA, withKey('constructor'))).toBe('$.<unexpected>');
    expect(firstViolation(REVIEW_SCHEMA, withKey('__proto__'))).toBe('$.<unexpected>');
    expect(firstViolation(REVIEW_SCHEMA, JSON.parse(JSON.stringify(badFinding).replace('"severity"', '"toString":1,"severity"')))).toBe('$.findings[0].<unexpected>');
  });

  test('every outgoing message passes a final redaction, commit subjects included', () => {
    const src = read('scripts/qa/review.mjs');
    expect(src).toMatch(/range\.commits = range\.commits\.map\(\(c\) => clean\('commit subjects', c\)\)/);
    const beforeCall = src.slice(0, src.indexOf('await callReviewer('));
    expect(beforeCall).toMatch(/const outgoingSystem = clean\('outgoing message', system\)/);
    expect(beforeCall).toMatch(/const user = clean\('outgoing message', buildUserMessage\(/);
    expect(src).toMatch(/callReviewer\(\{ apiKey: env\.OPENROUTER_API_KEY, system: outgoingSystem, user,/);
  });

  test('refuses to run without a key', async () => {
    const { callReviewer } = await lib('openrouter.mjs');
    await expect(callReviewer({ apiKey: '', system: 's', user: 'u', schema: {}, effort: 'medium' })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});

test.describe('spend is capped and only the delta is reviewed', () => {
  const file = (p: string, tags: string[], size: number) => ({ path: p, status: 'M', tags, diff: 'x'.repeat(size), callers: [] });

  test('the riskiest files go first, and what does not fit is named', async () => {
    const { packBatches } = await lib('pack.mjs');
    const { BUDGET } = await lib('config.mjs');
    const files = [file('app/page.tsx', ['ui'], 150_000), file('firestore.rules', ['security'], 150_000), file('tests/a.spec.ts', ['tests'], 150_000)];
    const { batches, notReviewed } = packBatches(files, 10_000);
    expect(batches[0].files[0].path).toBe('firestore.rules');
    expect(batches.length).toBeLessThanOrEqual(BUDGET.maxBatches);
    expect(notReviewed.map((n: { path: string }) => n.path)).toEqual(['tests/a.spec.ts']);
  });

  test('the cost cap is checked before every call against what was actually spent', async () => {
    const { withinBudget, BUDGET, estimateCostUsd } = await lib('config.mjs');
    // A first call of normal size fits; the same call after most of the budget is spent does not.
    expect(withinBudget(0, 120_000)).toBe(true);
    expect(withinBudget(BUDGET.maxCostUsd - 0.1, 120_000)).toBe(false);
    // The per-call estimate assumes the whole output allowance, so it can never undercount a call.
    expect(estimateCostUsd(0, 1)).toBeCloseTo((BUDGET.maxOutputTokens / 1e6) * 50, 5);
    expect(read('scripts/qa/review.mjs')).toMatch(/if \(!withinBudget\(spentForCap, outgoingSystem\.length \+ user\.length \+ SCHEMA_CHARS\)\)/);
  });

  test('an unreported cost is unknown, never zero', async () => {
    const { actualCost } = await lib('report.mjs');
    expect(actualCost([{ cost: 0.4 }, { cost: 0.41 }])).toBe(0.81);
    expect(actualCost([{ cost: 0.4 }, {}])).toBeNull();
    expect(actualCost([{ cost: 0.4 }, null])).toBeNull();
    expect(read('scripts/qa/review.mjs')).toMatch(/spentForCap \+= typeof r\.usage\?\.cost === 'number' \? r\.usage\.cost : estimateCostUsd\(/);
  });

  test('the review base: checkpoint when usable, otherwise everything not yet on main — never the push event', async () => {
    const { chooseBase } = await lib('git-delta.mjs');
    const ancestors = new Set(['cp>head']);
    const base = (over: Record<string, unknown>) =>
      chooseBase({ head: 'head', overrideBase: null, checkpoint: null, isAncestorOf: (a: string, b: string) => ancestors.has(`${a}>${b}`), mainBase: () => 'main-base', ...over });
    expect(base({ checkpoint: 'cp' }).base).toBe('cp');
    expect(base({}).base).toBe('main-base'); // no checkpoint: first run, or every earlier run failed
    expect(base({ checkpoint: 'rewritten' }).base).toBe('main-base'); // force push made it unusable
    expect(base({ checkpoint: 'cp', overrideBase: 'manual' }).base).toBe('manual');
    expect(base({ mainBase: () => 'head' }).base).toBeNull(); // head is on main
    // No shared history with main is not "on main": the run stops instead of reviewing one commit.
    expect(() => base({ checkpoint: 'rewritten', mainBase: () => null })).toThrow(/No usable review base/);
    expect(() => base({ mainBase: () => null })).toThrow(/No usable review base/);
    const wf = read('.github/workflows/qa-review.yml');
    expect(wf).not.toMatch(/github\.event\.before/);
    expect(wf).toContain('QA_BASE_OVERRIDE: ${{ inputs.base }}');
    expect(wf).toMatch(/--limit 50/);
  });

  test('the merge base with main is found in a real repository, independent of how it was cloned', async () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const os = require('os') as typeof import('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-base-'));
    const g = (...args: string[]) => execFileSync('git', ['-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    try {
      g('init', '-q', '-b', 'main');
      fs.writeFileSync(path.join(dir, 'a.txt'), '1');
      g('add', '.');
      g('commit', '-q', '-m', 'on main');
      const onMain = g('rev-parse', 'HEAD');
      g('checkout', '-q', '-b', 'dev');
      fs.writeFileSync(path.join(dir, 'a.txt'), '2');
      g('commit', '-q', '-am', 'on dev');
      const { pathToFileURL } = require('url') as typeof import('url');
      const moduleUrl = pathToFileURL(path.resolve(ROOT, 'scripts/qa/lib/git-delta.mjs')).href;
      const out = execFileSync('node', ['--input-type=module', '-e', `import { mergeBaseWithMain } from ${JSON.stringify(moduleUrl)}; console.log(mergeBaseWithMain('HEAD'))`], { cwd: dir, encoding: 'utf8' }).trim();
      expect(out).toBe(onMain);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a review that could not read all of its delta is incomplete: no clean go, checkpoint stays', async () => {
    const { buildReport, needsAnotherRound } = await lib('report.mjs');
    const clean = { review: { verdict: 'go', summary: '', findings: [], acceptance: [], test_gaps: [], previous_findings: [], coverage_notes: '' }, files: ['a.ts'] };
    const range = { base: 'b'.repeat(40), head: 'h'.repeat(40) };
    const partial = buildReport({ range, results: [clean], previous: null, refuted: [], notReviewed: [{ path: 'b.ts', reason: 'outside the $2.5 cost cap' }], triage: { tags: [], signals: [], codeWithoutTests: false }, meta: {} });
    expect(partial.incomplete).toBe(true);
    expect(partial.verdict).toBe('go_with_notes');
    expect(partial.range.checkpoint).toBe(range.base);
    expect(needsAnotherRound(partial)).toBe(true);
    const complete = buildReport({ range, results: [clean], previous: null, refuted: [], notReviewed: [], triage: { tags: [], signals: [], codeWithoutTests: false }, meta: {} });
    expect(complete.range.checkpoint).toBe(range.head);
    expect(needsAnotherRound(complete)).toBe(false);
    expect(read('scripts/qa/review.mjs')).toMatch(/checkpoint: previous\?\.range\?\.checkpoint \?\? previous\?\.range\?\.head/);
  });

  test('a deleted file keeps its diff, and its removed exports are looked up', async () => {
    const { touchedSymbols } = await lib('git-delta.mjs');
    const deletion = ['@@ -1,3 +0,0 @@', '-export function signRunEnvelope(x) {', '-  return x;', '-}', "-export const REVIEW_LIMIT = 3;"].join('\n');
    expect(touchedSymbols(deletion).sort()).toEqual(['REVIEW_LIMIT', 'signRunEnvelope']);
    const src = read('scripts/qa/review.mjs');
    expect(src).not.toMatch(/file deleted:/);
    expect(src).not.toMatch(/f\.status === 'D' \? \[\]/);
  });

  test('a local wait reads only the results of the attempt it selected, for the commit it expects, from jobs that succeeded', () => {
    const src = read('scripts/qa/await.mjs');
    expect(src).toMatch(/join\(LOCAL_DIR, 'runs', `\$\{short\}-\$\{run\.databaseId\}-\$\{attempt\}`\)/);
    expect(src).toMatch(/rmSync\(dir, \{ recursive: true, force: true \}\)/);
    expect(src).toMatch(/succeeded\('Delta review'\) \? sealedReports\(dir, secret\)\.find\(\(r\) => r\.range\?\.head === sha && current\(r\.meta\?\.run\)\)/);
    expect(src).toMatch(/succeeded\('Smoke check'\) \? sealedReports\(dir, secret, 'qa-smoke\.enc\.json'\)\.find\(\(s\) => s\.head === sha && current\(s\.run\)\)/);
    const wf = read('.github/workflows/qa-review.yml');
    expect(wf).toContain('name: qa-review-${{ github.sha }}-${{ github.run_attempt }}');
    expect(wf).toContain('name: qa-smoke-${{ github.sha }}-${{ github.run_attempt }}');
    expect(read('scripts/qa/review.mjs')).toMatch(/run: \{ id: env\.GITHUB_RUN_ID \|\| null, attempt: env\.GITHUB_RUN_ATTEMPT \|\| null \}/);
  });

  test('a file larger than one call is reported, not silently cut from view', async () => {
    const { packBatches } = await lib('pack.mjs');
    const { notReviewed } = packBatches([file('lib/huge.ts', [], 500_000)], 10_000);
    expect(notReviewed[0].reason).toMatch(/exceeds one call's budget/);
  });

  test('generated, vendored and prose files are not sent as code', async () => {
    const { isReviewable, isClaimSource } = await lib('git-delta.mjs');
    for (const p of ['package-lock.json', 'lib/abap/generated/cloudification-repo.latest.json', 'docs/ROADMAP.md', 'public/og.png']) expect(isReviewable(p)).toBe(false);
    for (const p of ['app/api/health/route.ts', 'firestore.rules', '.github/workflows/deploy.yml', 'lib/abap/evidence-model.ts']) expect(isReviewable(p)).toBe(true);
    expect(isClaimSource('CHANGELOG.md')).toBe(true);
  });

  test('workflow inputs that are not commit ids never reach git', async () => {
    const { commitIdOrNull } = await lib('git-delta.mjs');
    expect(commitIdOrNull('c1349b5')).toBe('c1349b5');
    expect(commitIdOrNull('')).toBeNull();
    for (const bad of ['--output=/tmp/x', 'HEAD;rm -rf /', 'main']) expect(() => commitIdOrNull(bad)).toThrow();
  });
});

test.describe('the report a maintainer acts on', () => {
  const finding = (over: Record<string, unknown> = {}) => ({
    severity: 'medium',
    category: 'correctness',
    file: 'lib/x.ts',
    line: 3,
    title: 'Null input crashes',
    failure_scenario: 'x',
    evidence: 'y',
    suggested_fix: 'z',
    confidence: 0.8,
    ...over,
  });
  const review = (findings: unknown[], previous_findings: unknown[] = []) => ({ review: { verdict: 'go_with_notes', summary: 's', findings, acceptance: [], test_gaps: [], previous_findings, coverage_notes: '' }, files: ['lib/x.ts'] });
  const triage = { tags: [], signals: [], codeWithoutTests: false };
  const range = { base: 'b', head: 'h'.repeat(40) };

  test('open findings are carried until a review marks them resolved', async () => {
    const { buildReport, fingerprint } = await lib('report.mjs');
    const old = { ...finding({ title: 'Old bug' }), fingerprint: fingerprint(finding({ title: 'Old bug' })) };
    const resolvedOne = { ...finding({ title: 'Fixed bug' }), fingerprint: fingerprint(finding({ title: 'Fixed bug' })) };
    const report = buildReport({
      range,
      results: [review([finding()], [{ fingerprint: resolvedOne.fingerprint, status: 'resolved', reason: 'guard added' }])],
      previous: { findings: [old, resolvedOne] },
      refuted: [],
      notReviewed: [],
      triage,
      meta: {},
    });
    expect(report.findings.map((f: { title: string }) => f.title).sort()).toEqual(['Null input crashes', 'Old bug']);
    expect(report.findings.find((f: { title: string; carried?: boolean }) => f.title === 'Old bug').carried).toBe(true);
    expect(report.resolved.map((f: { title: string }) => f.title)).toEqual(['Fixed bug']);
  });

  test('a refuted finding is not carried, but one the reviewer raises again is kept and marked', async () => {
    const { buildReport, fingerprint } = await lib('report.mjs');
    const refutedOne = { ...finding(), fingerprint: fingerprint(finding()) };
    const carriedOnly = buildReport({ range, results: [review([])], previous: { findings: [refutedOne] }, refuted: [{ fingerprint: refutedOne.fingerprint }], notReviewed: [], triage, meta: {} });
    expect(carriedOnly.findings).toEqual([]);
    const reRaised = buildReport({ range, results: [review([finding()])], previous: null, refuted: [{ fingerprint: refutedOne.fingerprint }], notReviewed: [], triage, meta: {} });
    expect(reRaised.findings).toHaveLength(1);
    expect(reRaised.findings[0].reRaisedAfterRefutation).toBe(true);
  });

  test('a re-raised regression survives the next unrelated push until it is resolved or refuted again', async () => {
    const { buildReport, fingerprint, isSuppressed } = await lib('report.mjs');
    const fp = fingerprint(finding());
    const firstRefutation = [{ fingerprint: fp, refutedAt: '2026-01-01T00:00:00.000Z' }];
    // Review B re-raises it after the refutation.
    const b = buildReport({ range, results: [review([finding()])], previous: null, refuted: firstRefutation, notReviewed: [], triage, meta: {} });
    expect(b.findings[0].reRaisedAfterRefutation).toBe(true);
    // Review C of an unrelated push mentions nothing — the regression is carried, not swallowed by the old refutation.
    expect(isSuppressed(b.findings[0], firstRefutation)).toBe(false);
    const c = buildReport({ range, results: [review([])], previous: b, refuted: firstRefutation, notReviewed: [], triage, meta: {} });
    expect(c.findings.map((f: { fingerprint: string }) => f.fingerprint)).toEqual([fp]);
    // A new refutation written after the re-raise suppresses it again.
    const secondRefutation = [{ fingerprint: fp, refutedAt: new Date(Date.parse(b.findings[0].raisedAt) + 1000).toISOString() }];
    const d = buildReport({ range, results: [review([])], previous: c, refuted: secondRefutation, notReviewed: [], triage, meta: {} });
    expect(d.findings).toEqual([]);
  });

  test('one batch not touching a finding does not undo another batch resolving it', async () => {
    const { buildReport, fingerprint } = await lib('report.mjs');
    const fixed = { ...finding({ title: 'Fixed in batch one' }), fingerprint: fingerprint(finding({ title: 'Fixed in batch one' })) };
    const disputed = { ...finding({ title: 'Disputed' }), fingerprint: fingerprint(finding({ title: 'Disputed' })) };
    const report = buildReport({
      range,
      results: [
        review([], [{ fingerprint: fixed.fingerprint, status: 'resolved', reason: 'guard added' }, { fingerprint: disputed.fingerprint, status: 'resolved', reason: 'looks fixed' }]),
        review([], [{ fingerprint: fixed.fingerprint, status: 'not_touched', reason: 'not in this batch' }, { fingerprint: disputed.fingerprint, status: 'still_open', reason: 'caller still unguarded' }]),
      ],
      previous: { findings: [fixed, disputed] },
      refuted: [],
      notReviewed: [],
      triage,
      meta: {},
    });
    expect(report.resolved.map((f: { title: string }) => f.title)).toEqual(['Fixed in batch one']);
    expect(report.findings.map((f: { title: string }) => f.title)).toEqual(['Disputed']);
  });

  test('fingerprints survive a moved line but not a different file', async () => {
    const { fingerprint } = await lib('report.mjs');
    expect(fingerprint(finding({ line: 99 }))).toBe(fingerprint(finding()));
    expect(fingerprint(finding({ file: 'lib/y.ts' }))).not.toBe(fingerprint(finding()));
  });

  test('medium and above keep the loop open; low does not', async () => {
    const { isBlocking } = await lib('report.mjs');
    expect(isBlocking({ findings: [finding({ severity: 'low' })] })).toBe(false);
    expect(isBlocking({ findings: [finding({ severity: 'medium' })] })).toBe(true);
  });

  test('triage names test-weakening and quoted acceptance criteria', async () => {
    const { testSignals, acceptanceCriteria } = await lib('triage.mjs');
    const diff = ['-    expect(result).toBe(true);', '+  test.skip(\'flaky\', () => {});', '+  // eslint-disable-next-line'].join('\n');
    expect(testSignals('tests/a.spec.ts', diff).map((s: { signal: string }) => s.signal)).toEqual(['assertion removed', 'test skipped or focused', 'lint or type check suppressed']);
    expect(acceptanceCriteria('Roadmap: **„Typecheck, Tests und Fachfreigaben sind Pflichtchecks."**')).toEqual(['Typecheck, Tests und Fachfreigaben sind Pflichtchecks.']);
  });
});

test.describe('the loop starts itself', () => {
  test('the post-push hook speaks for pushes to dev and main, and stays silent otherwise', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const run = (command: string) => execFileSync('node', [path.resolve(ROOT, '.claude/hooks/after-push.mjs')], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
    for (const c of ['git push origin dev', 'git push origin HEAD:dev', 'git push origin fix/x:dev']) expect(run(c)).toContain('qa-review-loop');
    for (const c of ['git push origin main', 'git push origin HEAD:main && echo ok']) expect(run(c)).toContain('scripts/security/inbox.mjs');
    for (const c of ['git push origin devtools', 'git push --dry-run origin dev', 'git status', 'npm run dev']) expect(run(c)).toBe('');
  });
});

test.describe('weekly pipeline health', () => {
  const day = 86_400_000;
  const now = Date.parse('2026-09-15T08:00:00Z');
  const run = (conclusion: string, daysAgo: number, event = 'schedule') => ({ databaseId: daysAgo, status: 'completed', conclusion, createdAt: new Date(now - daysAgo * day).toISOString(), event });

  test('a red newest result is failing, and says since when', async () => {
    const { assess } = await lib('health.mjs');
    const v = assess({ file: 'sync-catalog.yml', name: 'Sync', scheduled: true }, [run('failure', 1), run('failure', 8), run('success', 15)], now);
    expect(v.state).toBe('failing');
    expect(v.failingSince).toBe(new Date(now - 8 * day).toISOString());
  });

  test('a scheduled workflow that stopped running is stale; cancelled runs do not count as results', async () => {
    const { assess } = await lib('health.mjs');
    expect(assess({ file: 'a.yml', name: 'A', scheduled: true }, [run('success', 12)], now).state).toBe('stale');
    expect(assess({ file: 'b.yml', name: 'B', scheduled: false }, [run('cancelled', 0, 'push'), run('success', 3, 'push')], now).state).toBe('ok');
    expect(assess({ file: 'c.yml', name: 'C', scheduled: false }, [], now).state).toBe('never-run');
  });

  test('the last scheduled run is looked up on its own, so pushes cannot fake a stale schedule', async () => {
    const { assess } = await lib('health.mjs');
    const pushes = Array.from({ length: 10 }, (_, i) => run('success', i / 10, 'push'));
    expect(assess({ file: 'a.yml', name: 'A', scheduled: true }, pushes, now, [run('success', 2)]).state).toBe('ok');
    expect(assess({ file: 'a.yml', name: 'A', scheduled: true }, pushes, now, []).state).toBe('stale');
  });

  test('what could not be read is never reported as green', async () => {
    const { classifyGhError, renderHealth } = await lib('health.mjs');
    expect(classifyGhError({ stderr: 'HTTP 404: workflow x.yml not found on the default branch' })).toBe('not-on-main');
    expect(classifyGhError({ stderr: 'gh: Not Found (HTTP 404)' })).toBe('absent');
    expect(classifyGhError({ stderr: 'HTTP 401: Bad credentials' })).toBe('unreadable');
    expect(classifyGhError(new Error('connect ETIMEDOUT'))).toBe('unreadable');
    const h = { createdAt: '2026-09-15T08:00:00Z', ok: false, workflows: [{ name: 'Deploy', file: 'deploy.yml', state: 'unknown' }], pending: [{ branch: 'chore/x', unknown: true }] };
    const text = renderHealth(h);
    expect(text).toContain('needs attention');
    expect(text).toContain('UNKNOWN Deploy (deploy.yml)');
    expect(text).toContain('UNKNOWN chore/x');
    expect(read('scripts/qa/lib/health.mjs')).toMatch(/ok: workflows\.every\(\(w\) => \['ok', 'never-run', 'not-on-main'\]\.includes\(w\.state\)\)/);
  });

  test('the weekly workflow only reads and seals its record', () => {
    const wf = read('.github/workflows/qa-weekly-health.yml');
    expect(wf).toMatch(/cron: '30 7 \* \* 1'/);
    expect(wf.slice(wf.indexOf('permissions:'), wf.indexOf('jobs:'))).not.toMatch(/write/);
    expect(wf).toContain("if: vars.QA_REVIEW_ENABLED != 'false'");
    expect(wf).toContain('node scripts/qa/health.mjs --seal');
    expect(wf).toContain('path: .qa-review/out/qa-health.enc.json');
  });

  test('the catalog sync pushes its branch instead of asking Actions for a pull request', () => {
    const wf = read('.github/workflows/sync-catalog.yml');
    expect(wf).not.toMatch(/uses:\s*peter-evans\/create-pull-request/);
    expect(wf.slice(wf.indexOf('\npermissions:'), wf.indexOf('\njobs:'))).not.toMatch(/pull-requests/);
    expect(wf).toMatch(/git push --force origin chore\/sync-cloudification-repo/);
  });

  test('the health check watches that branch', async () => {
    const { BOT_BRANCHES } = await lib('health.mjs');
    expect(BOT_BRANCHES).toContain('chore/sync-cloudification-repo');
  });
});

test.describe('the deployed revision can be told apart', () => {
  test('health reports the commit it was built from, and deploy sets it', () => {
    expect(read('app/api/health/route.ts')).toMatch(/commit,\s*time:/);
    expect(read('.github/workflows/deploy.yml')).toContain('COMMIT_SHA=${{ github.sha }}');
  });
});
