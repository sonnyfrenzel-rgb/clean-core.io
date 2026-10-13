import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Project } from '../lib/types';
import { testRunSubject } from '../lib/test-receipt';
import { nextTestRunFailure, type TestingClosure } from '../lib/testing-closure';
import { testingClosureBasis } from '../lib/workflow-steps';
import { validateProjectCommand } from '../lib/project-commands';
import { lastRun, type LastRun } from '../components/testing/testing-summary';

/**
 * ADR-094, as the reader sees it: the Testing tool's closure card, the run
 * tile and the pipeline after a run that gave no result — rendered from the
 * components themselves (esbuild, `renderToStaticMarkup`), server-free.
 */

const ROOT = path.resolve(__dirname, '..');
// One directory per worker: two workers bundling into the same file read each other's half-written output.
const OUT = path.resolve(ROOT, 'tmp', 'testing-closure-rendered', String(process.pid));

type Card = (props: { projectId: string; project: Project; isOwner: boolean; onChanged: (f: Partial<Project>) => void }) => React.ReactElement;
type Header = (props: Record<string, unknown>) => React.ReactElement;
type Pipeline = (props: { written: number; run: LastRun }) => React.ReactElement;
let ClosureCard: Card;
let TestingHeader: Header;
let TestPipeline: Pipeline;

async function load<T>(rel: string, name: string): Promise<T> {
  await build({
    entryPoints: [path.resolve(ROOT, rel)],
    outfile: path.join(OUT, `${name}.cjs`),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(path.join(OUT, `${name}.cjs`)).default as T;
}

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  ClosureCard = await load<Card>('components/testing/TestingClosureCard.tsx', 'TestingClosureCard');
  TestingHeader = await load<Header>('components/testing/TestingHeader.tsx', 'TestingHeader');
  TestPipeline = await load<Pipeline>('components/testing/TestPipeline.tsx', 'TestPipeline');
});

const PACKAGE = JSON.stringify([{ path: 'srv/service.ts', content: 'export class AgingEngine {}' }]);
const CASES = Array.from({ length: 10 }, (_, i) => ({ id: `TC_${i + 1}`, name: `Case ${i + 1}` }));
const BUILD_ERROR = 'Compilation failed:\nBuild failed with 1 error:\n<sandbox>/test.ts:162:27: ERROR: Expected ")" but found "\'=SUM(A1:B2)\'"';

function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'FI case',
    userId: 'owner-uid',
    legacyCode: 'REPORT z.',
    activeRunId: 'run-1',
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    solutionDesign: 'd',
    approvedByArchitect: true,
    generatedCode: PACKAGE,
    documentation: 'docs',
    testSuite: { code: "import { AgingEngine } from './srv/service';" },
    testCases: CASES,
    ...extra,
  } as unknown as Project;
}

function failed(p = project(), attempts = 3): Project {
  let stored: unknown = null;
  for (let i = 0; i < attempts; i++) {
    stored = nextTestRunFailure(stored, { subject: testRunSubject(p), at: '2026-10-11T14:35:02.000Z', by: 'owner-uid', kind: 'build-error', cause: BUILD_ERROR });
  }
  return { ...p, testRunFailure: stored } as Project;
}

