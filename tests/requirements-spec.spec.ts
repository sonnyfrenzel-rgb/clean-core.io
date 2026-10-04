import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildRequirementSet } from '../lib/functional-requirements';
import { buildNfrSet } from '../lib/non-functional-requirements';
import { applyMark, isSafeHref, normalizeRich, parseRich, richHtml, richMarkdown, richPlain } from '../lib/rich-text';
import {
  answerDecision,
  buildSpecDraft,
  businessTitle,
  decisionOpen,
  mergeReading,
  nextHistory,
  plainText,
  readSpecRecord,
  specCounts,
  specDrift,
  specForSave,
  specState,
  specSummaryOf,
  stampAnswers,
  traceRows,
  validateSpec,
  validateSpecPayload,
  SPEC_LIMITS,
  type RequirementsSpec,
  type SpecRecord,
} from '../lib/requirements-spec';
import { specBlocks, specConfluenceHtml, specDocxParts, specMarkdown, SPEC_EXPORT_NOTE } from '../lib/requirements-spec-export';

/**
 * The requirements specification of ADR-078, without a browser: the restricted
 * text format, the engine's draft, the decisions, the server's validation, and
 * the one block model every export spells. The route and the screen have specs
 * of their own (`requirements-spec-route.spec.ts`, `requirements-workspace.spec.ts`).
 */

const EXAMPLE = path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap');
const SOURCE = fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');

function draft(source = SOURCE, extra: Partial<Parameters<typeof buildSpecDraft>[0]> = {}): RequirementsSpec {
  return buildSpecDraft({ projectName: 'Emergency purchase approval', fr: buildRequirementSet({ source }), nfr: buildNfrSet({ source }), ...extra });
}

const META = { date: '2026-10-04', fileName: 'Z_MM_PO_APPROVAL.abap', sourceSha256: 'a'.repeat(64), revision: 3, author: 'owner@example.com', history: [] };

test.describe('the text format of a field', () => {
  test('bold, italic, code, links and both lists — nothing else becomes markup', () => {
    const blocks = parseRich('The system shall **stop** and *say why* with `E001`.\n\n- one\n- two\n\n1. first\n2. second\n\n[docs](https://help.sap.com/x)');
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ul', 'ol', 'p']);
    const html = richHtml('**bold** <script>alert(1)</script> [x](https://example.com/a?b=1&c=2)');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
  });

  test('a link to anything but the web or mail stays text, visibly', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://', 'http://x y', 'vbscript:x']) expect(isSafeHref(bad), bad).toBe(false);
    const html = richHtml('[click](javascript:alert(1))');
    expect(html).not.toContain('href=');
    expect(html).toContain('click (javascript:alert(1');
    expect(isSafeHref('mailto:owner@example.com')).toBe(true);
  });

  test('control characters and runs of empty lines are dropped; the limit holds', () => {
    expect(normalizeRich('a\u0000b\r\n\r\n\r\n\r\nc  ')).toBe('ab\n\nc');
    expect(normalizeRich('x'.repeat(5000)).length).toBe(4000);
  });

  test('Markdown and plain text say the same as the tree', () => {
    const text = 'A **b** *c* `d`\n\n- e\n- f';
    expect(richMarkdown(text)).toBe(text);
    expect(richPlain(text)).toBe('A b c d\n\n• e\n• f');
  });

  test('the formatting bar wraps a selection and toggles a list', () => {
    expect(applyMark('make this bold', 5, 9, 'bold')).toEqual({ text: 'make **this** bold', start: 7, end: 11 });
    const listed = applyMark('one\ntwo', 0, 7, 'ul');
    expect(listed.text).toBe('- one\n- two');
    expect(applyMark(listed.text, 0, listed.text.length, 'ul').text).toBe('one\ntwo');
    expect(applyMark('a b', 0, 3, 'ol').text).toBe('1. a b');
  });
});

