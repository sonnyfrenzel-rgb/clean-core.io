import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hydrateProject, readerAnswerOf, readerRunFor, READER_RUN_UNREAD_ERROR, RUN_MOVED_ERROR } from '../lib/project-loader';
import type { Project } from '../lib/types';

/**
 * Codex architecture-01 — an invited reader's project and run are one revision.
 *
 * The reader reads the project document from Firestore and its active run from
 * `GET /api/projects/{id}`, in two reads. The owner can activate another run in
 * between; the route then answers with that run. Before this check the loader
 * took the answer's `run` and dropped its `activeRunId`, so the workspace showed
 * the source and `activeRunId` of run A with the findings of run B.
 *
 * No browser and no emulator: the decision is the pure `readerRunFor`, and the
 * last test holds the loader to calling it on the reader path.
 */

const project = (activeRunId: string): Project =>
  ({ name: 'P', userId: 'owner', legacyCode: 'REPORT a.', activeRunId }) as unknown as Project;

test.describe('the run an invited reader is shown', () => {
  test('a run the server chose after the project moved is not spread over the older document', () => {
    const answer = { activeRunId: 'run-B', run: { runId: 'run-B', analysis: 'findings of B' } };
    const read = readerRunFor('run-A', answer);
    expect(read.kind).toBe('moved');
  });

  test('a run whose own id disagrees with the answer is not accepted either', () => {
    const read = readerRunFor('run-A', { activeRunId: 'run-A', run: { runId: 'run-B' } });
    expect(read.kind).toBe('moved');
  });

  test('the run the document names is hydrated as before', () => {
    const read = readerRunFor('run-A', { activeRunId: 'run-A', run: { runId: 'run-A', analysis: 'findings of A' } });
    expect(read.kind).toBe('found');
    if (read.kind !== 'found') return;
    const hydrated = hydrateProject('p1', project('run-A'), read) as unknown as Record<string, unknown>;
    expect(hydrated.activeRunId).toBe('run-A');
    expect(hydrated.runId).toBe('run-A');
    expect(hydrated.analysis).toBe('findings of A');
  });

  test('a run stored without its own id still loads when the answer names the same run', () => {
    expect(readerRunFor('run-A', { activeRunId: 'run-A', run: { analysis: 'old form' } }).kind).toBe('found');
  });

  test('no answer, or an answer without a run, stays "missing" as it was', () => {
    expect(readerRunFor('run-A', null).kind).toBe('missing');
    expect(readerRunFor('run-A', { activeRunId: 'run-A', run: null }).kind).toBe('missing');
  });

  test('a run that moved twice is flagged, never shown, and says so', () => {
    const hydrated = hydrateProject('p1', project('run-A'), { kind: 'failed', error: RUN_MOVED_ERROR });
    expect(hydrated._runLoadFailed).toBe(true);
    expect(hydrated._runLoadError).toBe(RUN_MOVED_ERROR);
  });

  test('the loader decides the reader path with readerRunFor and re-reads the project when it moved', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'project-loader.ts'), 'utf8');
    expect(src).toMatch(/readerRunFor\(data\.activeRunId, await readerAnswer\(projectId\)\)/);
    expect(src).not.toMatch(/json\?\.run \?\? null/);
    expect(src).toMatch(/kind === 'moved'[\s\S]{0,80}continue/);
  });

  // QA review of 695850c7f838: a refused or unreadable answer said the run did
  // not exist. It is a read that failed, and the loader's catch says so.
  test('a refused or unreadable answer is a failed read, not a missing run', () => {
    for (const [ok, body] of [[false, { activeRunId: 'run-A', run: {} }], [true, undefined], [true, null], [true, 'x']] as const) {
      expect(() => readerAnswerOf(ok, body), JSON.stringify([ok, body])).toThrow(READER_RUN_UNREAD_ERROR);
    }
    const answer = readerAnswerOf(true, { activeRunId: 'run-A', run: { runId: 'run-A' } });
    expect(readerRunFor('run-A', answer).kind).toBe('found');
    expect(readerRunFor('run-A', readerAnswerOf(true, { activeRunId: 'run-A', run: null })).kind).toBe('missing');
  });
});
