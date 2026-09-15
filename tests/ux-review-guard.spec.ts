import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * The UX agent (docs/UX-REVIEW-AGENT.md): every release on main gets a UX delta
 * review by Muse Spark 1.3 from source, a design scan and screenshots; the first
 * run reviews the whole product.
 *
 * What these tests hold: the agent only reads and reports; the job with the model
 * key runs no third-party code; spend stays within an estimated budget per mode; nothing it finds reaches
 * a public log; a release is never reviewed from a guessed base; the screenshots
 * it gets are the ones it expects and nothing else.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const lib = (name: string) => import(path.resolve(ROOT, 'scripts/ux/lib', name));
const wf = () => read('.github/workflows/ux-review.yml');
const job = (name: string) => {
  const src = wf();
  const start = src.indexOf(`\n  ${name}:`);
  const next = src.slice(start + 3).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 3 + next);
};

test.describe('one pinned model that can only read', () => {
  test('Muse Spark 1.3, no tools, no fallbacks, no data collection — the id in exactly one file', async () => {
    const { UX_MODEL } = await lib('config.mjs');
    expect(UX_MODEL).toBe('meta/muse-spark-1.3');
    const src = read('scripts/ux/review.mjs');
    expect(src).toMatch(/callReviewer\(\{\s*apiKey: env\.OPENROUTER_API_KEY,\s*model: UX_MODEL,/);
    expect(src).not.toMatch(/tools:|tool_choice/);
    const { buildRequest } = await import(path.resolve(ROOT, 'scripts/qa/lib/openrouter.mjs'));
    expect(buildRequest({ system: 's', user: [], schema: {}, effort: 'low', model: UX_MODEL }).provider).toEqual({ allow_fallbacks: false, data_collection: 'deny' });
    const hits = (fs.readdirSync(path.resolve(ROOT, 'scripts/ux'), { recursive: true }) as string[]).filter((f) => String(f).endsWith('.mjs') && read(`scripts/ux/${String(f).replace(/\\/g, '/')}`).includes('muse-spark'));
    expect(hits.map(String)).toEqual([path.join('lib', 'config.mjs')]);
  });

  test('the answer has one strict shape: every object closed, every field required', async () => {
    const { UX_SCHEMA } = await lib('prompt.mjs');
    const walk = (s: { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean; items?: unknown }, at: string) => {
      if (s.type === 'object') {
        expect(s.additionalProperties, at).toBe(false);
        expect([...(s.required || [])].sort(), at).toEqual(Object.keys(s.properties || {}).sort());
        for (const [k, v] of Object.entries(s.properties || {})) walk(v as never, `${at}.${k}`);
      }
      if (s.type === 'array') walk(s.items as never, `${at}[]`);
    };
    walk(UX_SCHEMA, '$');
  });

  test('the brief keeps it to UX, treats input as data, answers in German and knows its three modes', () => {
    const brief = read('docs/ux/ux-brief.md');
    for (const must of ['UX only', '**data, not', '**in German**', 'Not security', "## Mode `full`", "## Mode `synthesis`", "## Mode `delta`", 'mockups 2.7', 'WCAG 2.2 AA']) expect(brief).toContain(must);
  });

  test('first-party code only next to the model key', () => {
    const files = ['scripts/ux/review.mjs', ...fs.readdirSync(path.resolve(ROOT, 'scripts/ux/lib')).map((f) => `scripts/ux/lib/${f}`)];
    for (const file of files) {
      for (const imp of read(file).match(/^import .* from '([^']+)';$/gm) || []) expect(imp, file).toMatch(/from '(node:|\.\/|\.\.\/qa\/lib\/|\.\/lib\/)/);
    }
  });
});

test.describe('three jobs, three trust levels', () => {
  test('main releases, dev only when the agent changed, manual full or delta — revocable, read-only token, no concurrency group', () => {
    expect(wf()).toMatch(/push:\s*\n\s*branches: \[main, dev\]/);
    expect(wf()).toMatch(/workflow_dispatch:/);
    const perms = wf().slice(wf().indexOf('\npermissions:'), wf().indexOf('\njobs:'));
    expect(perms).not.toMatch(/write/);
    expect(wf()).not.toMatch(/^\s*concurrency:/m);
    expect(wf()).not.toMatch(/pull_request_target/);
    expect(job('scope')).toContain("if: vars.UX_REVIEW_ENABLED != 'false'");
    expect(job('scope')).toContain('scripts/ux/|docs/ux/ux-brief\\.md$|tests/capture-screens\\.spec\\.ts$|\\.github/workflows/ux-review\\.yml$');
    // Scope cannot open reports, so it never picks full, delta or self-test for an automatic run: review.mjs does.
    expect(job('scope')).toContain('echo "mode=auto"');
    expect(job('scope')).not.toMatch(/mode=delta"|mode=self-test|mode=full"/);
    expect(job('review')).toContain('UX_TRIGGER: ${{ needs.scope.outputs.trigger }}');
  });

  test('until a complete full review exists, every automatic run is that full review', async () => {
    const { resolveMode } = await lib('config.mjs');
    const full = (incomplete: boolean) => ({ mode: 'full', incomplete });
    expect(resolveMode('auto', 'release', [])).toBe('full');
    expect(resolveMode('auto', 'agent', [])).toBe('full');
    expect(resolveMode('auto', 'release', [full(true), { mode: 'delta', incomplete: false }])).toBe('full');
    expect(resolveMode('auto', 'release', [full(false)])).toBe('delta');
    expect(resolveMode('auto', 'agent', [full(false)])).toBe('self-test');
    expect(resolveMode('full', 'release', [full(false)])).toBe('full'); // a manual choice stands
    // Ten newer reports later, the baseline is still known: every report carries it forward (finding 27096ea7fdbc).
    const newer = Array.from({ length: 12 }, () => ({ mode: 'self-test', incomplete: false, baseline: { head: 'b'.repeat(40), createdAt: '2026-09-15' } }));
    expect(resolveMode('auto', 'agent', newer)).toBe('self-test');
    expect(resolveMode('auto', 'release', newer.map((r) => ({ ...r, baseline: null })))).toBe('full');
  });

  test('a report names the baseline it builds on — itself when it is a complete full review', async () => {
    const { buildReport } = await lib('report.mjs');
    const review = { ux_health: 'good', summary: '', findings: [], consistency: [], design_decisions: [], new_features: [], strengths: [], priorities: [], previous_findings: [], coverage_notes: '' };
    const range = { base: null, head: 'h'.repeat(40), commits: [] };
    const full = buildReport({ mode: 'full', range, results: [{ review, batch: { area: 'analyse', files: [] } }], synthesis: { review } });
    expect(full.baseline).toMatchObject({ head: 'h'.repeat(40) });
    const carried = { head: 'b'.repeat(40), createdAt: '2026-09-15' };
    expect(buildReport({ mode: 'delta', range: { ...range, base: 'b'.repeat(40) }, results: [{ review, batch: { area: 'release', files: [] } }], baseline: carried }).baseline).toEqual(carried);
    expect(buildReport({ mode: 'full', range, results: [{ review, batch: { area: 'analyse', files: [] } }], synthesis: null, baseline: null }).baseline).toBeNull();
  });

  test('the capture job holds no secret; the review job holds the model and sealing keys and runs no third-party code', () => {
    const capture = job('capture');
    expect(capture).not.toMatch(/secrets\./);
    expect(capture).toContain('npm ci');
    const review = job('review');
    expect(review).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(review).toContain('UX_REVIEW_KEY: ${{ secrets.UX_REVIEW_KEY }}');
    expect(review).not.toMatch(/npm (ci|install)|npx |cache: 'npm'|playwright/);
    expect((wf().match(/secrets\.[A-Z_]+/g) || []).sort()).toEqual(['secrets.OPENROUTER_API_KEY', 'secrets.UX_REVIEW_KEY']);
  });

  test('every action is pinned, checkouts keep no token, secrets and event data arrive only as env', () => {
    for (const uses of wf().match(/uses: [^\s]+/g) || []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
    expect((wf().match(/persist-credentials: false/g) || []).length).toBe(3);
    for (const line of wf().split('\n').filter((l) => /\$\{\{\s*(secrets|github\.event|inputs)\./.test(l))) expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{/);
  });

  test('the review reads the screenshots of its own run by the name the capture job gave them', () => {
    expect(job('capture')).toContain('artifact: ${{ steps.artifact.outputs.name }}');
    expect(job('review')).toContain('CAPTURE: ${{ needs.capture.outputs.artifact }}');
    expect(job('review')).toMatch(/if: \$\{\{ !cancelled\(\) && needs\.scope\.result == 'success'/);
  });

  test('no step can fail on its own loop control', () => {
    // `[ … ] && break` as the last command of a loop body hands a false test to the step as its
    // exit status; the report fetch failed that way on its second run (run 34952723977).
    expect(wf()).not.toMatch(/\]\s*&&\s*(break|continue)\s*$/m);
  });
});

test.describe('spend stays within an estimated budget per mode', () => {
  test('full ≤ $6, a release ≤ $1.50, a self-test ≤ $0.30 — conservative token estimate, screenshots and the whole output allowance counted', async () => {
    const { BUDGETS, estimateCostUsd, withinBudget, PRICE_PER_MTOK, TOKENS_PER_IMAGE, CHARS_PER_TOKEN } = await lib('config.mjs');
    // Numbered source tokenises denser than prose; the admission estimate assumes it does.
    expect(CHARS_PER_TOKEN).toBeLessThanOrEqual(2.5);
    expect(read('scripts/ux/lib/config.mjs')).toMatch(/Estimated budget per review — not a hard ceiling/);
    expect(BUDGETS.full.maxCostUsd).toBeLessThanOrEqual(6);
    expect(BUDGETS.delta.maxCostUsd).toBeLessThanOrEqual(1.5);
    expect(BUDGETS['self-test'].maxCostUsd).toBeLessThanOrEqual(0.3);
    expect(PRICE_PER_MTOK).toEqual({ input: 1.25, output: 4.25 });
    const withImages = estimateCostUsd({ chars: 0, images: 10, maxOutputTokens: 0 });
    expect(withImages).toBeCloseTo((10 * TOKENS_PER_IMAGE * 1.25) / 1e6, 8);
    expect(estimateCostUsd({ chars: 0, images: 0, maxOutputTokens: 40_000 })).toBeCloseTo(0.17, 5);
    expect(withinBudget(BUDGETS.delta, 0, { chars: 200_000, images: 12 })).toBe(true);
    expect(withinBudget(BUDGETS.delta, 1.4, { chars: 200_000, images: 12 })).toBe(false);
    expect(read('scripts/ux/review.mjs')).toMatch(/if \(!withinBudget\(budget, spent, \{ chars: brief\.length \+ text\.length \+ SCHEMA_CHARS, images: c\.picked\.length \}\)\) return null;/);
  });
});

test.describe('nothing it finds leaks', () => {
  test('the report leaves the runner sealed; the log says that it ran, in which mode and at what cost', async () => {
    const src = read('scripts/ux/review.mjs');
    expect(src).toMatch(/writeFileSync\(join\(OUT_DIR, 'ux-review\.enc\.json'\), JSON\.stringify\(seal\(report, secret\)\)\)/);
    expect(src).toMatch(/if \(LOCAL\) \{\s*writeFileSync\(join\(OUT_DIR, `ux-review\.\$\{head\.slice\(0, 12\)\}\.json`\)/);
    expect(src).toMatch(/console\.error\(`UX review failed: \$\{String\(err\?\.message \|\| err\)\.split\('\\n'\)\[0\]\}`\)/);
    const { publicSummary } = await lib('report.mjs');
    const s = publicSummary({ range: { head: 'a'.repeat(40) }, mode: 'delta', meta: { modelCalls: 2, costUsd: 0.4 }, ux_health: 'poor', findings: [{ severity: 'critical' }] });
    expect(s).toEqual({ head: 'a'.repeat(12), mode: 'delta', status: 'completed, sealed', modelCalls: 2, costUsd: 0.4 });
    expect(read('.gitignore')).toMatch(/^\.ux-review\/$/m);
  });

  test('every outgoing text passes the redaction', () => {
    const src = read('scripts/ux/review.mjs');
    expect(src).toMatch(/const brief = clean\(loadBrief\(\)\);/);
    expect(src).toMatch(/const textFor = \(c, extra = \{\}\) => clean\(buildText\(/);
  });
});

test.describe('what a review covers', () => {
  test('a release starts from the last reviewed checkpoint or the previous tip of main — never a guess', async () => {
    const { chooseDeltaBase } = await lib('range.mjs');
    const ancestors = new Set(['cp>head', 'before>head']);
    const base = (over: Record<string, unknown>) => chooseDeltaBase({ head: 'head', override: null, checkpoint: null, before: null, isAncestorOf: (a: string, b: string) => ancestors.has(`${a}>${b}`), exists: () => true, ...over });
    expect(base({ checkpoint: 'cp', before: 'before' }).base).toBe('cp');
    expect(base({ checkpoint: 'head' }).base).toBe('head'); // already reviewed: nothing to do
    expect(base({ checkpoint: 'rewritten', before: 'before' }).base).toBe('before');
    expect(base({ before: 'before' }).base).toBe('before');
    expect(base({ override: 'manual', checkpoint: 'cp' }).base).toBe('manual');
    expect(() => base({ before: '0000000000000000000000000000000000000000' })).toThrow(/No usable base/);
    expect(() => base({ checkpoint: 'rewritten' })).toThrow(/No usable base/);
  });

  test('pages belong to their journey; a component to the one journey that renders it, or to the design system', async () => {
    const { assignAreas, packAreas } = await lib('areas.mjs');
    const files = [
      { path: 'app/(app)/project/[projectId]/analyze/page.tsx', text: "import { Finding } from '@/components/FindingCard';\nimport { StageHeader } from '@/components/StageHeader';" },
      { path: 'app/(app)/dashboard/page.tsx', text: "import { StageHeader } from '../../../components/StageHeader';" },
      { path: 'components/FindingCard.tsx', text: "import { Chip } from './Chip';" },
      { path: 'components/Chip.tsx', text: 'export const Chip = 1;' },
      { path: 'components/StageHeader.tsx', text: 'export const StageHeader = 1;' },
      { path: 'components/Orphan.tsx', text: 'export const Orphan = 1;' },
      { path: 'app/globals.css', text: '@theme {}' },
    ];
    const a = assignAreas(files);
    expect(Object.fromEntries(a)).toEqual({
      'app/(app)/project/[projectId]/analyze/page.tsx': 'analyse',
      'app/(app)/dashboard/page.tsx': 'rahmen',
      'components/FindingCard.tsx': 'analyse',
      'components/Chip.tsx': 'analyse',
      'components/StageHeader.tsx': 'system',
      'components/Orphan.tsx': 'system',
      'app/globals.css': 'system',
    });
    // Never a cut file: a file larger than the limit is a batch of its own.
    const big = [{ path: 'app/page.tsx', text: 'x\n'.repeat(50_000) }, { path: 'app/layout.tsx', text: 'y' }];
    const batches = packAreas(big, assignAreas(big), 10_000);
    expect(batches.flatMap((b: { files: string[] }) => b.files).sort()).toEqual(['app/layout.tsx', 'app/page.tsx']);
    expect(batches.every((b: { blocks: string[]; files: string[] }) => b.blocks.length === b.files.length)).toBe(true);
  });

  test('screenshots: only expected names, real JPEGs, no links, bounded size — every screen before a second picture of any', async () => {
    const { loadShots, pickShots } = await lib('shots.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-shots-'));
    try {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
      for (const name of ['02-dashboard-desktop-s1', '02-dashboard-desktop-s2', '02-dashboard-phone-s1', '03-analyze-desktop-s1', '03-analyze-dark-s1', '00-access-desktop', 'm3-mockup-desktop']) fs.writeFileSync(path.join(dir, `${name}.jpg`), jpeg);
      fs.writeFileSync(path.join(dir, '04-design-desktop-s1.jpg'), Buffer.from('<svg onload=alert(1)>'));
      fs.writeFileSync(path.join(dir, 'evil.jpg'), jpeg);
      fs.writeFileSync(path.join(dir, '05-x-desktop-s1.png'), jpeg);
      fs.writeFileSync(path.join(dir, 'index.txt'), 'notes');
      const shots = loadShots(dir);
      expect(shots.map((s: { name: string }) => s.name)).toEqual(['00-access-desktop', '02-dashboard-desktop-s1', '02-dashboard-desktop-s2', '02-dashboard-phone-s1', '03-analyze-dark-s1', '03-analyze-desktop-s1', 'm3-mockup-desktop']);
      const picked = pickShots(shots, ['02-dashboard', '03-analyze'], { limit: 3, maxBytes: 10_000 });
      expect(picked.map((s: { name: string }) => s.name)).toEqual(['02-dashboard-desktop-s1', '03-analyze-desktop-s1', '02-dashboard-phone-s1']);
      expect(pickShots(shots, ['02-dashboard', '03-analyze'], { limit: 10, maxBytes: 250 }).length).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the capture writes the names the agent expects, for every screen an area asks for', async () => {
    const { AREAS, SHOT_NAME, REFERENCE_SCREENS } = await lib('config.mjs');
    const spec = read('tests/capture-screens.spec.ts');
    const captured = new Set([...spec.matchAll(/name: '(\d{2}-[a-z0-9-]+)'/g)].map((m) => m[1]).concat('00-access'));
    for (const screen of [...AREAS.flatMap((a: { screens: string[] }) => a.screens), ...REFERENCE_SCREENS]) expect(captured, screen).toContain(screen);
    for (const name of ['00-access-desktop.jpg', '03-analyze-desktop-s1.jpg', '11-settings-phone-s3.jpg', '02-dashboard-dark-s1.jpg', 'm6-mockup-desktop.jpg']) expect(name).toMatch(SHOT_NAME);
    // The mockups: the names the capture writes, through the real loader, reach the real selection (finding b255c3fc77a5).
    const { MOCKUP_SCREENS } = await lib('config.mjs');
    const { loadShots, pickShots } = await lib('shots.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-mockups-'));
    try {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
      const written = [...spec.matchAll(/`m\$\{view\}-mockup-desktop\.jpg`/g)].length;
      expect(written).toBe(1);
      for (let view = 1; view <= 6; view++) fs.writeFileSync(path.join(dir, `m${view}-mockup-desktop.jpg`), jpeg);
      const picked = pickShots(loadShots(dir), MOCKUP_SCREENS, { limit: 16, maxBytes: 1e6 });
      expect(picked.map((p: { name: string }) => p.name)).toEqual([1, 2, 3, 4, 5, 6].map((v) => `m${v}-mockup-desktop`));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(read('scripts/ux/review.mjs')).not.toMatch(/'m1'|'m3'|'m4'/);
    for (const env of ['CAPTURE_OUT', 'CAPTURE_SEGMENTS', 'CAPTURE_DARK', 'CAPTURE_MOCKUPS']) expect(spec).toContain(`process.env.${env}`);
  });

  test('the design scan counts what drifts, and names what a release adds that the product hardly uses', async () => {
    const { designScan, introducedTokens, renderScan } = await lib('scan.mjs');
    const files = [
      { path: 'components/A.tsx', text: '<button className="bg-green-600 text-white rounded-xl px-4 hover:bg-green-700">Speichern und weiter</button>\n<div onClick={go} className="text-[10px] text-gray-500">Click here to continue with the analysis</div>' },
      { path: 'components/B.tsx', text: '<button className="bg-emerald-500 text-white rounded-lg px-4">Go</button>\n<img src="x.png">\n<button className="p-2"><X size={16} /></button>' },
    ];
    const s = designScan(files);
    expect(s.colorFamilies.get('green')).toBe(2);
    expect(s.colorFamilies.get('emerald')).toBe(1);
    expect(s.buttonCount).toBe(3);
    expect(s.buttons.size).toBe(3);
    expect(s.a11y['img-without-alt'].count).toBe(1);
    expect(s.a11y['click-on-non-interactive'].count).toBe(1);
    expect(s.a11y['icon-button-without-label'].count).toBe(1);
    expect(s.a11y['tiny-text'].at).toEqual(['components/A.tsx:2']);
    const introduced = introducedTokens('<p className="text-fuchsia-400 rounded-xl">', s);
    expect(introduced.map((t: { token: string }) => t.token)).toContain('fuchsia-400');
    expect(introduced.map((t: { token: string }) => t.token)).toContain('rounded-xl');
    const text = renderScan(s, { introduced });
    expect(text).toMatch(/Buttons: 3 with a class string, 3 distinct base styles/);
    expect(text.length).toBeLessThan(8_000);
  });
});

test.describe('the report Claude verifies', () => {
  const finding = (over: Record<string, unknown> = {}) => ({
    severity: 'high', category: 'consistency', title: 'Primary buttons use two greens', journey: 'Analyse', location: { file: 'components/A.tsx', line: 1, route: '', screenshot: '' },
    observation: 'o', user_impact: 'u', evidence: 'e', recommendation: 'r', effort: 'S', roadmap_hint: '1.5', confidence: 0.8, ...over,
  });
  const review = (findings: unknown[], over: Record<string, unknown> = {}) => ({ ux_health: 'good', summary: 's', findings, consistency: [], design_decisions: [], new_features: [], strengths: [], priorities: [], previous_findings: [], coverage_notes: '', ...over });
  const range = { base: 'b'.repeat(40), head: 'h'.repeat(40), commits: [] };

  test('fingerprints ignore line numbers, viewports and scroll segments', async () => {
    const { fingerprint } = await lib('report.mjs');
    expect(fingerprint(finding({ location: { file: 'components/A.tsx', line: 99, route: '', screenshot: '' } }))).toBe(fingerprint(finding()));
    const shot = (s: string) => fingerprint(finding({ location: { file: '', line: 0, route: '/dashboard', screenshot: s } }));
    expect(shot('02-dashboard-desktop-s1')).toBe(shot('02-dashboard-phone-s3'));
    expect(shot('02-dashboard-desktop-s1')).not.toBe(shot('03-analyze-desktop-s1'));
  });

  test('a critical finding is never rated good, whatever the model says', async () => {
    const { buildReport } = await lib('report.mjs');
    const r = buildReport({ mode: 'delta', range, results: [{ review: review([finding({ severity: 'critical' })]), batch: { area: 'release', files: ['components/A.tsx'] } }] });
    expect(r.ux_health).toBe('poor');
  });

  test('a release carries open findings and resolves what the reviewer confirms; decided ones are not carried; a full audit starts fresh', async () => {
    const { buildReport, fingerprint } = await lib('report.mjs');
    const old = (title: string) => ({ ...finding({ title }), area: 'analyse', fingerprint: fingerprint({ ...finding({ title }), area: 'analyse' }) });
    const [open, fixed, refuted] = [old('Still open'), old('Fixed now'), old('Refuted before')];
    const previous = { findings: [open, fixed, refuted] };
    const statuses = [{ fingerprint: fixed.fingerprint, status: 'resolved', reason: 'green unified' }];
    const r = buildReport({ mode: 'delta', range, results: [{ review: review([], { previous_findings: statuses }), batch: { area: 'release', files: [] } }], previous, closed: (f: { fingerprint: string }) => f.fingerprint === refuted.fingerprint });
    expect(r.findings.map((f: { fingerprint: string }) => f.fingerprint)).toEqual([open.fingerprint]);
    expect(r.findings[0].carried).toBe(true);
    expect(r.resolved.map((f: { fingerprint: string }) => f.fingerprint)).toEqual([fixed.fingerprint]);
    const full = buildReport({ mode: 'full', range: { ...range, base: null }, results: [{ review: review([]), batch: { area: 'analyse', files: [] } }], synthesis: { review: review([]) }, previous });
    expect(full.findings).toEqual([]);
  });

  test('unread code or a missing synthesis keeps the checkpoint where it was; a self-test is never a checkpoint', async () => {
    const { buildReport } = await lib('report.mjs');
    const one = [{ review: review([]), batch: { area: 'release', files: ['a.tsx'] } }];
    expect(buildReport({ mode: 'delta', range, results: one, notReviewed: [{ path: 'b.tsx', reason: 'cap' }] }).range.checkpoint).toBe(range.base);
    expect(buildReport({ mode: 'delta', range, results: one }).range.checkpoint).toBe(range.head);
    expect(buildReport({ mode: 'full', range: { ...range, base: null }, results: one, synthesis: null }).incomplete).toBe(true);
    expect(buildReport({ mode: 'self-test', range, results: one }).range.checkpoint).toBeNull();
    expect(read('scripts/ux/review.mjs')).toMatch(/r\.mode !== 'self-test'/);
  });
});

test.describe('Claude hears about it', () => {
  test('a push to main points to the UX intake; the session start reports undecided findings; the skill exists', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const out = execFileSync('node', [path.resolve(ROOT, '.claude/hooks/after-push.mjs')], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin HEAD:main' } }), encoding: 'utf8' });
    expect(out).toContain('ux-review-intake');
    expect(out).toContain('scripts/ux/inbox.mjs');
    const skill = read('.claude/skills/ux-review-intake/SKILL.md');
    for (const must of ['scripts/ux/inbox.mjs', 'scripts/ux/register.mjs', 'ROADMAP.md` §13', 'CONFIRMED', 'REFUTED']) expect(skill).toContain(must);
    expect(read('docs/ROADMAP.md')).toMatch(/## 13\. UX-Befunde aus dem UX-Agenten/);
  });
});

test.describe('a release review runs end to end on a real repository (dry run, no model call)', () => {
  test('a removed file reaches the reviewer whole, however long it was', () => {
    const src = read('scripts/ux/review.mjs');
    const block = src.slice(src.indexOf('function deletionBlock'), src.indexOf('\n}', src.indexOf('function deletionBlock')));
    expect(block).not.toMatch(/WHOLE_FILE_CHARS|slice\(/);
  });

  test('a release that only removes a screen is reviewed, and a screen without pictures keeps the review incomplete', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-delta-'));
    const g = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    try {
      g('init', '-q');
      fs.mkdirSync(path.join(dir, 'docs/ux'), { recursive: true });
      fs.copyFileSync(path.resolve(ROOT, 'docs/ux/ux-brief.md'), path.join(dir, 'docs/ux/ux-brief.md'));
      const page = 'app/(app)/project/[projectId]/analyze/page.tsx';
      fs.mkdirSync(path.join(dir, path.dirname(page)), { recursive: true });
      fs.writeFileSync(path.join(dir, page), 'export default function Analyze() { return <h1>Analyze</h1>; }\n');
      fs.writeFileSync(path.join(dir, 'app/(app)/layout.tsx'), 'export default function Layout({ children }) { return children; }\n');
      g('add', '.');
      g('commit', '-q', '-m', 'base');
      const base = g('rev-parse', 'HEAD');
      g('rm', '-q', page);
      g('commit', '-q', '-m', 'remove the analyze screen');
      const out = execFileSync(process.execPath, [path.resolve(ROOT, 'scripts/ux/review.mjs'), '--dry', '--mode=delta'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, UX_BASE_OVERRIDE: base, UX_REVIEW_KEY: '', UX_SHOTS_DIR: path.join(dir, 'no-shots') },
      });
      const plan = JSON.parse(out);
      expect(plan.skipped).toBeNull();
      expect(plan.calls.flatMap((c: { files: string[] }) => c.files)).toEqual([page]);
      // No picture of the screens this release concerns: named, so the checkpoint stays.
      expect(plan.notReviewed.map((n: { path: string }) => n.path)).toContain('(Screenshot 03-analyze)');

      // A picture that exists but does not fit into the call is not evidence either (finding 115d8f705a0d).
      const shots = path.join(dir, 'shots');
      fs.mkdirSync(shots);
      const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2_900_000)]);
      for (const name of ['03-analyze-desktop-s1', '01-landing-desktop-s1', '02-dashboard-desktop-s1']) fs.writeFileSync(path.join(shots, `${name}.jpg`), big);
      const second = JSON.parse(execFileSync(process.execPath, [path.resolve(ROOT, 'scripts/ux/review.mjs'), '--dry', '--mode=delta'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, UX_BASE_OVERRIDE: base, UX_REVIEW_KEY: '', UX_SHOTS_DIR: shots },
      }));
      const sent = second.calls.flatMap((c: { images: string[] }) => c.images);
      const missing = second.notReviewed.map((n: { path: string }) => n.path);
      for (const screen of ['03-analyze', '01-landing', '02-dashboard']) {
        expect(sent.some((n: string) => n.startsWith(screen)) || missing.includes(`(Screenshot ${screen})`), screen).toBe(true);
      }
      expect(missing.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('the register Claude decides in', () => {
  test('a finding marked fixed comes back when a review of a commit containing the fix reports it again; refuted ones leave the roadmap table', async () => {
    const { untriaged, roadmapRows } = await lib('register.mjs');
    const register = { entries: [
      { id: 'UX-001', fingerprint: 'fixed1', status: 'behoben', fixedIn: 'fix', severity: 'high', title: 'A' },
      { id: 'UX-002', fingerprint: 'plan1', status: 'eingeplant', step: '1.5', severity: 'medium', title: 'B | C' },
      { id: 'UX-003', fingerprint: 'ref1', status: 'widerlegt', severity: 'critical', title: 'D' },
    ] };
    const isAncestorOf = (a: string, b: string) => `${a}>${b}` === 'fix>after';
    const findings = [{ fingerprint: 'fixed1' }, { fingerprint: 'plan1' }, { fingerprint: 'ref1' }, { fingerprint: 'new1' }];
    expect(untriaged(findings, register, { head: 'after', isAncestorOf })).toEqual([{ fingerprint: 'fixed1', reopened: true }, { fingerprint: 'new1' }]);
    expect(untriaged(findings, register, { head: 'before', isAncestorOf })).toEqual([{ fingerprint: 'new1' }]);
    expect(roadmapRows(register)).toEqual(['| UX-001 | high | A | — | behoben |', '| UX-002 | medium | B / C | 1.5 | eingeplant |']);
  });

  test('a decision closes what it was made about, not a regression raised after it — even across an unrelated release', async () => {
    const { closedBy } = await lib('register.mjs');
    const closed = closedBy({ entries: [{ fingerprint: 'fp', status: 'behoben', updatedAt: '2026-09-20T10:00:00Z' }, { fingerprint: 'planned', status: 'eingeplant', updatedAt: '2026-09-20T10:00:00Z' }] });
    expect(closed({ fingerprint: 'fp', raisedAt: '2026-09-19T08:00:00Z' })).toBe(true); // the occurrence the fix was about
    expect(closed({ fingerprint: 'fp', raisedAt: '2026-09-22T08:00:00Z' })).toBe(false); // raised again after the fix
    expect(closed({ fingerprint: 'planned', raisedAt: '2026-09-19T08:00:00Z' })).toBe(false); // accepted is still open
    const src = read('scripts/ux/review.mjs');
    expect(src).toMatch(/filter\(\(f\) => !closed\(f\)\)/);
  });

  test('the session start finds the newest real review behind any number of skipped runs and self-tests', async () => {
    const { reviewRuns, newestRealReview } = await lib('history.mjs');
    const sha = (n: number) => String(n).padStart(40, 'a');
    // Skipped runs produce no review artifact at all; 30 self-tests and other artifacts sit in front of the real review.
    const artifacts = [
      ...Array.from({ length: 30 }, (_, i) => ({ name: `ux-review-${sha(i)}-1`, runId: 1000 - i, headSha: sha(i) })),
      { name: `ux-capture-${sha(99)}-1`, runId: 900, headSha: sha(99) },
      { name: `qa-review-${sha(98)}-1`, runId: 899, headSha: sha(98) },
      { name: `ux-review-${sha(50)}-2`, runId: 800, headSha: sha(50) },
      { name: `ux-review-${sha(50)}-1`, runId: 800, headSha: sha(50) },
    ];
    const runs = reviewRuns(artifacts);
    expect(runs.map((r: { databaseId: number }) => r.databaseId).slice(-1)).toEqual([800]);
    expect(runs.filter((r: { databaseId: number }) => r.databaseId === 800)).toHaveLength(1);
    const open = (run: { databaseId: number }) => ({ report: { mode: run.databaseId === 800 ? 'delta' : 'self-test' } });
    expect(newestRealReview(runs, open)?.run.databaseId).toBe(800);
    expect(newestRealReview(runs.slice(0, 30), open)).toBeNull();
    expect(read('scripts/ux/inbox.mjs')).toMatch(/newestRealReview\(reviewRuns\(artifacts\)/);
  });

  test('an existing entry can be updated from a fresh clone without an inbox', () => {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-register-'));
    try {
      fs.mkdirSync(path.join(dir, 'docs/ux'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs/ux/register.json'), JSON.stringify({ version: 1, entries: [{ id: 'UX-001', fingerprint: 'abcdefabcdef', title: 't', severity: 'high', status: 'eingeplant', step: '1.5' }] }));
      const out = execFileSync(process.execPath, [path.resolve(ROOT, 'scripts/ux/register.mjs'), 'fixed', 'abcdefabcdef', 'abc1234'], { cwd: dir, encoding: 'utf8' });
      expect(out).toContain('UX-001 [abcdefabcdef] → behoben');
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'docs/ux/register.json'), 'utf8')).entries[0]).toMatchObject({ status: 'behoben', fixedIn: 'abc1234' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