test.describe('the engine draft', () => {
  test('every functional and non-functional requirement of the engine is in it, with its lines', () => {
    const fr = buildRequirementSet({ source: SOURCE });
    const nfr = buildNfrSet({ source: SOURCE });
    const spec = draft();
    for (const r of fr.requirements) {
      const s = spec.requirements.find((x) => x.source.engineRef === r.id);
      expect(s, r.id).toBeTruthy();
      expect(s!.source.lines.length, r.id).toBe(r.anchors.length);
      expect(s!.statement, r.id).toMatch(/^The system shall /);
      expect(s!.origin).toBe('engine');
    }
    for (const r of nfr.requirements) expect(spec.requirements.some((x) => x.source.engineRef === r.id), r.id).toBe(true);
    // Every non-functional requirement has a target and a way to measure it.
    for (const r of spec.requirements.filter((x) => x.kind === 'non-functional')) {
      expect(r.category, r.id).not.toBeNull();
      expect(r.target.trim(), r.id).not.toBe('');
      expect(r.method.trim(), r.id).not.toBe('');
    }
  });

  test('a functional requirement has a business title from its plain wording; the rule id stays in the source', () => {
    const spec = draft();
    const fr1 = spec.requirements.find((r) => r.id === 'FR-001')!;
    expect(fr1.title).toBe('Process only document type NB');
    expect(fr1.source.rules).toEqual(['BR-001']);
    for (const r of spec.requirements.filter((x) => x.kind === 'functional')) {
      expect(r.title, r.id).not.toMatch(/^The system shall|Whole program|BR-\d/);
      expect(r.title.length, r.id).toBeLessThanOrEqual(72);
    }
    expect(businessTitle('The system shall let the user enter a very long list of inputs such as purchase requisition number, item, file and test run before a run.')).toMatch(/ …$/);
  });

  test('statements carry no program variable — those stay in the source column', () => {
    const spec = draft();
    for (const r of spec.requirements) {
      expect(r.statement, r.id).not.toMatch(/\b(?:lv|gv|gs|ls|lt|gt|p|s)_[a-z0-9_]+/i);
      expect(r.statement, r.id).not.toMatch(/\bsy-[a-z]+/i);
    }
    expect(plainText('enter purchase requisition number (P_BANFN, required), requisition item (P_BNFPO)')).toBe('enter purchase requisition number (required), requisition item');
    expect(plainText('for ACTVT \'02\' and EKGRP from lv_ekgrp, and stop')).toBe("for ACTVT '02' and EKGRP, and stop");
    // The technical reading is kept, for the trace.
    expect(spec.requirements.find((r) => r.id === 'FR-001')!.source.evidence).toMatch(/c_doc_type/);
  });

  test('what the code cannot answer becomes a decision with an owner — never a requirement with a value', () => {
    const nfr = buildNfrSet({ source: SOURCE });
    const spec = draft();
    for (const q of nfr.questions) {
      const d = spec.decisions.find((x) => x.id === `D-${q.id}`);
      expect(d, q.id).toBeTruthy();
      expect(d!.answer).toBeNull();
      expect(d!.owner).toBe(q.owner === 'it-operations' ? 'it' : 'business');
      expect(d!.affects.length, q.id).toBeGreaterThan(0);
    }
    const waiting = spec.requirements.filter((r) => r.status === 'clarify');
    expect(waiting.length).toBeGreaterThan(0);
    for (const r of waiting) expect(r.target).toMatch(/^Not determined/);
    expect(specState({ spec })).toBe('draft');
  });

  test('the process review shapes the document: Keep accepts, Drop rejects, Clarify and Change ask', () => {
    const at = '2026-10-04T09:00:00.000Z';
    const spec = draft(SOURCE, {
      ruleStates: [
        { subject: 'BR-001', state: 'keep', note: null, by: 'Owner', at },
        { subject: 'BR-002', state: 'drop', note: 'Release group is gone', by: 'Owner', at },
        { subject: 'BR-004', state: 'clarify', note: null, by: 'Owner', at },
        { subject: 'BR-005', state: 'change', note: 'Only MRP controller EMG', by: 'Owner', at },
      ],
    });
    const byRule = (rule: string) => spec.requirements.filter((r) => r.source.rules.includes(rule));
    for (const r of byRule('BR-001')) expect(r.status).toBe('accepted');
    for (const r of byRule('BR-002')) expect(r.status).toBe('rejected');
    for (const r of byRule('BR-004')) expect(r.status).toBe('clarify');
    expect(spec.decisions.find((d) => d.id === 'D-BR-004')?.origin).toBe('rule-clarify');
    expect(spec.decisions.find((d) => d.id === 'D-BR-005')?.question).toMatch(/How shall business rule BR-005 change/);
  });
});

