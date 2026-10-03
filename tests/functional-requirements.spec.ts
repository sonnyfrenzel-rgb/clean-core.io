import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  REQUIREMENT_PRIORITIES,
  anchorHolds,
  anchorList,
  buildRequirementSet,
  sourceLines,
  type RequirementSet,
} from '../lib/functional-requirements';
import { validateWording, wordingPrompt } from '../lib/requirement-wording';
import {
  PROVENANCE_NOTE,
  requirementText,
  requirementsDocxParts,
  requirementsHtml,
  requirementsMarkdown,
} from '../lib/requirements-export';

/**
 * v3.0.1 — the functional requirements of the Design stage are read from the
 * code, not written by a model (owner 03.10.2026: "much better content … today
 * it is only boring AI slop text").
 *
 * Pure: the builder, the exports and the wording check, on the two example
 * programs the owner named. No server, no model.
 */

const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');

const EXAMPLES = ['Z_MM_PO_APPROVAL.abap', 'Z_SALES_ORDER_CREATOR.txt'] as const;
const META = { projectName: 'Fixture', fileName: 'fixture.abap', date: '2026-10-03' };

for (const file of EXAMPLES) {
  test.describe(file, () => {
    const source = read(file);
    const lines = sourceLines(source);
    const set: RequirementSet = buildRequirementSet({ source });

    test('every requirement has an ID, a "shall" statement, an anchor that exists in the source, a priority and 1–3 criteria', () => {
      expect(set.requirements.length).toBeGreaterThan(2);
      set.requirements.forEach((r, i) => {
        expect(r.id).toBe(`FR-${String(i + 1).padStart(3, '0')}`);
        expect(r.statement).toMatch(/^The system shall \S/);
        expect(r.statement.endsWith('.')).toBe(true);
        expect(r.anchors.length, r.id).toBeGreaterThan(0);
        for (const a of r.anchors) expect(anchorHolds(a, lines), `${r.id} ${a.lineStart}`).toBe(true);
        expect(REQUIREMENT_PRIORITIES).toContain(r.priority);
        expect(r.priorityReason.length).toBeGreaterThan(10);
        expect(r.acceptance.length).toBeGreaterThanOrEqual(1);
        expect(r.acceptance.length).toBeLessThanOrEqual(3);
        expect(r.provenance).toBe('reconstructed');
        // No Markdown, no currency the code does not state.
        // (A single `*` stays: `EMERG*` is a pattern the code tests.)
        expect(r.statement).not.toMatch(/\*\*|#|`|€|\$|\bEUR\s?\d/);
      });
      expect(set.dropped).toEqual([]);
    });

    test('what the code cannot ground is listed apart, as not determined, never as a requirement', () => {
      expect(set.open.length).toBeGreaterThan(0);
      for (const o of set.open) {
        expect(o.id).toMatch(/^TBC-\d{2}$/);
        expect(o.provenance).toBe('not-determined');
        for (const a of o.anchors) expect(anchorHolds(a, lines)).toBe(true);
      }
      expect(set.open.map((o) => o.topic)).toEqual(expect.arrayContaining(['authorization', 'volume']));
      // Performance and ownership are questions, not requirements found in the code.
      for (const r of set.requirements) expect(r.statement).not.toMatch(/\b(performance|response time|availability|SLA|owner)\b/i);
    });

    test('copy and every export carry every requirement with its anchors and the provenance note', () => {
      const md = requirementsMarkdown(set, META);
      const html = requirementsHtml(set, META);
      const docx = requirementsDocxParts(set, META)['word/document.xml'];
      for (const doc of [md, html, docx]) {
        expect(doc).toContain(PROVENANCE_NOTE.slice(0, 60));
        for (const r of set.requirements) {
          expect(doc, r.id).toContain(r.id);
          expect(doc, `${r.id} anchors`).toContain(anchorList(r.anchors));
        }
        for (const o of set.open) expect(doc).toContain(o.id);
      }
      for (const r of set.requirements) {
        const one = requirementText(set, r);
        expect(one).toContain(r.id);
        expect(one).toContain(r.statement);
        expect(one).toContain(`Lines: ${anchorList(r.anchors)}`);
        expect(one).toContain('Provenance: reconstructed from the code');
      }
    });

    test('the traceability links every step to its requirements and nothing twice', () => {
      const seen = new Set<string>();
      for (const s of set.steps) {
        for (const id of s.requirementIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
          expect(set.requirements.find((r) => r.id === id)?.stepId).toBe(s.id);
        }
      }
      expect(seen.size).toBe(set.requirements.filter((r) => r.stepId).length);
    });
  });
}

test('the purchase-order approval: the price tolerance is a Must control with its line and its boundary', () => {
  const set = buildRequirementSet({ source: read('Z_MM_PO_APPROVAL.abap') });
  const price = set.requirements.find((r) => r.basis.ref === 'BR-009');
  expect(price).toBeTruthy();
  expect(price!.priority).toBe('must');
  expect(price!.anchors.some((a) => a.quote.includes('lv_dev_pct > 5'))).toBe(true);
  expect(price!.statement).toContain('Hold for buyer');
  expect(price!.acceptance.some((c) => /exactly 5/.test(c.given) && /does not apply/.test(c.then))).toBe(true);
  // Rules in routines nothing calls are questions, not requirements.
  expect(set.requirements.some((r) => r.basis.ref === 'BR-007')).toBe(false);
  expect(set.open.some((o) => o.topic === 'unreached-rule' && o.question.includes('BR-007'))).toBe(true);
  // The amount without a currency stays without one.
  expect(set.open.some((o) => o.topic === 'currency' && o.question.includes('50000.00'))).toBe(true);
});

test('the sales-order creator: hard-coded order values and the commit decision are requirements', () => {
  const set = buildRequirementSet({ source: read('Z_SALES_ORDER_CREATOR.txt') });
  const fixed = set.requirements.find((r) => r.basis.kind === 'fixed-values');
  expect(fixed?.statement).toContain("'TA'");
  const decision = set.requirements.find((r) => r.basis.kind === 'decision');
  expect(decision?.statement).toMatch(/Commit changes[\s\S]*otherwise[\s\S]*Roll back changes/);
  expect(decision?.priority).toBe('must');
});

test.describe('the wording check: a model may reword, never re-anchor or invent', () => {
  const source = read('Z_MM_PO_APPROVAL.abap');
  const set = buildRequirementSet({ source });
  const price = set.requirements.find((r) => r.basis.ref === 'BR-009')!;
  const other = set.requirements.find((r) => r.id !== price.id && r.anchors[0].lineStart > price.anchors[price.anchors.length - 1].lineEnd + 5)!;
  const line = `L${price.anchors[0].lineStart}`;
  const answer = (items: unknown[]) => JSON.stringify({ requirements: items });

  test('a sentence on its own lines is kept', () => {
    const v = validateWording(set, source, answer([
      { id: price.id, statement: 'The system shall hold the requisition for the buyer when the price deviates by more than 5 percent.', anchors: [line] },
    ]));
    expect(v.wording[price.id]).toMatch(/^The system shall hold/);
    expect(v.discarded).toEqual([]);
  });

  test('an anchor that is not in the source is dropped with its reason', () => {
    const v = validateWording(set, source, answer([
      { id: price.id, statement: 'The system shall hold the requisition for the buyer.', anchors: ['L99999'] },
    ]));
    expect(v.wording[price.id]).toBeUndefined();
    expect(v.discarded).toEqual([{ id: price.id, reason: 'anchor-not-in-source' }]);
  });

  test('an anchor of another requirement, an invented number, a sentence without "shall" and an unknown id are dropped', () => {
    const v = validateWording(set, source, answer([
      { id: price.id, statement: 'The system shall hold the requisition for the buyer.', anchors: [`L${other.anchors[0].lineStart}`] },
      { id: other.id, statement: 'The system shall do this within 30 seconds.', anchors: [`L${other.anchors[0].lineStart}`] },
      { id: set.requirements[0].id, statement: 'Requisitions are processed.', anchors: [`L${set.requirements[0].anchors[0].lineStart}`] },
      { id: 'FR-999', statement: 'The system shall exist.', anchors: [line] },
    ]));
    expect(Object.keys(v.wording)).toEqual([]);
    expect(v.discarded.map((d) => d.reason).sort()).toEqual(['anchor-not-of-requirement', 'not-a-shall', 'number-not-in-code', 'unknown-id'].sort());
  });

  test('an answer that is not the asked JSON is refused whole', () => {
    expect(validateWording(set, source, 'Here are your requirements!').discarded).toEqual([{ id: null, reason: 'not-json' }]);
  });

  test('the prompt hands the model the engine sentence and anchors, and asks for JSON only', () => {
    const prompt = wordingPrompt(set);
    expect(prompt).toContain(price.statement);
    expect(prompt).toContain(line);
    expect(prompt).toContain('Answer with JSON only');
  });
});

test('an anchor outside the source never holds', () => {
  const lines = ['REPORT z.', 'WRITE 1.'];
  expect(anchorHolds({ lineStart: 1, lineEnd: 2 }, lines)).toBe(true);
  expect(anchorHolds({ lineStart: 0, lineEnd: 1 }, lines)).toBe(false);
  expect(anchorHolds({ lineStart: 2, lineEnd: 3 }, lines)).toBe(false);
  expect(anchorHolds({ lineStart: 2, lineEnd: 1 }, lines)).toBe(false);
  expect(anchorHolds({ lineStart: 1, lineEnd: 1, quote: 'WRITE 1.' }, lines)).toBe(false);
});
