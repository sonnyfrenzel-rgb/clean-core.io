/**
 * Library and client findings of the QA slice reviews of 30.09.2026, each
 * confirmed against the current code and fixed.
 *
 * - d63333ca74b2: a 2xx store answer without its fields was a definite "not
 *   stored"; it is the lost-answer case.
 * - 95912ce88e0d: a 5xx to a repair adoption was read as a refusal.
 * - 9cef42e971ec: an option too large to add up dropped out of the comparison,
 *   and a winner was named among the rest.
 * - d97847196408: an unreadable run list was reported as "the signed run
 *   records no score".
 * - 528688d033bd: an announced project name outlived the account it was read
 *   for.
 * - 19ffd321c29a: the initial proposal read could overwrite a newer request.
 * - 978275f2d42d: a character whose lowercase is longer shifted glossary
 *   offsets.
 * - 8cb6c1c5c361: a date-time without an offset was read in the machine's zone.
 * - 9b562d2e4e97: `PACKAGE.JSON` satisfied the package.json requirement.
 *
 * Serverless: pure functions, a stubbed fetch, and source checks for hooks.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../firebase-config.json';
import { storeGeneration } from '../lib/generation-contract-client';
import { CommandAnswerLostError } from '../lib/project-command-client';
import { costComparison, emptyCostAssumptions, COMPARISON_KIND, type CostAssumptions, type CostOption } from '../lib/cost-assumptions';
import { managementAnswers } from '../lib/management-answers';
import { findGlossaryMentions } from '../lib/glossary-lookup';
import { REQUIRED_ARTEFACTS, satisfies, missingArtefacts } from '../lib/transformation-artefacts';
import type { Project } from '../lib/types';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

test('d63333ca74b2 — a success without its fields is a lost answer, not a refusal', async () => {
  // The default app, by name: a spec that ran earlier in this worker may have
  // left a named app behind (qa-e7372791 does), and then `getApps()` is not
  // empty while `getAuth()` inside the client still throws for want of
  // '[DEFAULT]' — which the client reports as a lost answer, so the refusal
  // below read as one too (CI of b879ad8b).
  if (!getApps().some((a) => a.name === '[DEFAULT]')) initializeApp(firebaseConfig);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('not json', { status: 200 })) as typeof fetch;
  try {
    await expect(
      storeGeneration('p1', {
        generatedCode: '[]',
        testSuite: { config: '', spec: '' },
        expectedContractFingerprint: 'f',
        generationToken: 't',
      }),
    ).rejects.toBeInstanceOf(CommandAnswerLostError);
    // A refusal with a body is still a refusal.
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'moved' }), { status: 409 })) as typeof fetch;
    await expect(
      storeGeneration('p1', { generatedCode: '[]', testSuite: { config: '', spec: '' }, expectedContractFingerprint: 'f', generationToken: 't' }),
    ).resolves.toEqual({ ok: false, error: 'moved' });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('95912ce88e0d — a 5xx to an adoption takes the lost-answer path', () => {
  const src = read('hooks/useTestExecution.ts');
  expect(src).toMatch(/if \(answer\.status >= 500\) throw/);
  const adoptionBlock = src.slice(src.indexOf("action: 'adopt'"), src.indexOf("adopted.data?.code === 'already-adopted'"));
  expect(adoptionBlock).not.toMatch(/adopted = await repairDraftCall\(/);
  expect(adoptionBlock.match(/adopted = await adopt\(\)/g)?.length).toBe(2);
});

test('9cef42e971ec — an option that cannot be added up leaves no winner', () => {
  const option = (over: Partial<CostOption> & Pick<CostOption, 'id' | 'kind'>): CostOption => ({
    label: over.id,
    oneOff: { low: { devDays: 1, testDays: 1 }, high: { devDays: 2, testDays: 2 } },
    perRelease: { devDays: 0, testDays: 0 },
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
    ...over,
  });
  const a: CostAssumptions = {
    ...emptyCostAssumptions(),
    currency: 'EUR',
    devDayRate: 800,
    testDayRate: 600,
    horizonYears: 5,
    releaseCadence: { perYear: 2, confirmed: true },
    options: [
      option({
        id: 'do-nothing',
        kind: COMPARISON_KIND,
        oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } },
        perRelease: { devDays: 5, testDays: 5 },
        maintenanceBaselinePerYear: { devDays: 5, testDays: 5 },
        upgradeDelay: { state: 'stated', value: { releasesDeferred: 2 } },
      }),
      option({ id: 'standard', kind: 'standard' }),
      option({ id: 'huge', kind: 'standard', perRelease: { devDays: 1e308, testDays: 1e308 } }),
    ],
  };
  const c = costComparison(a);
  expect(c.costs.find((x) => x.optionId === 'huge')?.total).toBeNull();
  expect(c.winner).toBeNull();
  expect(c.refusal?.code).toBe('option-incomplete');
  expect(c.refusal?.sentence).toContain('huge could not be priced');
});

test('d97847196408 — an unreadable run list is not a run without a score', () => {
  const project = { id: 'p1', activeRunId: 'r1' } as unknown as Project;
  const view = managementAnswers(project, null);
  const figure = view.answers.flatMap((a) => a.figures).find((f) => f.key === 'clean-core-score');
  expect(figure?.absentReason).toBe('the runs of this project could not be read');
  const score = view.answers.find((a) => a.figures.some((f) => f.key === 'clean-core-score'));
  expect(score?.headline).not.toContain('records none');
  // A readable list without the active run says so too.
  const missing = managementAnswers(project, []).answers.flatMap((a) => a.figures).find((f) => f.key === 'clean-core-score');
  expect(missing?.absentReason).toBe('the active run could not be read');
});

test('528688d033bd — an announced project name is forgotten when the account changes', () => {
  const shell = read('lib/shell-context.ts');
  expect(shell).toMatch(/export function forgetShellProject\(\): void \{[\s\S]{0,120}announcedProject = null;/);
  const layout = read('app/(app)/layout.tsx');
  expect(layout).toMatch(/onAuthStateChanged\(getAuth\(\), \(user\) => \{[\s\S]{0,160}forgetShellProject\(\)/);
});

test('19ffd321c29a — the initial proposal read does not overwrite a newer answer', () => {
  const src = read('hooks/useStatementProposal.ts');
  const effect = src.slice(src.indexOf('useEffect('), src.indexOf('const availabilityKnown'));
  expect(effect).not.toMatch(/setHeld\(\{ key, view/);
  expect(effect).toMatch(/setHeld\(\(prev\) => \(prev\.key === key \? prev :/);
});

test('978275f2d42d — glossary offsets survive a character whose lowercase is longer', () => {
  const text = 'İ BAdI';
  const mentions = findGlossaryMentions(text);
  expect(mentions.length).toBeGreaterThan(0);
  for (const m of mentions) {
    expect(text.slice(m.start, m.end).toLowerCase()).toBe(m.item.shortName.toLowerCase());
  }
});

test('8cb6c1c5c361 — a date-time without an offset is the same day in every time zone', () => {
  const script =
    "require('tsx/cjs'); const { formatIsoDate } = require('./lib/format.ts'); process.stdout.write(String(formatIsoDate('2026-09-15T00:30:00')));";
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'UTC']) {
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, TZ: tz }, cwd: process.cwd() });
    expect(r.stderr).toBe('');
    expect(r.stdout, tz).toBe('2026-09-15');
  }
});

test('9b562d2e4e97 — a named artefact is matched as written', () => {
  const manifest = REQUIRED_ARTEFACTS.btp.find((r) => r.label.includes('package.json'))!;
  const docker = REQUIRED_ARTEFACTS.btp.find((r) => r.label.includes('Dockerfile'))!;
  expect(satisfies(manifest, 'srv/package.json')).toBe(true);
  expect(satisfies(manifest, 'PACKAGE.JSON')).toBe(false);
  expect(satisfies(docker, 'Dockerfile')).toBe(true);
  expect(satisfies(docker, 'DOCKERFILE')).toBe(false);
  const files = ['srv/service.ts', 'db/schema.cds', 'PACKAGE.JSON', 'Dockerfile', 'src/zcl_x.clas.abap'].map((path) => ({ path, content: 'x' }));
  expect(missingArtefacts(files, false)).toEqual([manifest.label]);
});
