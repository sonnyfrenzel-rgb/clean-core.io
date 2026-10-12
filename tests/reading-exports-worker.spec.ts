import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource, buildReadingExports, READING_WRAP } from '../lib/bpmn/export';
import { processSummaryOf } from '../lib/process-summary';
import { handleReadingRequest, runReadingJob, type ReadingJob, type ReadingRequest, type ReadingResponse } from '../lib/bpmn/reading-exports-job';
import { createReadingRunner, type ReadingWorkerLike } from '../lib/bpmn/reading-exports-client';
import { readingExportsKey } from '../lib/bpmn/reading-key';

/**
 * The reading worker (owner, 12.10.2026: the CO project froze the
 * Documentation tool — `buildReadingExports` took 11–13 s on the page's
 * thread). Server-free: the handler is a plain function, and the client is
 * driven with a fake worker that answers through the same handler and through
 * `structuredClone`, the copy a real `postMessage` makes.
 */

const ROOT = path.resolve(__dirname, '..');
const example = (file: string) => fs.readFileSync(path.join(ROOT, 'public/starter-examples', file), 'utf8');
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

test.describe('the worker message handler', () => {
  for (const file of ['Z_MM_PO_APPROVAL.abap', 'Z_SALES_ORDER_CREATOR.txt']) {
    test(`${file}: the reading across the worker boundary is byte-identical`, () => {
      const source = example(file);
      const options = { processName: file, sourceFileName: file };
      const response = handleReadingRequest({ id: 7, job: { kind: 'reading', source, options } });
      expect(response.id).toBe(7);
      expect('error' in response).toBe(false);
      const across = structuredClone((response as { result: ReturnType<typeof buildReadingExports> }).result);
      const here = buildReadingExports(source, options);
      expect(sha(across.bpmn.xml)).toBe(sha(here.bpmn.xml));
      expect(sha(across.technical.xml)).toBe(sha(here.technical.xml));
      expect(JSON.stringify(across)).toBe(JSON.stringify(here));
      // The Documentation download takes the plain reading: the file it wrote before.
      const download = buildBpmnExportFromSource(source, { ...options, names: 'plain', wrap: READING_WRAP });
      expect(sha(across.bpmn.xml)).toBe(sha(download.xml));
    });

    test(`${file}: the summary across the worker boundary is the summary`, () => {
      const source = example(file);
      const response = handleReadingRequest({ id: 3, job: { kind: 'summary', source, fileName: file } });
      expect(response).toEqual({ id: 3, result: processSummaryOf(source, file) });
      expect(structuredClone((response as { result: unknown }).result)).toEqual(processSummaryOf(source, file));
    });
  }

  test('an empty source summarises to null, as on the page thread', () => {
    expect(handleReadingRequest({ id: 1, job: { kind: 'summary', source: '  ', fileName: 'x' } })).toEqual({ id: 1, result: null });
  });

  test('an error becomes an answer, never a throw', () => {
    const bad = handleReadingRequest({ id: 9, job: { kind: 'nonsense' } as unknown as ReadingJob });
    expect(bad).toEqual({ id: 9, error: 'Unknown reading job: nonsense' });
    const broken = handleReadingRequest({ id: 4, job: { kind: 'reading', source: null, options: {} } as unknown as ReadingJob });
    expect(broken.id).toBe(4);
    expect('error' in broken).toBe(true);
  });

  test('the worker file only wires the handler', () => {
    const worker = fs.readFileSync(path.join(ROOT, 'lib/bpmn/reading-exports.worker.ts'), 'utf8');
    expect(worker).toContain('scope.postMessage(handleReadingRequest(event.data))');
    expect(fs.readFileSync(path.join(ROOT, 'lib/bpmn/export.ts'), 'utf8')).toContain('const key = readingExportsKey(source, options);');
  });
});

/* ------------------------------------------------------- the main side */

type Fake = ReadingWorkerLike & { posted: ReadingRequest[]; terminated: number; answer(): void; fail(): void };

/** A worker that answers one posted request when told to, through the real handler. */
function fakeWorker(handle: (r: ReadingRequest) => ReadingResponse = handleReadingRequest): Fake {
  const fake: Fake = {
    posted: [],
    terminated: 0,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      fake.posted.push(structuredClone(message));
    },
    terminate() {
      fake.terminated += 1;
    },
    answer() {
      const next = fake.posted.shift();
      if (next) fake.onmessage?.({ data: structuredClone(handle(next)) });
    },
    fail() {
      fake.onerror?.(new Event('error'));
    },
  };
  return fake;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const SMALL = 'REPORT z.\nSTART-OF-SELECTION.\n  IF sy-subrc = 0.\n    WRITE / 1.\n  ELSE.\n    WRITE / 2.\n  ENDIF.\n';
const opts = (name = 'P') => ({ processName: name, sourceFileName: 'z.abap' });

