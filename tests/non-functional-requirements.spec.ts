import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { anchorHolds, anchorList, buildRequirementSet, sourceLines } from '../lib/functional-requirements';
import {
  NFR_CATEGORIES,
  NFR_MODEL_KEY,
  buildNfrSet,
  nfrProposalPrompt,
  proposalReferences,
  type NfrSet,
} from '../lib/non-functional-requirements';
import {
  NFR_PROVENANCE_NOTE,
  PROVENANCE_NOTE,
  nfrDocxParts,
  nfrHtml,
  nfrMarkdown,
  nfrQuestionText,
  nfrText,
  specificationDocxParts,
  specificationHtml,
  specificationMarkdown,
} from '../lib/requirements-export';

/**
 * The non-functional requirements of the Design stage are read from the code,
 * not written by a model (owner 03.10.2026: "no longer AI slop … clear
 * language, copy options").
 *
 * Pure: the builder, the exports and the proposal check, on the two example
 * programs the owner named and the demo's large example. No server, no model.
 */

const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');

const EXAMPLES = ['Z_MM_PO_APPROVAL.abap', 'Z_SALES_ORDER_CREATOR.txt', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'] as const;
const META = { projectName: 'Fixture', fileName: 'fixture.abap', date: '2026-10-03' };

for (const file of EXAMPLES) {
  test.describe(file, () => {
    const source = read(file);
    const lines = sourceLines(source);
    const set: NfrSet = buildNfrSet({ source });

    test('every grounded requirement has an ID, a category, a "shall" sentence, a priority and an anchor that exists in the source', () => {
      expect(set.requirements.length).toBeGreaterThan(1);
      set.requirements.forEach((r, i) => {
        expect(r.id).toBe(`NFR-${String(i + 1).padStart(2, '0')}`);
        expect(NFR_CATEGORIES).toContain(r.category);
        expect(r.statement).toMatch(/^(The new solution shall|While the old program and the new solution run side by side, only one of them shall|The switch shall) \S/);
        expect(r.statement.endsWith('.')).toBe(true);
        expect(r.rationale).toMatch(/^Because /);
        expect(['must', 'should', 'could']).toContain(r.priority);
        expect(r.priorityReason.length).toBeGreaterThan(10);
        expect(r.anchors.length, r.id).toBeGreaterThan(0);
        for (const a of r.anchors) expect(anchorHolds(a, lines), `${r.id} L${a.lineStart}`).toBe(true);
        expect(r.provenance).toBe('reconstructed');
        expect(r.acceptance.length).toBeLessThanOrEqual(3);
        // No service level, volume or retention period is ever a found requirement.
        expect(r.statement).not.toMatch(/\b\d+(?:[.,]\d+)?\s*(%|ms|seconds? response|hours?|days?|years?|months?)\b|availability|99[.,]\d/i);
      });
      // Requirements come in category order.
      const order = set.requirements.map((r) => NFR_CATEGORIES.indexOf(r.category));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(set.dropped).toEqual([]);
    });

    test('what the code cannot know is a question, listed apart, with the evidence that prompts it', () => {
      expect(set.questions.length).toBeGreaterThan(2);
      set.questions.forEach((x, i) => {
        expect(x.id).toBe(`TBD-${String(i + 1).padStart(2, '0')}`);
        expect(x.question.trim().endsWith('?')).toBe(true);
        expect(x.evidence.length).toBeGreaterThan(20);
        expect(['business', 'it-operations']).toContain(x.owner);
        expect(x.provenance).toBe('not-determined');
        for (const a of x.anchors) expect(anchorHolds(a, lines)).toBe(true);
      });
      // Service levels and volumes are always asked, never answered.
      expect(set.questions.some((x) => x.category === 'performance' && /how many records/i.test(x.question))).toBe(true);
      // A question is never also a requirement.
      const statements = new Set(set.requirements.map((r) => r.statement));
      for (const x of set.questions) expect(statements.has(x.question)).toBe(false);
    });

    test('the overview agrees with the lists, category by category', () => {
      expect(set.categories.map((c) => c.category)).toEqual([...NFR_CATEGORIES]);
      for (const c of set.categories) {
        const grounded = set.requirements.filter((r) => r.category === c.category).length;
        const asked = set.questions.filter((x) => x.category === c.category).length;
        expect(c.grounded, c.category).toBe(grounded);
        expect(c.questions, c.category).toBe(asked);
        expect(c.status, c.category).toBe(grounded ? 'grounded' : asked ? 'decision' : 'none');
      }
      expect(set.counts.total).toBe(set.requirements.length);
      expect(set.counts.questions).toBe(set.questions.length);
      expect(set.counts.categoriesGrounded).toBe(set.categories.filter((c) => c.grounded).length);
    });

    test('copy and every export carry every requirement and question with its anchors and the provenance note', () => {
      const docs = [nfrMarkdown(set, META), nfrHtml(set, META), nfrDocxParts(set, META)['word/document.xml']];
      for (const doc of docs) {
        expect(doc).toContain(NFR_PROVENANCE_NOTE.slice(0, 60));
        for (const r of set.requirements) {
          expect(doc, r.id).toContain(r.id);
          expect(doc, `${r.id} anchors`).toContain(anchorList(r.anchors));
        }
        for (const x of set.questions) expect(doc, x.id).toContain(x.id);
      }
      for (const r of set.requirements) {
        const one = nfrText(r);
        expect(one.startsWith(r.id)).toBe(true);
        expect(one).toContain(r.statement);
        expect(one).toContain(`Lines: ${anchorList(r.anchors)}`);
        expect(one).toContain('Provenance: reconstructed from the code');
      }
      for (const x of set.questions) {
        const one = nfrQuestionText(x);
        expect(one.startsWith(x.id)).toBe(true);
        expect(one).toContain('Provenance: not determined');
      }
    });

    test('the one specification carries the functional and the non-functional requirements, each with its lines', () => {
      const fr = buildRequirementSet({ source });
      const docs = [specificationMarkdown(fr, set, META), specificationHtml(fr, set, META), specificationDocxParts(fr, set, META)['word/document.xml']];
      for (const doc of docs) {
        expect(doc).toContain(PROVENANCE_NOTE.slice(0, 60));
        expect(doc).toContain(NFR_PROVENANCE_NOTE.slice(0, 60));
        for (const r of fr.requirements) expect(doc, r.id).toContain(anchorList(r.anchors));
        for (const r of set.requirements) {
          expect(doc, r.id).toContain(r.id);
          expect(doc, `${r.id} anchors`).toContain(anchorList(r.anchors));
        }
        for (const x of set.questions) expect(doc, x.id).toContain(x.id);
      }
      // The functional questions the non-functional ones ask more precisely are not asked twice.
      const md = docs[0];
      for (const o of fr.open.filter((o) => ['authorization', 'retention', 'volume'].includes(o.topic))) expect(md).not.toContain(`| ${o.id} |`);
      for (const o of fr.open.filter((o) => !['authorization', 'retention', 'volume'].includes(o.topic))) expect(md).toContain(`| ${o.id} |`);
    });
  });
}

test('the purchase-order approval: authorization, records, errors and the switch are grounded in their lines', () => {
  const source = read('Z_MM_PO_APPROVAL.abap');
  const set = buildNfrSet({ source });
  const auth = set.requirements.find((r) => r.signal === 'authority-check')!;
  expect(auth.statement).toContain('M_BANF_EKG');
  expect(auth.statement).toContain("ACTVT '02'");
  expect(auth.statement).toContain('E002');
  expect(auth.anchors.some((a) => a.quote.startsWith("AUTHORITY-CHECK OBJECT 'M_BANF_EKG'"))).toBe(true);

  const record = set.requirements.find((r) => r.signal === 'record-table')!;
  expect(record.statement).toContain('ZMM_PO_APPR');
  expect(record.statement).toMatch(/ERDAT and ERZET/);
  // A row with a creation date and nothing else is not an audit record.
  expect(set.requirements.some((r) => r.signal === 'record-table' && r.objects.includes('ZMM_PO_ATTACH'))).toBe(false);

  const tolerated = set.requirements.find((r) => r.signal === 'tolerated-failure')!;
  expect(tolerated.statement).toContain('GUI_UPLOAD');
  expect(tolerated.statement).toContain('W003');

  expect(set.requirements.find((r) => r.signal === 'bapi-return')?.statement).toContain('BAPI_PO_CREATE1');
  const changes = set.requirements.find((r) => r.signal === 'changes')!;
  for (const name of ['EBAN', 'ZMM_PO_APPR', 'BAPI_PO_CREATE1', 'ME21N']) expect(changes.statement).toContain(name);
  expect(set.requirements.find((r) => r.signal === 'workflow-event')?.statement).toContain('ZAPPROVE');

  // The retry loop stands in a routine nothing calls: not a requirement, but said.
  expect(set.requirements.some((r) => r.signal === 'retry')).toBe(false);
  const errors = set.categories.find((c) => c.category === 'errors')!;
  expect(errors.unreached.some((u) => u.routine === 'LOCK_REQUISITION')).toBe(true);

  // Retention is only questions: the code keeps the rows and sets no period.
  const retention = set.categories.find((c) => c.category === 'retention')!;
  expect(retention.status).toBe('decision');
  expect(set.questions.some((x) => x.category === 'retention' && /How long must rows of ZMM_PO_APPR be kept/.test(x.question) && x.anchors.some((a) => a.lineStart === 450))).toBe(true);
});

test('the sales-order creator: commit or roll back is grounded; what the code is silent on stays a question', () => {
  const set = buildNfrSet({ source: read('Z_SALES_ORDER_CREATOR.txt') });
  const unit = set.requirements.find((r) => r.signal === 'unit-of-work')!;
  expect(unit.statement).toContain('gv_err_count = 0');
  expect(unit.anchors.map((a) => a.lineStart)).toEqual(expect.arrayContaining([86, 88, 95]));
  expect(set.requirements.find((r) => r.signal === 'bapi-return')?.statement).toMatch(/type E or A/);
  // No authority check: a question with the call that changes data, not a requirement.
  expect(set.requirements.some((r) => r.category === 'authorization')).toBe(false);
  expect(set.questions.find((x) => x.category === 'authorization')?.evidence).toContain('no AUTHORITY-CHECK');
  // Nothing about data migration in the code, said as such.
  expect(set.categories.find((c) => c.category === 'migration')?.status).toBe('none');
});

test('the large example: a remote destination resolved from its constant, SELECTs in loops, the update task', () => {
  const set = buildNfrSet({ source: read('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap') });
  expect(set.requirements.find((r) => r.signal === 'remote-call')?.statement).toContain('PRD_CREDIT_RFC');
  expect(set.requirements.find((r) => r.signal === 'select-in-loop')?.statement).toContain('MARA');
  expect(set.requirements.find((r) => r.signal === 'update-task')?.statement).toContain('Z_SD_LEGACY_LOG_WRITE');
});

test.describe('the model’s part: a proposal beside the requirements, never in their place', () => {
  const source = read('Z_MM_PO_APPROVAL.abap');
  const set = buildNfrSet({ source });

  test('boilerplate names nothing of the program and reads as generic', () => {
    expect(proposalReferences('Implement robust monitoring with dashboards, alerts and KPIs (response time, error rate). Use SAP ILM and GoBD retention.', source)).toEqual([]);
    expect(proposalReferences('Z-table migration via ETL for ZSD_* tables.', source)).toEqual([]);
  });

  test('a proposal that names a table or a question of this program says what it names', () => {
    const refs = proposalReferences('TBD-04: keep rows of ZMM_PO_APPR for 10 years (proposal).', source, set.questions.map((x) => x.id));
    expect(refs).toEqual(expect.arrayContaining(['TBD-04', 'ZMM_PO_APPR']));
  });

  test('the prompt hands over what the code says and asks for target values, keeping the eight stored keys', () => {
    const prompt = nfrProposalPrompt(set, '{"projectName":"x"}');
    for (const c of NFR_CATEGORIES) expect(prompt).toContain(`"${NFR_MODEL_KEY[c]}"`);
    expect(prompt).toContain(set.requirements[0].id);
    expect(prompt).toContain(set.questions[0].id);
    expect(prompt).toMatch(/never general advice/);
  });
});
