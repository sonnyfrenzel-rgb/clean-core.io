import { test, expect } from '@playwright/test';
import {
  PARSE_ONCE_READER,
  parseOnceFallback,
  parseOnceStatistics,
  readStatements,
  readStatementsShipping,
  withParsedSource,
} from '../lib/abap/statement-reader';
import { containerAt, containerAtScan, readBlocks, type Container } from '../lib/abap/block-structure';
import { parseSource } from '../lib/engine4/parsed-source';
import { shadowCorpus } from '../scripts/engine4/shadow';
import { runNeutrality } from '../scripts/engine/parse-once-neutrality';

/**
 * Roadmap 3.5.0 item 2, Phase 0 "parse once", wired (ADR-133 (1);
 * docs/design/engine4.md, "Phase 0 wiring"). `readStatements` reads through the
 * engine 4.0 strand's `ParsedSource` and falls back to the shipping scanner
 * wherever the two could differ; `containerAt` answers from an index. Both must
 * be byte-neutral: the frozen digests (`engine-frozen-digests.spec.ts`,
 * `engine-version-rebuild.spec.ts`) prove it on whole evidence, this spec on the
 * readers themselves, over the starter examples and the benchmark learn halves
 * (never the holdout) and deterministic mutations of them. Server-free.
 */

test('the parse-once reader is on', () => {
  expect(PARSE_ONCE_READER).toBe(true);
});

test('wherever the parsed view serves, it equals the shipping scanner: corpus and 29,000 mutations of it', () => {
  test.setTimeout(600_000);
  const r = runNeutrality(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.mismatches, JSON.stringify(r.samples.slice(0, 5), null, 1)).toBe(0);
  // The parsed view must carry most of the load, or the wiring buys nothing.
  expect(r.parsed / r.sources).toBeGreaterThan(0.6);
});

test('readStatements answers the shipping scanner byte for byte on every corpus file', () => {
  for (const file of shadowCorpus()) {
    expect(JSON.stringify(readStatements(file.source)), file.name).toBe(JSON.stringify(readStatementsShipping(file.source)));
  }
});

test('the fallback names every class where the two readings could differ', () => {
  const reason = (src: string) => parseOnceFallback(parseSource(src));
  expect(reason("REPORT z.\nWRITE 'a.\n")).toBe('unterminated-literal');
  expect(reason('REPORT z.\nlv = |a{ b\n }c|.\n')).toBe('template-across-lines');
  expect(reason('REPORT z.\nlv = |a{ b. }c|.\n')).toBe('period-in-template');
  expect(reason('REPORT z.\nlv = ls_p000.1.\n')).toBe('period-between-digits');
  expect(reason('REPORT z.\nlv = 0.5.\n')).toBe('unquoted-decimal');
  expect(reason('REPORT z.\nEXEC SQL.\n  SELECT 1 FROM dual\nENDEXEC.\n')).toBe('native-sql');
  expect(reason('CLASS c IMPLEMENTATION.\nMETHOD m BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT.\nENDMETHOD.\nENDCLASS.\n')).toBe('native-sql');
  expect(reason('REPORT z.\nIF a = b.\nWRITE a.\n')).toBe('recovered');
  expect(reason('REPORT z.\nIF a = b.\n  WRITE |x{ a }y|.\nENDIF.\n')).toBeNull();
});

test('inside a build one reading per source, every caller gets its own copy, nothing stays after', () => {
  const src = 'REPORT z.\nDATA a TYPE i.\nIF a = 1.\n  WRITE a.\nENDIF.\n';
  const before = parseOnceStatistics();
  withParsedSource(() => {
    const first = readStatements(src);
    first[0].text = 'CHANGED';
    first.pop();
    const second = readStatements(src);
    expect(second[0].text).toBe('REPORT z');
    expect(second).toHaveLength(5);
    expect(second[0]).not.toBe(first[0]);
  });
  const inside = parseOnceStatistics();
  expect(inside.parsed - before.parsed).toBe(1);
  expect(inside.reused - before.reused).toBe(1);
  readStatements(src);
  expect(parseOnceStatistics().parsed - inside.parsed).toBe(1);
});

test('the container index answers the shipping scan on every line of every corpus file', () => {
  for (const file of shadowCorpus()) {
    const containers = readBlocks(readStatementsShipping(file.source)).containers;
    const lines = file.source.split('\n').length;
    containerAt(containers, 1); // first sight: the scan answers
    for (let line = -1; line <= lines + 2; line++) {
      expect(containerAt(containers, line), `${file.name}:${line}`).toBe(containerAtScan(containers, line));
    }
  }
});

test('the container index follows the scan on overlaps, ties and a list that grows', () => {
  const c = (kind: Container['kind'], name: string, lineStart: number, lineEnd: number): Container => ({ kind, name, lineStart, lineEnd });
  const list: Container[] = [
    c('event', 'START-OF-SELECTION', 1, 40), c('class', 'LCL', 5, 30), c('method', 'M1', 8, 12), c('method', 'M2', 8, 12),
    c('form', 'F', 35, 50), c('event', 'END-OF-SELECTION', 41, 60), c('function', 'FM', 70, 80),
  ];
  const check = () => { for (let l = -2; l <= 85; l++) expect(containerAt(list, l), String(l)).toBe(containerAtScan(list, l)); };
  check();
  check();
  list.push(c('module', 'PBO', 75, 76));
  check();
  check();
  expect(containerAt(list, 1.5)).toBe(containerAtScan(list, 1.5));
});