test.describe('deciding', () => {
  test('an answer sets the target, ends the wait and lowers the count; "decide later" keeps it open', () => {
    const spec = draft();
    const d = spec.decisions.find((x) => x.id === 'D-TBD-13')!;
    const before = specCounts(spec).openDecisions;
    const later = answerDecision(spec, d.id, { kind: 'later', value: '' });
    expect(decisionOpen(later.decisions.find((x) => x.id === d.id)!)).toBe(true);
    expect(specCounts(later).openDecisions).toBe(before);

    const decided = answerDecision(spec, d.id, { kind: 'value', value: '95 % of cases within 2 s' }, 'it');
    expect(specCounts(decided).openDecisions).toBe(before - 1);
    const r = decided.requirements.find((x) => x.id === d.affects[0])!;
    expect(r.target).toBe(`95 % of cases within 2 s (decision ${d.id})`);
    expect(r.status).toBe('draft');
    expect(decided.decisions.find((x) => x.id === d.id)!.answer).toEqual({ kind: 'value', value: '95 % of cases within 2 s', by: null, at: null });
  });

  test('the server stamps who answered and when; an unchanged answer keeps its stamp', () => {
    const spec = answerDecision(draft(), 'D-TBD-13', { kind: 'option', value: 'As today — measure first' });
    const first = stampAnswers(spec, null, 'owner@example.com', '2026-10-04T10:00:00.000Z');
    expect(first.decisions.find((d) => d.id === 'D-TBD-13')!.answer).toMatchObject({ by: 'owner@example.com', at: '2026-10-04T10:00:00.000Z' });
    const again = stampAnswers(spec, first, 'other@example.com', '2026-10-05T10:00:00.000Z');
    expect(again.decisions.find((d) => d.id === 'D-TBD-13')!.answer).toMatchObject({ by: 'owner@example.com', at: '2026-10-04T10:00:00.000Z' });
  });
});

