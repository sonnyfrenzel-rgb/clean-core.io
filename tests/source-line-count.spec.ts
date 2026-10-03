import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { countSourceLines } from '../lib/source-lines';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { buildDemoProject } from '../lib/demo-project';
import { demoListRow } from '../lib/demo-list-row';
import { DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { runScope } from '../lib/analysis-run-basics';
import { readProgram } from '../components/testing/program-reading';
import { findingsOf } from '../lib/it-findings-build';

/**
 * UX-182 (UX fingerprint 466a55c8e327), owner decision 03.10.2026: a file that
 * ends in a newline has as many lines as an editor shows. The final newline
 * ends the last line; it does not start an empty one. The starter example
 * Z_MM_PO_APPROVAL.abap is 668 lines, and every screen says 668 — the demo
 * row on the dashboard used to say 669 while the starter list said 668.
 */

const STARTER_DIR = path.join(process.cwd(), 'public', 'starter-examples');
const readStarter = (file: string) => fs.readFileSync(path.join(STARTER_DIR, file), 'utf8');

test.describe('countSourceLines - the editor rule', () => {
  test('an empty string has no lines', () => {
    expect(countSourceLines('')).toBe(0);
  });

  test('a last line without a newline counts', () => {
    expect(countSourceLines('a')).toBe(1);
    expect(countSourceLines('a\nb')).toBe(2);
  });

  test('a single final newline adds no line', () => {
    expect(countSourceLines('a\n')).toBe(1);
    expect(countSourceLines('a\nb\n')).toBe(2);
  });

  test('blank lines at the end count, only the very last terminator does not', () => {
    expect(countSourceLines('a\n\n')).toBe(2);
    expect(countSourceLines('a\n\n\n')).toBe(3);
    expect(countSourceLines('\n')).toBe(1);
    expect(countSourceLines('\n\n')).toBe(2);
  });

  test('CRLF and a lone CR are one terminator each, like LF', () => {
    expect(countSourceLines('a\r\nb\r\n')).toBe(2);
    expect(countSourceLines('a\rb\r')).toBe(2);
    expect(countSourceLines('a\r\nb')).toBe(2);
    expect(countSourceLines('a\r\n\r\n')).toBe(2);
    expect(countSourceLines('a\r\nb\nc\rd')).toBe(4);
  });

  test('a whitespace-only line is a line', () => {
    expect(countSourceLines('   ')).toBe(1);
    expect(countSourceLines('a\n   \n')).toBe(2);
  });
});

test.describe('the starter examples count as an editor shows them', () => {
  test('Z_MM_PO_APPROVAL counts 668, with LF, CRLF and as checked out', () => {
    const source = readStarter('Z_MM_PO_APPROVAL.abap');
    const lf = source.replace(/\r\n/g, '\n');
    expect(lf.endsWith('\n'), 'the example ends in a newline - the case this decision is about').toBe(true);
    expect(countSourceLines(source)).toBe(668);
    expect(countSourceLines(lf)).toBe(668);
    expect(countSourceLines(lf.replace(/\n/g, '\r\n'))).toBe(668);
  });

  test('every starter example counts what the starter list states', () => {
    for (const example of STARTER_EXAMPLES) {
      expect(countSourceLines(readStarter(example.file)), example.file).toBe(example.lines);
    }
  });

  test('the screens that count a staged source say 668 for it', () => {
    const source = readStarter('Z_MM_PO_APPROVAL.abap');
    expect(runScope(source)).toBe('Reading 1 program, 668 lines');
    expect(readProgram(source)?.lines).toBe(668);
  });
});

test.describe('the demo says 668 wherever it states the line count', () => {
  test('the demo project, its dashboard row and its IT view', () => {
    const demo = buildDemoProject();
    expect(demo.sourceFile).toBe(DEMO_SOURCE_FILE);
    expect(demo.totalLines).toBe(668);
    expect(demo.economics.loc).toBe(668);
    expect(demoListRow().lines, 'the dashboard demo row').toBe(668);
    const starter = STARTER_EXAMPLES.find((e) => e.file === DEMO_SOURCE_FILE);
    expect(starter?.lines, 'the starter list').toBe(668);
    const it = findingsOf(readStarter(DEMO_SOURCE_FILE), DEMO_SOURCE_FILE, demo.deployment, demo.catalogSnapshot);
    expect(it.coverage?.lines, 'the IT view').toBe(668);
  });
});
