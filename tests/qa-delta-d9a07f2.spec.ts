import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { ENGINE_READS_FROM } from '../lib/abap/engine-reads-gate';
import { guardCaseAnswer, type CaseFact } from '../lib/case-answer';
import { maskFor } from '../lib/sensitive-text';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';

const ROOT = path.resolve(__dirname, '..');

/**
 * Findings of the QA delta review of d9a07f20f949, server-free.
 */

const kinds = (code: string, engine: string) =>
  buildAbapEvidence(code, 'zqa.prog.abap', 'private', undefined, engine).findings.map((f) => f.kind);

test.describe('a copy after the dynamic call names no module (7d96250ccacc)', () => {
  const after = [
    'REPORT zqa.',
    "CONSTANTS c_mail TYPE rs38l_fnam VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
    'DATA lv_fm TYPE rs38l_fnam.',
    'CALL FUNCTION lv_fm.',
    'lv_fm = c_mail.',
  ].join('\n');

  test('the copy follows the call: no module finding; before the call it still is one', () => {
    expect(kinds(after, ENGINE_READS_FROM)).not.toContain('legacy-mail');
    const lines = after.split('\n');
    const before = [lines[0], lines[1], lines[2], lines[4], lines[3]].join('\n');
    expect(kinds(before, ENGINE_READS_FROM)).toContain('legacy-mail');
    // MOVE reads the same way.
    expect(kinds(after.replace('lv_fm = c_mail.', 'MOVE c_mail TO lv_fm.'), ENGINE_READS_FROM)).not.toContain('legacy-mail');
    // A 3.0.17 run keeps what it signed: every matching constant counted.
    expect(kinds(after, '3.0.17')).toContain('legacy-mail');
  });

  test('a copy between two calls of the same name reaches the second', () => {
    const between = [
      'REPORT zqa.',
      "CONSTANTS c_mail TYPE rs38l_fnam VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
      'DATA lv_fm TYPE rs38l_fnam.',
      'CALL FUNCTION lv_fm.',
      'lv_fm = c_mail.',
      'CALL FUNCTION lv_fm.',
    ].join('\n');
    expect(kinds(between, ENGINE_READS_FROM)).toContain('legacy-mail');
  });
});

test.describe('a refusal shields only itself (fe1d9c093536)', () => {
  const facts: CaseFact[] = [
    { id: 'a', kind: 'element', title: 'Show the report', detail: 'WRITE / gv_title', anchor: 'L2' },
  ];

  test('a claim after the refusal phrase is read as a claim and dropped when it fails', () => {
    // Unanchored claim behind the refusal.
    const g1 = guardCaseAnswer(
      'The evidence does not answer whether the report runs nightly, but it deletes every customer record. It displays the report [L2].',
      facts,
    );
    expect(g1.outcome).toBe('shown');
    if (g1.outcome === 'shown') {
      expect(g1.text).not.toContain('deletes');
      expect(g1.dropped).toBe(1);
    }
    // Anchored, but naming what the cited fact does not hold.
    const g2 = guardCaseAnswer(
      'The evidence does not say who calls it; it deletes table KNA1 [L2]. It displays the report [L2].',
      facts,
    );
    expect(g2.outcome).toBe('shown');
    if (g2.outcome === 'shown') expect(g2.text).not.toContain('KNA1');
    expect(g2.sentences[0].verdict).toBe('unsupported');
    expect(g2.sentences[0].missing).toContain('KNA1');
  });

  test('a refusal alone is still a decline, with or without an anchor', () => {
    for (const text of ['The evidence does not answer this question.', 'The facts do not say who calls the report [L2].']) {
      const g = guardCaseAnswer(text, facts);
      expect(g.sentences[0].verdict, text).toBe('declined');
      expect(g.outcome).toBe('refused');
      if (g.outcome === 'refused') expect(g.reason).toBe('declined');
    }
  });

  test('a supported clause beside a refusal is kept as an anchored claim', () => {
    const g = guardCaseAnswer('The evidence does not say who calls it, but it writes GV_TITLE [L2].', facts);
    expect(g.sentences[0].verdict).toBe('anchored');
    expect(g.outcome).toBe('shown');
  });
});

test.describe('af33f2acba86', () => {
  test('af33f2acba86', () => {
    const FILE = 'Z_SD_FREIGHT_RATE_CHECK.abap';
    const SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');
    const narrative = JSON.stringify({
      asIsContext: 'It checks the freight rate of each delivery, owned by anna.schmidt@example.com [L20].',
    });
    const { bpmn, technical } = buildReadingExports(SOURCE, { processName: FILE, sourceFileName: FILE });
    const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(SOURCE), null, 'no-key'), fileName: FILE });
    const text = buildProcessDocument({ source: SOURCE, map, narrative }).purpose.proposal?.text ?? '';
    expect(text).toContain('freight rate');
    expect(text).not.toContain('anna.schmidt@example.com');
    expect(text).toContain(maskFor('email'));
  });
});