test.describe('what the server accepts', () => {
  test('the draft is valid as it stands', () => {
    const v = validateSpec(JSON.parse(JSON.stringify(draft())));
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(JSON.stringify(draft()).length).toBeLessThan(SPEC_LIMITS.maxBodyChars);
  });

  test('unknown keys, foreign values, duplicates and oversize text are refused, naming the field', () => {
    const base = () => JSON.parse(JSON.stringify(draft())) as Record<string, unknown> & { requirements: Array<Record<string, unknown>>; decisions: Array<Record<string, unknown>> };
    const refused = (mutate: (s: ReturnType<typeof base>) => void) => {
      const s = base();
      mutate(s);
      const v = validateSpec(s);
      expect(v.ok).toBe(false);
      return v.ok ? '' : v.field;
    };
    expect(refused((s) => { s.admin = true; })).toBe('spec.admin');
    expect(refused((s) => { s.requirements[0].status = 'proven'; })).toBe('spec.requirements[0].status');
    expect(refused((s) => { s.requirements[0].priority = 'urgent'; })).toBe('spec.requirements[0].priority');
    expect(refused((s) => { s.requirements[0].statement = 'x'.repeat(4001); })).toBe('spec.requirements[0].statement');
    expect(refused((s) => { s.requirements[0].id = '<b>'; })).toBe('spec.requirements[0].id');
    expect(refused((s) => { s.requirements[1].id = s.requirements[0].id; })).toBe('spec.requirements');
    expect(refused((s) => { (s.requirements[0].source as Record<string, unknown>).lines = [{ s: 0, e: 3 }]; })).toBe('spec.requirements[0].source.lines[0]');
    expect(refused((s) => { (s.requirements[0].source as Record<string, unknown>).extra = 1; })).toBe('spec.requirements[0].source.extra');
    expect(refused((s) => { s.decisions[0].owner = 'ceo'; })).toBe('spec.decisions[0].owner');
    expect(refused((s) => { s.decisions[0].answer = { kind: 'value', value: '' }; })).toBe('spec.decisions[0].answer.value');
    expect(refused((s) => { s.requirements = Array.from({ length: SPEC_LIMITS.requirements + 1 }, () => s.requirements[0]); })).toBe('spec.requirements');
  });

  test('a browser cannot write who answered — the stamp is dropped on the way in', () => {
    const s = JSON.parse(JSON.stringify(answerDecision(draft(), 'D-TBD-13', { kind: 'option', value: 'Yes' })));
    s.decisions.find((d: { id: string }) => d.id === 'D-TBD-13').answer.by = 'ceo@example.com';
    const v = validateSpec(s);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.decisions.find((d) => d.id === 'D-TBD-13')!.answer).toMatchObject({ by: null, at: null });
  });

  test('a save names its revision, its source and what changed — nothing else', () => {
    const spec = specForSave(draft());
    const ok = validateSpecPayload({ spec, baseRevision: 0, derivedFrom: 'b'.repeat(64), change: 'Started' });
    expect(ok.ok).toBe(true);
    expect(validateSpecPayload({ spec, baseRevision: -1, derivedFrom: 'b'.repeat(64), change: 'x' }).ok).toBe(false);
    expect(validateSpecPayload({ spec, baseRevision: 0, derivedFrom: 'nope', change: 'x' }).ok).toBe(false);
    expect(validateSpecPayload({ spec, baseRevision: 0, derivedFrom: 'b'.repeat(64), change: '' }).ok).toBe(false);
    expect(validateSpecPayload({ spec, baseRevision: 0, derivedFrom: 'b'.repeat(64), change: 'x', savedBy: 'me' }).ok).toBe(false);
  });

  test('half-typed rows are left out of a save, not refused', () => {
    const s = draft();
    s.stakeholders.push({ role: '  ', interest: 'x' });
    s.requirements[0].acceptance.push({ given: 'a', when: '', then: 'c' });
    expect(validateSpec(JSON.parse(JSON.stringify(s))).ok).toBe(false);
    expect(validateSpec(JSON.parse(JSON.stringify(specForSave(s)))).ok).toBe(true);
  });

  test('the history folds a run of the same change and keeps the last hundred', () => {
    let h = nextHistory([], { revision: 1, at: '2026-10-04T10:00:00.000Z', by: 'a', change: 'Edited FR-001' });
    h = nextHistory(h, { revision: 2, at: '2026-10-04T10:01:00.000Z', by: 'a', change: 'Edited FR-001' });
    expect(h).toHaveLength(1);
    expect(h[0].revision).toBe(2);
    h = nextHistory(h, { revision: 3, at: '2026-10-04T10:02:00.000Z', by: 'a', change: 'Decided D-TBD-13' });
    expect(h).toHaveLength(2);
    for (let i = 0; i < 150; i++) h = nextHistory(h, { revision: 4 + i, at: '2026-10-04T10:03:00.000Z', by: 'a', change: `c${i}` });
    expect(h).toHaveLength(SPEC_LIMITS.history);
  });

  test('a stored record reads back with its stamps; garbage reads as none', () => {
    const spec = stampAnswers(answerDecision(draft(), 'D-TBD-13', { kind: 'option', value: 'Yes' }), null, 'o@example.com', '2026-10-04T10:00:00.000Z');
    const record: SpecRecord = { formatVersion: 1, spec, derivedFrom: 'c'.repeat(64), revision: 2, savedAt: '2026-10-04T10:00:00.000Z', savedBy: 'o@example.com', history: [] };
    const back = readSpecRecord(JSON.parse(JSON.stringify(record)));
    expect(back?.spec.decisions.find((d) => d.id === 'D-TBD-13')?.answer?.by).toBe('o@example.com');
    expect(readSpecRecord({ formatVersion: 1, spec: { title: 1 } })).toBeNull();
    expect(readSpecRecord(null)).toBeNull();
    expect(specSummaryOf(record)).toMatchObject({ revision: 2, derivedFrom: 'c'.repeat(64) });
  });
});