function closed(p: Project): Project {
  const basis = testingClosureBasis(p);
  if (!basis.ok) throw new Error(basis.error);
  const r = validateProjectCommand(
    { command: 'close-testing', reason: 'runner-failed', note: 'Repairs did not compile', expectedSubject: basis.subjectKey },
    { activeRunId: 'run-1', testingClosureBasis: basis, testSubject: testRunSubject(p) },
    { email: 'owner@example.com', now: '2026-10-11T15:00:00.000Z' },
  );
  if (!r.ok) throw new Error(r.error);
  return { ...p, ...(r.fields as Partial<Project>) } as Project;
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const card = (p: Project, isOwner = true) =>
  renderToStaticMarkup(React.createElement(ClosureCard, { projectId: 'p1', project: p, isOwner, onChanged: () => {} }));

test('after a failed run the owner is offered the closure, with the recorded cause and the reasons that fit', () => {
  const html = card(failed());
  const t = text(html);
  expect(html).toContain('data-testing-closure="open"');
  expect(t).toContain('Close testing without a passing run');
  expect(html).toContain('data-testing-closure-basis="run-error"');
  expect(t).toContain('What is on record: The last run on 11 Oct 2026 gave no result (3 attempts in a row)');
  expect(t).toContain('test.ts:162:27: ERROR');
  expect(t).toContain('The runner failed here');
  expect(t).toContain('Tested in our own system');
  expect(t).toContain('Not testable here');
  expect(t).not.toContain('The failures are known and accepted');
  expect(t).toContain('never passed');
  // Nothing chosen yet: the one action waits for a reason.
  const button = html.match(/<button[^>]*data-testing-close=""[^>]*>/)?.[0] ?? '';
  expect(button).toMatch(/disabled/);
  expect(t).toContain('Close testing — not verified');
  expect(t).not.toMatch(/\bproven\b/i);
});

test('closed: the card says who closed it, when and why, "not verified", and the owner can reopen it', () => {
  const html = card(closed(failed()));
  const t = text(html);
  expect(html).toContain('data-testing-closure="closed"');
  expect(t).toContain('Closed · not verified');
  expect(t).toContain('Closed without a passing run by owner@example.com on 11 Oct 2026: the runner failed here — the last run on 11 Oct 2026 gave no result');
  expect(t).toContain('“Repairs did not compile”');
  expect(t).toContain('Nothing here verified the code');
  expect(html).toContain('data-provenance="confirmed"');
  expect(html).not.toContain('data-provenance="proven"');
  expect(t).toContain('Reopen testing');
  // An invited reader sees the same statement and no button.
  const reader = text(card(closed(failed()), false));
  expect(reader).toContain('Closed · not verified');
  expect(reader).not.toContain('Reopen testing');
  // …attributed to the account that made it: "you" is the owner alone, a
  // shared reader is never told the statement is theirs (QA 035a6c65b96f).
  expect(t).toContain('closed by you · not verified');
  expect(reader).toContain('closed by owner@example.com · not verified');
  expect(reader).not.toContain('closed by you');
});

test('nothing failed: no closure is offered; a reader is told the owner can close it', () => {
  expect(card(project())).toBe('');
  const reader = text(card(failed(), false));
  expect(reader).toContain('The project owner can close testing without a passing run');
  expect(reader).not.toContain('Close testing — not verified');
});

test('the run tile and the pipeline say "Failed" with its cause, never "No run on record"', () => {
  const p = failed();
  const run = lastRun(p, null);
  expect(run.kind).toBe('failed');
  const header = renderToStaticMarkup(
    React.createElement(TestingHeader, {
      scenarios: { count: 10, rejected: false, emptyReason: '' },
      run,
      blocked: false,
      isAbapCloud: false,
      handChecks: { count: null, lines: [] },
      tenantLocked: true,
      status: [],
    }),
  );
  expect(header).toContain('data-testing-status="failed"');
  const ht = text(header);
  expect(ht).toContain('Failed');
  expect(ht).toContain('no result (3 attempts in a row)');
  expect(ht).toContain('did not compile in the runner: test.ts:162:27');
  expect(ht).not.toContain('No run on record yet');
  const pipeline = text(renderToStaticMarkup(React.createElement(TestPipeline, { written: 10, run })));
  expect(pipeline).toContain('failed — no result');
});

test('the closure the card shows is the one the command wrote', () => {
  const c = closed(failed());
  const stored = (c as { testingClosure: TestingClosure }).testingClosure;
  expect(stored.basis.kind).toBe('run-error');
  expect(text(card(c))).toContain(stored.basis.line);
});
