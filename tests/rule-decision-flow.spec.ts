import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules, explanationSentences, type RuleSetExplanation } from '../lib/abap/business-rule-set-explain';
import {
  RULE_DECISION_KINDS,
  choiceOf,
  decisionKindOf,
  decisionProblem,
  explanationCoverage,
  ruleFlow,
  startingNote,
  workshopView,
} from '../lib/rule-decision-flow';
import { applyStateChoices, checkStateChoices, type ProcessStateView, type StateEntry } from '../lib/process-states';
import { ruleRegisterFromSource, ruleRegisterFromView, ruleRegisterMarkdown } from '../lib/rule-register';
import { editorRules } from '../lib/rules-editor';
import { plainWordingFor } from '../lib/business-card';
import { machineStringsIn } from './helpers/machine-strings';

/**
 * Roadmap 3.0.20 "with it", part (2) — business rules become a decision and
 * explanation engine (owner report 21.10.2026: a flat list of 67 rows,
 * "Only maximum raw 1000000000 is processed", "Dec 2", "Currency EUR", "Kind
 * REV", "Vendor is empty, or 5 more conditions", the ABAP beside each and "No
 * answer yet").
 *
 * The FI-like and QM-like fixtures under `tests/fixtures/rule-flow/` carry the
 * shapes of that report; the 1,000-line example and the PO demo are the
 * shipped ones. Server-free: the engine, the flow, the register, and the card
 * bundled and rendered to static markup.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const FI = read('tests/fixtures/rule-flow/zfi_vendor_invoice_check.abap');
const QM = read('tests/fixtures/rule-flow/zqm_inspection_result.abap');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const BIG = read('public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');

function explain(source: string): { ex: RuleSetExplanation; reading: ReturnType<typeof readSource> } {
  const reading = readSource(source);
  return { ex: explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source)), reading };
}

const ruleOf = (ex: RuleSetExplanation, label: RegExp, reading: ReturnType<typeof readSource>) => {
  const rule = reading.ruleSet.rules.find((r) => label.test(r.label));
  expect(rule, `no rule labelled ${label}`).toBeTruthy();
  return ex.rules.find((e) => e.id === rule!.id)!;
};

test.describe('the rules explained (3.0.20)', () => {
  test('the shapes of the owner report: a raw cap and a decimals setting are set apart, a constant gets a name in words, a long condition is said whole', () => {
    const { ex, reading } = explain(FI);
    const raw = ruleOf(ex, /c_max_raw/i, reading);
    expect(raw.topic).toBe('technical');
    expect(raw.technical?.text).toContain('1,000,000,000');
    expect(raw.headline).toMatch(/technical setting/);
    expect(raw.proposal.kind).toBe('keep');
    const dec = ruleOf(ex, /c_dec\b/i, reading);
    expect(dec.topic).toBe('technical');
    // "Kind REV" and "Currency EUR" read "REV REV" and "EUR EUR" as titles; the headline names them.
    expect(ruleOf(ex, /c_kind_rev/i, reading).headline).toBe('Kind REV');
    expect(ruleOf(ex, /c_currency/i, reading).headline).toBe('Currency other than EUR');
    // "Supplier number is empty, or 5 more conditions": what it protects names every part.
    const vendor = ruleOf(ex, /lifnr IS INITIAL/i, reading);
    expect(vendor.protects.text).toMatch(/supplier number is empty.*payment terms is empty.*posting date is empty/i);
    expect(vendor.protects.text).toMatch(/stops here/);
    // The technical settings come last, after every business topic.
    expect(ex.topics[ex.topics.length - 1].topic).toBe('technical');
  });

  test('either side of the limit and an example with the values the code holds', () => {
    const { ex, reading } = explain(FI);
    const tolerance = ruleOf(ex, /c_tolerance/i, reading);
    expect(tolerance.example?.text).toBe('Amount 250.01: the rule applies. Amount 250.00: it does not. The code does not say in which currency or unit.');
    expect(tolerance.sides?.holds.text).toBe('Where it holds: the program goes on to “Request approval”.');
    expect(tolerance.sides?.otherwise.text).toBe('Where it does not: the program goes on to “Release payment”.');
    expect(tolerance.proposal.kind).toBe('change-value');
    const days = ruleOf(ex, /gv_days > 45/i, reading);
    expect(days.example?.text).toBe('Days 46: the rule applies. Days 45: it does not.');
    expect(days.proposal.kind).toBe('configure');
    // A company code is a code, not a number: "1000", never "1,000".
    const bukrs = ruleOf(ex, /c_bukrs/i, reading);
    expect(bukrs.example?.text).toContain('Company code 1000');
    expect(bukrs.protects.text).toBe('Only cases with company code 1000 go further; for every other company code the program stops here.');
  });

  test('a CHECK lets the cases through where it holds — the side that stops decides the sentence, not the rule type', () => {
    const { ex, reading } = explain(BIG);
    const check = ruleOf(ex, /waerk <> 'EUR'/i, reading);
    expect(check.sides?.holds.text).toBe('Where it holds: the program goes on with the case.');
    expect(check.sides?.otherwise.text).toBe('Where it does not: the program stops this step for the case.');
    expect(check.protects.text).toBe('Only cases with a document currency other than EUR go further; for EUR the program stops here.');
  });

  test('a rule under an outer branch says the condition it lives under, with its line (QM-06 shape)', () => {
    const { ex, reading } = explain(QM);
    const score = ruleOf(ex, /c_crit_score/i, reading);
    const line = QM.split('\n').findIndex((l) => l.includes("IF gv_first = 'F'.")) + 1;
    expect(score.parents.map((p) => p.anchors[0].lineStart)).toEqual([line]);
    expect(score.where.text).toContain(`(line ${line})`);
    expect(score.where.text).toMatch(/only when “first F”/);
    // An OR holds on either part alone, so the example claims no more than that.
    expect(score.example?.text).toBe('Score 80: the rule applies. Score 79: it does not.');
    expect(ruleOf(ex, /c_log_level/i, reading).topic).toBe('technical');
  });

  test('proposals: a constant nothing reads is dropped, credit status points to the standard, an org unit and a limit move to configuration', () => {
    const po = explain(PO);
    const docType = ruleOf(po.ex, /c_doc_type/i, po.reading);
    expect(docType.proposal.kind).toBe('drop');
    expect(docType.impact.score).toBe(0);
    // The PO demo has includes that are not part of the upload: the reason says to check them first.
    expect(docType.proposal.reason.text).toMatch(/include/);
    expect(ruleOf(po.ex, /werks = '1000'/i, po.reading).proposal.kind).toBe('configure');
    expect(ruleOf(po.ex, /lv_dev_pct > 5/i, po.reading).proposal.kind).toBe('configure');
    const big = explain(BIG);
    const credit = ruleOf(big.ex, /cmgst: 'B'/i, big.reading);
    expect(credit.proposal.kind).toBe('standard');
    expect(credit.proposal.reason.text).toMatch(/SAP Credit Management/);
    expect(credit.topic).toBe('credit');
    expect(ruleOf(big.ex, /TEST\*/, big.reading).proposal.kind).toBe('drop');
  });

  test('ordered by impact: within a topic the weightiest first, topics by their weightiest rule', () => {
    for (const source of [FI, QM, PO, BIG]) {
      const { ex } = explain(source);
      const byId = new Map(ex.rules.map((r) => [r.id, r]));
      const business = ex.topics.filter((t) => t.topic !== 'technical');
      for (let i = 1; i < business.length; i += 1) expect(business[i - 1].impact).toBeGreaterThanOrEqual(business[i].impact);
      for (const t of ex.topics) {
        const scores = t.ruleIds.map((id) => byId.get(id)!.impact.score);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
      }
      expect(new Set(ex.order).size).toBe(ex.rules.length);
    }
  });

  test('every sentence is anchored inside the source, says no ABAP name and no machine string', () => {
    for (const source of [FI, QM, PO, BIG]) {
      const { ex } = explain(source);
      const lines = source.split('\n').length;
      for (const e of ex.rules) {
        for (const s of explanationSentences(e)) {
          expect(s.anchors.length, `${e.id}: ${s.text}`).toBeGreaterThan(0);
          for (const a of s.anchors) {
            expect(a.lineStart).toBeGreaterThan(0);
            expect(a.lineEnd).toBeLessThanOrEqual(lines);
          }
          expect(s.text, `${e.id}: an ABAP name in "${s.text}"`).not.toMatch(/\b(?:gs|gv|lv|ls|lt|gt|cs|is|iv|c|p)_[a-z]\w*|->|=>|<fs_/i);
          expect(machineStringsIn(s.text), `${e.id}: ${s.text}`).toEqual([]);
        }
      }
    }
  });

  test('the measure: every rule of the four programs has a plain explanation and an example with a value from its code', () => {
    for (const source of [FI, QM, PO, BIG]) {
      const { ex, reading } = explain(source);
      const c = explanationCoverage(ex);
      expect(c.explained).toBe(c.rules);
      expect(c.withExample).toBe(c.rules);
      // A real value: the example names a value the rule's own parameters hold, as the code writes it.
      for (const e of ex.rules) {
        const rule = reading.ruleSet.rules.find((r) => r.id === e.id)!;
        const literals = rule.parameters.flatMap((p) => (p.values.length ? p.values : [p.literal])).map((v) => v.replace(/^'|'$/g, '').replace(/\*$/, ''));
        const text = (e.example?.text ?? '').replace(/(\d),(\d)/g, '$1$2');
        expect(literals.some((v) => v !== '' && text.includes(v)), `${e.id}: "${e.example?.text}" names none of ${literals.join(', ')}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ flow */

const ACCOUNT = { uid: 'u1', name: 'Controller A' };

function viewWith(ex: RuleSetExplanation, entries: StateEntry[], revision: number): ProcessStateView {
  return {
    formatVersion: 1,
    revision,
    baselineRevision: 1,
    subjects: ex.rules.map((r) => ({ subject: r.id, kind: 'rule' as const, label: r.id, detail: '', anchor: null })),
    entries,
    links: [],
  };
}

test.describe('the decision in one click, on the record that exists (3.0.20)', () => {
  test('each of the six answers is a choice the route accepts, and reads back as itself — no new field', () => {
    const { ex } = explain(FI);
    const id = ex.rules[0].id;
    for (const kind of RULE_DECISION_KINDS) {
      const note = kind === 'change-value' ? 'Limit 500.00 EUR from 2027.' : kind === 'drop' ? 'No longer needed.' : kind === 'clarify' ? 'Finance: which limit?' : '';
      const choice = choiceOf(id, kind, note);
      const checked = checkStateChoices([choice], { elements: [], rules: ex.rules.map((r) => r.id) });
      expect(checked.ok, `${kind}: ${JSON.stringify(checked)}`).toBe(true);
      const [entry] = applyStateChoices([], [choice], { account: ACCOUNT, confirmedAt: '2026-10-21T10:00:00.000Z', revision: 2 });
      expect(decisionKindOf(entry)).toBe(kind);
      // Only the fields a confirmation already carries.
      expect(Object.keys(entry).sort()).toEqual(['account', 'appliesTo', 'confirmedAt', 'kind', 'note', 'revision', 'state', 'subject', 'valueSource'].sort());
    }
    expect(decisionProblem('drop', '  ')).toBe('note-missing');
    expect(decisionProblem('configure', '')).toBeNull();
  });

  test('taking over a proposal to drop carries the engine reason, so the Drop is reviewable', () => {
    const { ex, reading } = explain(PO);
    const docType = ruleOf(ex, /c_doc_type/i, reading);
    const note = startingNote('drop', docType);
    expect(note).toBe(docType.proposal.reason.text);
    expect(checkStateChoices([choiceOf(docType.id, 'drop', note)], { elements: [], rules: [docType.id] }).ok).toBe(true);
  });

  test('the flow: progress, the next open rule is the weightiest business rule, technical settings answered together', () => {
    const { ex } = explain(FI);
    const empty = ruleFlow(ex, {});
    expect(empty.decided).toBe(0);
    expect(empty.total).toBe(ex.rules.length);
    expect(empty.next).toBe(ex.topics[0].ruleIds[0]);
    expect(empty.openTechnical.length).toBe(2);
    const first = empty.next!;
    const [entry] = applyStateChoices([], [choiceOf(first, 'keep', '')], { account: ACCOUNT, confirmedAt: '2026-10-21T10:00:00.000Z', revision: 2 });
    const after = ruleFlow(ex, { [first]: entry });
    expect(after.decided).toBe(1);
    expect(after.next).not.toBe(first);
  });

  test('the workshop view: open points with the question, decisions off the proposal, the latest session and who decided', () => {
    const { ex } = explain(FI);
    const [a, b, c] = ex.order;
    const older = applyStateChoices([], [choiceOf(a, ex.rules.find((r) => r.id === a)!.proposal.kind, ex.rules.find((r) => r.id === a)!.proposal.kind === 'drop' ? 'x' : (ex.rules.find((r) => r.id === a)!.proposal.kind === 'change-value' ? 'New value' : ''))], { account: ACCOUNT, confirmedAt: '2026-10-14T09:00:00.000Z', revision: 2 });
    const newer = applyStateChoices(older, [choiceOf(b, 'drop', 'Not needed since 2025.'), choiceOf(c, 'clarify', 'Finance: who sets this?')], { account: { uid: 'u2', name: 'Buyer B' }, confirmedAt: '2026-10-21T15:00:00.000Z', revision: 3 });
    const entries = Object.fromEntries(newer.map((e) => [e.subject, e]));
    const w = workshopView(ex, entries);
    expect(w.sessions.map((s) => s.day)).toEqual(['2026-10-21', '2026-10-14']);
    expect(w.latest?.decisions.map((d) => d.id).sort()).toEqual([b, c].sort());
    expect(w.previousDay).toBe('2026-10-14');
    expect(w.open.find((o) => o.id === c)).toMatchObject({ question: 'Finance: who sets this?', askedBy: 'Buyer B' });
    expect(w.open.some((o) => o.id === a)).toBe(false);
    expect(w.byAccount.map((x) => x.name)).toEqual(['Buyer B', 'Controller A']);
    const proposalB = ex.rules.find((r) => r.id === b)!.proposal.kind;
    expect(w.deviations.some((d) => d.id === b)).toBe(proposalB !== 'drop');
  });
});

/* -------------------------------------------------------------- register */

test.describe('the rule register carries the decisions by topic (3.0.20)', () => {
  test('read from the source: every rule by topic, explained, proposal, open', () => {
    const register = ruleRegisterFromSource(FI);
    expect(register.state).toBe('read');
    if (register.state !== 'read') return;
    expect(register.topics?.flatMap((t) => t.rows.map((r) => r.id)).sort()).toEqual(register.rows.map((r) => r.id).sort());
    const md = ruleRegisterMarkdown(register).join('\n');
    expect(md).toContain('## Rules by business topic — explained, with proposal and decision');
    expect(md).toContain('### Technical settings');
    expect(md).toContain('Proposal: Change the value — The code does not say in which currency 250.00 is meant.');
    expect(md).toContain('Decision: None on record — open.');
    // The table and its columns are what they were.
    expect(md).toContain('| Rule | State | Current meaning | Proposal | Decision | Implementation | Test | Evidence | Revision |');
  });

  test('read from the record: the decision in the Business view’s words, with who and when', () => {
    const { ex } = explain(FI);
    const id = ex.order[0];
    const entries = applyStateChoices([], [choiceOf(id, 'configure', 'Customizing table T001 per company code')], { account: ACCOUNT, confirmedAt: '2026-10-21T10:00:00.000Z', revision: 2 });
    const register = ruleRegisterFromView(viewWith(ex, entries, 2), undefined, undefined, FI);
    expect(register.state).toBe('read');
    if (register.state !== 'read') return;
    const row = register.topics?.flatMap((t) => t.rows).find((r) => r.id === id);
    expect(row?.decision).toBe('Move to configuration — by Controller A on 21 Oct 2026: Customizing table T001 per company code');
    // Without the source the register is as it was.
    const bare = ruleRegisterFromView(viewWith(ex, entries, 2));
    expect(bare.state === 'read' && bare.topics).toBeFalsy();
  });
});

/* ---------------------------------------------------------------- render */

async function loadFlow(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'rule-decision-flow', String(process.pid), 'RuleDecisionFlow.cjs');
  await build({
    entryPoints: [path.join(ROOT, 'components', 'workspace', 'RuleDecisionFlow.tsx')],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out).default;
}

async function renderFlow(source: string, owner: boolean, entries: StateEntry[] = []): Promise<string> {
  const Flow = await loadFlow();
  const reading = readSource(source);
  const { ex } = explain(source);
  const rules = editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton));
  const view = viewWith(ex, entries, entries.length ? 2 : 1);
  return renderToStaticMarkup(
    React.createElement(Flow, { projectId: 'p1', source, reading, rules, outcome: { ok: true, view }, view, owner, reload: () => {} }),
  );
}

test.describe('the rules card, rendered (3.0.20)', () => {
  test('the owner sees topics, each rule explained with its proposal, a one-click take-over and the six answers; the code one fold down', async () => {
    const html = await renderFlow(FI, true);
    const { ex } = explain(FI);
    expect(html).toContain('data-rule-flow=""');
    for (const t of ex.topics) expect(html).toContain(`data-rule-topic="${t.topic}"`);
    expect(html).toContain('0 of 8 decided');
    // The topic of the next open rule is open; its rules are explained.
    expect(html).toContain('data-rule-said="protects"');
    expect(html).toContain('data-rule-said="example"');
    expect(html).toContain('data-rule-said="holds"');
    expect(html).toContain('data-rule-said="where"');
    expect(html).toContain('data-rule-take-over=');
    for (const kind of RULE_DECISION_KINDS) expect(html).toContain(`data-rule-decide="${kind}"`);
    expect(html).toContain('The code');
    // One primary per area at most — none here: the take-over is a secondary action (DESIGN.md §1.5).
    expect(html).not.toContain('data-cc-button="primary"');
  });

  test('a reader who is not the owner reads the same explanations and is offered no answer', async () => {
    const html = await renderFlow(FI, false);
    expect(html).toContain('Only the owner can decide or change this.');
    expect(html).toContain('data-rule-said="protects"');
    expect(html).not.toContain('data-rule-take-over=');
    expect(html).not.toContain('data-rule-decide=');
  });

  test('an answer on record shows as the answer, with who — and the flow counts it', async () => {
    const { ex } = explain(FI);
    const id = ex.order[0];
    const entries = applyStateChoices([], [choiceOf(id, 'standard', '')], { account: ACCOUNT, confirmedAt: '2026-10-21T10:00:00.000Z', revision: 2 });
    const html = await renderFlow(FI, true, entries);
    expect(html).toContain('1 of 8 decided');
    expect(html).toContain('data-rule-record="standard"');
    expect(html).toContain('Controller A');
  });
});