test.describe('a source that moved on', () => {
  test('the drift names what is new and what is gone, and taking it over keeps the owner’s wording', () => {
    const before = draft();
    const edited = { ...before, requirements: before.requirements.map((r) => (r.id === 'FR-002' ? { ...r, statement: 'The system shall process only release group ZE — owner wording.' } : r)) };
    // A source with one hard-coded rule fewer.
    const moved = SOURCE.replace(/c_doc_type\s+TYPE[^\n]*\n/i, '\n');
    const fresh = draft(moved);
    const drift = specDrift(edited, fresh);
    expect(drift.added.length + drift.gone.length + drift.changed.length).toBeGreaterThan(0);
    const merged = mergeReading(edited, fresh);
    const kept = merged.requirements.find((r) => r.id === 'FR-002');
    if (kept && !drift.gone.includes('FR-002')) expect(kept.statement).toContain('owner wording');
    for (const ref of drift.gone) expect(merged.requirements.find((r) => r.source.engineRef === ref)!.status).toBe('rejected');
    expect(new Set(merged.requirements.map((r) => r.id)).size).toBe(merged.requirements.length);
  });
});

test.describe('the exports', () => {
  test('one block list: title page, contents, nine sections and the history, every requirement and decision', () => {
    const spec = answerDecision(draft(), 'D-TBD-13', { kind: 'value', value: '95 % within 2 s' });
    const md = specMarkdown(spec, META);
    for (const h of ['1. Purpose and scope', '2. Context and stakeholders', '3. Functional requirements', '4. Non-functional requirements', '5. Interfaces and data', '6. Constraints and assumptions', '7. Open decisions', '8. Traceability matrix', '9. Glossary', 'Appendix: Revision history', 'Contents']) {
      expect(md, h).toContain(h);
    }
    for (const r of spec.requirements) expect(md, r.id).toContain(r.id);
    for (const d of spec.decisions) expect(md, d.id).toContain(d.id);
    expect(md).toContain('owner@example.com (self-declaration of the signed-in account)');
    expect(md).toContain('Reconstructed from the code — not confirmed');
    expect(md).toContain('not part of the signed audit pack');
    expect(md).toContain('95 % within 2 s');
    expect(md).toContain(SPEC_EXPORT_NOTE);
    // The trace matrix has a row per requirement.
    expect(traceRows(spec)).toHaveLength(spec.requirements.length);
  });

  test('a model proposal is printed as one, beside an open decision — never as its answer', () => {
    const spec = draft(SOURCE, { proposals: { slaRequirements: 'For TBD-13: business hours, 2 s.' } });
    const d = spec.decisions.find((x) => x.id === 'D-TBD-13')!;
    expect(d.proposal).toContain('TBD-13');
    expect(d.answer).toBeNull();
    expect(specMarkdown(spec, META)).toContain('Model proposal: For TBD-13: business hours, 2 s.');
    // A generic proposal that names no question is not attached to one.
    const generic = draft(SOURCE, { proposals: { slaRequirements: 'Fast.' } });
    expect(generic.decisions.every((x) => x.proposal === '')).toBe(true);
  });

  test('hostile text is escaped in the Confluence page and in Word', () => {
    const spec = draft();
    spec.title = 'Spec <img src=x onerror=alert(1)>';
    spec.requirements[0].statement = 'The system shall <script>alert(1)</script> & [go](javascript:alert(2))';
    spec.decisions[0].question = 'What </td><td>?';
    const html = specConfluenceHtml(spec, META);
    expect(html).not.toMatch(/<script|<img|href="javascript/i);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/td&gt;&lt;td&gt;');
    const doc = specDocxParts(spec, META)['word/document.xml'];
    expect(doc).not.toContain('<script');
    expect(doc).toContain('&lt;script&gt;');
    expect(doc).toContain('Contents');
    expect(doc).toContain('<w:br w:type="page"/>');
  });

  test('the blocks open with the title page and the contents', () => {
    const blocks = specBlocks(draft(), META);
    expect(blocks[0].k).toBe('titlepage');
    expect(blocks[1].k).toBe('toc');
    expect(blocks[2].k).toBe('pagebreak');
  });
});

test('a stored specification without a signed source to compare against is not current (QA 72a895528ffa)', async () => {
  const { specIsStale } = await import('../lib/requirements-spec');
  const summary = { functional: 1, nonFunctional: 1, openDecisions: 0, clarify: 0, accepted: 0, revision: 1, savedAt: '2026-10-04T12:00:00.000Z', derivedFrom: 'abc' };
  expect(specIsStale(null, null)).toBe(false);
  expect(specIsStale(summary, 'abc')).toBe(false);
  expect(specIsStale(summary, 'def')).toBe(true);
  expect(specIsStale(summary, null)).toBe(true);
});