test.describe('the main side: one worker, one computation per reading', () => {
  test('two requests for one reading post one job and get the same object', async () => {
    const worker = fakeWorker();
    const inline: ReadingJob[] = [];
    const runner = createReadingRunner({ startWorker: async () => worker, runInline: async (j) => (inline.push(j), runReadingJob(j)) });
    const a = runner.reading(SMALL, opts());
    const b = runner.reading(SMALL, opts());
    expect(a).toBe(b);
    await tick();
    expect(worker.posted).toHaveLength(1);
    worker.answer();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(ra.bpmn.xml).toBe(buildReadingExports(SMALL, opts()).bpmn.xml);
    // Asked again later: still that object, no second job.
    expect(await runner.reading(SMALL, opts())).toBe(ra);
    expect(worker.posted).toHaveLength(0);
    expect(inline).toHaveLength(0);
    runner.dispose();
  });

  test('the key is the exporter cache key', () => {
    expect(readingExportsKey(SMALL, opts())).toBe(JSON.stringify(['P', 'z.abap', null, SMALL]));
  });

  test('one job at a time, the map before the summary', async () => {
    const worker = fakeWorker();
    const runner = createReadingRunner({ startWorker: async () => worker, runInline: async () => { throw new Error('not here'); } });
    const first = runner.summary(SMALL, 'a.abap');
    await tick();
    const summary = runner.summary(SMALL, 'b.abap');
    const map = runner.reading(SMALL, opts());
    await tick();
    expect(worker.posted.map((r) => r.job.kind)).toEqual(['summary']);
    worker.answer();
    await first;
    await tick();
    expect(worker.posted.map((r) => r.job.kind)).toEqual(['reading']);
    worker.answer();
    await map;
    await tick();
    expect(worker.posted.map((r) => r.job.kind)).toEqual(['summary']);
    worker.answer();
    expect(await summary).toEqual(processSummaryOf(SMALL, 'b.abap'));
    runner.dispose();
  });

  test('no worker (Node, an old browser, a blocked one): the job runs here, as it always did', async () => {
    const runner = createReadingRunner({ startWorker: async () => null, runInline: async (j) => runReadingJob(j) });
    const r = await runner.reading(SMALL, opts());
    expect(r.bpmn.xml).toBe(buildReadingExports(SMALL, opts()).bpmn.xml);
    expect(await runner.summary(SMALL, 'z.abap')).toEqual(processSummaryOf(SMALL, 'z.abap'));
    const throwing = createReadingRunner({ startWorker: async () => { throw new Error('SecurityError'); }, runInline: async (j) => runReadingJob(j) });
    expect((await throwing.reading(SMALL, opts())).bpmn.xml).toBe(r.bpmn.xml);
  });

  test('a worker that fails as a worker: the job in flight and the rest run here, and it is not started again', async () => {
    const worker = fakeWorker();
    let starts = 0;
    const inline: string[] = [];
    const runner = createReadingRunner({
      startWorker: async () => (starts++, worker),
      runInline: async (j) => (inline.push(j.kind), runReadingJob(j)),
    });
    const map = runner.reading(SMALL, opts());
    const summary = runner.summary(SMALL, 'z.abap');
    await tick();
    expect(worker.posted).toHaveLength(1);
    worker.fail();
    expect((await map).bpmn.xml).toBe(buildReadingExports(SMALL, opts()).bpmn.xml);
    expect(await summary).toEqual(processSummaryOf(SMALL, 'z.abap'));
    expect(inline).toEqual(['reading', 'summary']);
    expect(worker.terminated).toBe(1);
    await runner.reading(SMALL, opts('Q'));
    expect(starts).toBe(1);
    runner.dispose();
  });

  test('an error the reader throws is passed on, not run again here, and not kept', async () => {
    let fail = true;
    const worker = fakeWorker((r) => (fail ? { id: r.id, error: 'boom' } : handleReadingRequest(r)));
    const inline: ReadingJob[] = [];
    const runner = createReadingRunner({ startWorker: async () => worker, runInline: async (j) => (inline.push(j), runReadingJob(j)) });
    const first = runner.reading(SMALL, opts());
    await tick();
    worker.answer();
    await expect(first).rejects.toThrow('boom');
    expect(inline).toHaveLength(0);
    fail = false;
    const again = runner.reading(SMALL, opts());
    expect(again).not.toBe(first);
    await tick();
    worker.answer();
    expect((await again).bpmn.xml).toBe(buildReadingExports(SMALL, opts()).bpmn.xml);
    runner.dispose();
  });

  test('an idle worker is stopped and started again for the next reading; the readings stay', async () => {
    const workers: Fake[] = [];
    const runner = createReadingRunner({
      startWorker: async () => {
        const w = fakeWorker();
        workers.push(w);
        return w;
      },
      runInline: async () => { throw new Error('not here'); },
      idleMs: 5,
    });
    const r = runner.reading(SMALL, opts());
    await tick();
    workers[0].answer();
    const kept = await r;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(workers[0].terminated).toBe(1);
    expect(await runner.reading(SMALL, opts())).toBe(kept);
    const other = runner.reading(SMALL, opts('Other'));
    await tick();
    expect(workers).toHaveLength(2);
    workers[1].answer();
    expect((await other).bpmn.xml).toBe(buildReadingExports(SMALL, opts('Other')).bpmn.xml);
    runner.dispose();
    expect(workers[1].terminated).toBe(1);
  });

  test('dispose stops the worker and settles what was waiting', async () => {
    const worker = fakeWorker();
    const runner = createReadingRunner({ startWorker: async () => worker, runInline: async (j) => runReadingJob(j) });
    const waiting = runner.reading(SMALL, opts());
    await tick();
    runner.dispose();
    await expect(waiting).rejects.toThrow('stopped');
    expect(worker.terminated).toBe(1);
  });
});
