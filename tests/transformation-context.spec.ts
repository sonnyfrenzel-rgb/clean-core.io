import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  buildTransformationContext,
  decisionOptionOf,
  TRANSFORMATION_CONTEXT_BUDGET,
  type AcceptedRequirements,
  type ContextRule,
  type TransformationContextInput,
} from '../lib/transformation-context';
import {
  acceptedRequirementsOf,
  assembleTransformationContext,
  REVISION_COLLECTION,
  type RuleAnswers,
} from '../lib/transformation-context-build';
import type { SpecRecord } from '../lib/requirements-spec';
import { PROCESS_REVISION_COLLECTION } from '../lib/process-revisions';
import { contractOfProject } from '../lib/contract-build';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { generationInputsOf, generationRevision, generationStateOf } from '../lib/generation-revision';
import type { StateEntry } from '../lib/process-states';

/**
 * PLATFORM KNOWLEDGE in the code-draft prompts (owner, 12.10.2026; roadmap
 * 3.0.12): the owner's rule decisions, the decision record and route, what the
 * program does, the catalog successors, NFRs and data mode — one compact block
 * within a hard budget, built on the server inside the generation token.
 * Server-free: hand-written fixtures, no emulator.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const rule = (id: string, answer: ContextRule['answer'], note: string | null = null, line = 10): ContextRule => ({
  id,
  condition: `lv_amount > ${id.slice(3)}`,
  meaning: `The code tests lv_amount > ${id.slice(3)} and refuses the item.`,
  answer,
  note,
  line,
});

const baseInput = (over: Partial<TransformationContextInput> = {}): TransformationContextInput => ({
  track: 'node',
  rules: {
    basis: 'confirmations',
    revision: 4,
    items: [
      rule('BR-001', 'keep'),
      rule('BR-002', 'change', 'Use the company code limit from customizing instead of 1000.'),
      rule('BR-003', 'drop', 'Not needed after the move to S/4HANA.'),
      rule('BR-004', null),
      rule('BR-005', 'clarify', 'Does the limit include tax?'),
    ],
  },
  decision: {
    route: { chosen: 'side-by-side-cap', recommended: 'side-by-side-cap', deviationReason: null },
    record: null,
    signedOff: null,
    reference: 'SAP-documented pattern for this target: partly.',
  },
  summary: {
    program: 'ZCTX',
    purpose: ['A read-only report on sales orders (VBAK).'],
    reads: ['sales orders (VBAK)'],
    changes: 'none',
    changesInFlow: [],
    changesOnCommand: [],
    outputs: ['list on screen (L40)'],
    frontEnd: null,
  },
  objects: [
    { object: 'VBAK', level: 'D', successor: 'I_SALESDOCUMENT', successorType: 'CDS View', confidence: 'Catalog Match' },
    { object: 'KNA1', level: 'D', successor: 'API_BUSINESS_PARTNER', successorType: 'OData API', confidence: 'Verified' },
    { object: 'COSP', level: 'C', successor: null, successorType: null, confidence: null },
  ],
  nfr: null,
  accepted: null,
  dataMode: null,
  originalFactsBelow: true,
  ...over,
});

/* ------------------------------------------------------------ decisions */

test('every rule is rendered with the owner\'s decision and what to do with it', () => {
  const { text } = buildTransformationContext(baseInput());
  expect(text).toContain('PLATFORM KNOWLEDGE');
  expect(text).toContain('read from need revision 4 of the confirmed process');
  expect(text).toMatch(/BR-001 KEEP · lv_amount > 001 \(L10\) — The code tests/);
  expect(text).toContain('BR-002 CHANGE · lv_amount > 002 (L10) → implement instead: "Use the company code limit from customizing instead of 1000."');
  expect(text).toContain('BR-003 DROP · lv_amount > 003 (L10) — reason: "Not needed after the move to S/4HANA."');
  expect(text).toContain('BR-004 OPEN · lv_amount > 004 (L10)');
  // A Clarify is a question, and a question is still open (lib/rule-register.ts).
  expect(text).toContain('BR-005 OPEN · lv_amount > 005 (L10) — open question: "Does the limit include tax?"');
  // The instructions per state, in the track's comment syntax.
  expect(text).toContain('KEEP → implement exactly as the original, cite the rule id in a comment');
  expect(text).toContain('CHANGE → implement the decided text, not the original');
  expect(text).toContain('"// BR-nnn dropped on purpose"');
  expect(text).toContain('"// OPEN: BR-nnn awaits a decision"');
  // Decided rules first: CHANGE, DROP, KEEP, then the open ones.
  const at = (s: string) => text.indexOf(s);
  expect(at('BR-002 CHANGE')).toBeLessThan(at('BR-003 DROP'));
  expect(at('BR-003 DROP')).toBeLessThan(at('BR-001 KEEP'));
  expect(at('BR-001 KEEP')).toBeLessThan(at('BR-004 OPEN'));

  const rap = buildTransformationContext(baseInput({ track: 'rap', originalFactsBelow: false })).text;
  expect(rap).toContain('"" OPEN: BR-nnn awaits a decision"');
  expect(rap).not.toContain('FACTS OF THE ORIGINAL below');
  expect(rap).toContain('every check of the legacy code that refuses, stops or skips input stays');
});

test('no confirmed revision means every rule is open, and answers on another source are not applied', () => {
  const open = buildTransformationContext(
    baseInput({ rules: { basis: 'source', revision: null, items: [rule('BR-001', null), rule('BR-002', null)] } }),
  ).text;
  expect(open).toContain('no rule has been answered yet');
  expect(open).toContain('BR-001 OPEN');
  expect(open).not.toMatch(/BR-\d+ (KEEP|CHANGE|DROP)/);
  const moved = buildTransformationContext(baseInput({ rules: { basis: 'source-moved', revision: null, items: [rule('BR-001', null)] } })).text;
  expect(moved).toContain('answers on record were given against an earlier source and are not applied');
});

test('the decision record and route are stated, and loudly when the record builds nothing', () => {
  const deviated = buildTransformationContext(
    baseInput({
      decision: {
        route: { chosen: 'in-app-rap', recommended: 'side-by-side-cap', deviationReason: 'The team runs ABAP Cloud only.' },
        record: { id: 'DEC-1', revision: 2, status: 'confirmed', summary: 'Rebuild in-app.', option: 'rebuild · Rebuild', optionKind: 'rebuild' },
        signedOff: 'rap',
        reference: null,
      },
    }),
  ).text;
  expect(deviated).toContain("chosen against the engine's side-by-side on SAP BTP (Node.js / CAP) — reason on record: \"The team runs ABAP Cloud only.\"");
  expect(deviated).toContain('Decision record DEC-1 revision 2 (confirmed): "Rebuild in-app."; option: rebuild · Rebuild.');
  expect(deviated).not.toContain('!!!');

  const retire = buildTransformationContext(
    baseInput({
      decision: {
        route: { chosen: 'side-by-side-cap', recommended: 'side-by-side-cap', deviationReason: null },
        record: { id: 'DEC-1', revision: 3, status: 'confirmed', summary: 'Switch it off.', option: 'retire · Retire', optionKind: 'retire' },
        signedOff: null,
        reference: null,
      },
    }),
  ).text;
  expect(retire).toContain('!!! THE DECISION ON RECORD IS TO RETIRE THIS PROGRAM — IT BUILDS NOTHING.');
  // A withdrawn record is no longer the decision.
  const withdrawn = buildTransformationContext(
    baseInput({
      decision: {
        route: { chosen: 'side-by-side-cap', recommended: 'side-by-side-cap', deviationReason: null },
        record: { id: 'DEC-1', revision: 3, status: 'withdrawn', summary: 'Switch it off.', option: 'retire · Retire', optionKind: 'retire' },
        signedOff: null,
        reference: null,
      },
    }),
  ).text;
  expect(withdrawn).not.toContain('!!!');
  expect(decisionOptionOf('standard · Move to SAP standard')).toBe('standard');
  expect(decisionOptionOf('do-nothing · Keep')).toBe('keep');
  expect(decisionOptionOf('opt-7 · Something else')).toBeNull();
});

test('what the program does, the successors, NFRs and data mode are said as recorded', () => {
  const text = buildTransformationContext(
    baseInput({
      summary: {
        program: 'ZSD',
        purpose: ['A report on sales orders (VBAK).'],
        reads: ['sales orders (VBAK)'],
        changes: 'changes',
        changesInFlow: [],
        changesOnCommand: ['writes sales order items (VBAP)'],
        outputs: ['list on screen (L538)'],
        frontEnd: 163,
      },
      nfr: [{ topic: 'Audit trail & compliance', text: 'Every change keeps who and when.' }],
    }),
  ).text;
  expect(text).toContain('Changes in the normal run: none.');
  expect(text).toContain("Changes only on a user's command: writes sales order items (VBAP) — an explicit, separate operation");
  expect(text).toContain("Front end: needs a user's session from L163");
  expect(text).toContain('VBAK (level D) → I_SALESDOCUMENT (CDS View), name found in SAP\'s catalog');
  expect(text).toContain("KNA1 (level D) → API_BUSINESS_PARTNER (OData API), curated mapping, not checked against SAP's catalog");
  expect(text).toContain('No successor named in the catalog: COSP (level C).');
  expect(text).not.toMatch(/\bverified\b/i);
  expect(text).toContain('Data mode: not recorded');
  expect(text).toContain('Audit trail & compliance: Every change keeps who and when.');
  expect(text).toContain('proposed with the design by a model, not confirmed');
  const quiet = buildTransformationContext(baseInput()).text;
  expect(quiet).toContain('Changes in SAP: none — it posts, writes and commits nothing.');
  expect(quiet).toContain('Non-functional requirements: not recorded.');
});

/* ------------------------------------------------- accepted requirements */

const ACCEPTED: AcceptedRequirements = {
  by: 'owner@example.com',
  at: '2026-10-12T09:30:00.000Z',
  revision: 7,
  items: [
    { id: 'FR-001', kind: 'functional', category: null, title: 'Refuse amounts over the limit', statement: 'The system shall refuse an item whose amount exceeds the limit.', target: '', method: '' },
    { id: 'NFR-03', kind: 'non-functional', category: 'Audit trail & compliance', title: 'Who changed what', statement: 'The system shall record who changed a result and when.', target: 'Every change recorded', method: 'Audit log review' },
  ],
};

test('accepted requirements replace the model\'s proposals, labelled with who accepted them and when', () => {
  const nfr = [{ topic: 'Monitoring', text: 'A model proposal about dashboards.' }];
  const proposed = buildTransformationContext(baseInput({ nfr })).text;
  expect(proposed).toContain('proposed with the design by a model, not confirmed');
  expect(proposed).toContain('Monitoring: A model proposal about dashboards.');

  const accepted = buildTransformationContext(baseInput({ nfr, accepted: ACCEPTED })).text;
  expect(accepted).toContain('E. ACCEPTED REQUIREMENTS AND DATA:');
  expect(accepted).toContain('Requirements accepted by owner@example.com on 2026-10-12 (requirements specification revision 7)');
  expect(accepted).toContain('FR-001 ACCEPTED (functional) · Refuse amounts over the limit — The system shall refuse an item whose amount exceeds the limit.');
  expect(accepted).toContain('NFR-03 ACCEPTED (non-functional, Audit trail & compliance) · Who changed what — The system shall record who changed a result and when. Target: Every change recorded (measured by Audit log review).');
  expect(accepted).not.toContain('A model proposal about dashboards');
  expect(accepted).not.toContain('proposed with the design by a model');
});

test('the accepted requirements are read from the stored specification, status accepted only', () => {
  const req = (id: string, status: string, kind: 'functional' | 'non-functional' = 'functional') => ({
    id, kind, category: kind === 'non-functional' ? 'audit' : null, title: `Title ${id}`, statement: `The system shall do **${id}**.`,
    rationale: '', acceptance: [], priority: 'must', status, origin: 'engine', target: kind === 'non-functional' ? 'all' : '', method: '', note: '',
    source: { lines: [], rules: [], steps: [], engineRef: null, evidence: '' }, decisionIds: [],
  });
  const record = {
    formatVersion: 1, derivedFrom: 'x', revision: 5, savedAt: '2026-10-11T08:00:00.000Z', savedBy: 'owner@example.com', history: [],
    spec: { requirements: [req('FR-001', 'accepted'), req('FR-002', 'draft'), req('FR-003', 'rejected'), req('NFR-01', 'accepted', 'non-functional')] },
  } as unknown as SpecRecord;
  const read = acceptedRequirementsOf(record)!;
  expect(read.by).toBe('owner@example.com');
  expect(read.at).toBe('2026-10-11T08:00:00.000Z');
  expect(read.revision).toBe(5);
  expect(read.items.map((r) => r.id)).toEqual(['FR-001', 'NFR-01']);
  expect(read.items[0].statement).not.toContain('**');
  expect(read.items[1].category).toBeTruthy();
  expect(acceptedRequirementsOf({ ...record, spec: { requirements: [req('FR-002', 'draft')] } } as unknown as SpecRecord)).toBeNull();
  expect(acceptedRequirementsOf(null)).toBeNull();
});

/* --------------------------------------------------------------- budget */

test('the budget cuts the lowest priority first, open rules before decided ones, and says so', () => {
  const many = Array.from({ length: 60 }, (_, i) => rule(`BR-${String(i + 1).padStart(3, '0')}`, i < 3 ? 'keep' : null, null, 100 + i));
  const nfr = Array.from({ length: 8 }, (_, i) => ({ topic: `Topic ${i}`, text: 'x'.repeat(200) }));
  const input = baseInput({ rules: { basis: 'confirmations', revision: 2, items: many }, nfr });
  const full = buildTransformationContext(input, 100_000);
  expect(full.budget.cut).toEqual([]);

  // Just under the full size: the NFR topics go first.
  const a = buildTransformationContext(input, full.text.length - 100);
  expect(a.text.length).toBeLessThanOrEqual(full.text.length - 100);
  expect(a.budget.cut).toEqual(['requirements']);
  expect(a.text).toMatch(/\(\d+ more topics? — see the requirements in Design\)/);

  // Smaller: the open rules go next, before the successors and the summary.
  const b = buildTransformationContext(input, full.text.length - 2_000);
  expect(b.budget.cut.slice(0, 2)).toEqual(['requirements', 'decisions']);
  expect(b.text).toMatch(/\(\d+ more rules, all OPEN — see the rule register/);
  expect(b.text).toContain('I_SALESDOCUMENT');
  expect(b.text).toContain('A read-only report on sales orders');
  for (const id of ['BR-001', 'BR-002', 'BR-003']) expect(b.text).toContain(`${id} KEEP`);

  // Tight: successors, summary and route lines go, the decided rules stay longest.
  const c = buildTransformationContext(input, 2_200);
  expect(c.text.length).toBeLessThanOrEqual(2_200);
  expect(c.budget.cut).toEqual(expect.arrayContaining(['requirements', 'decisions', 'objects']));
  expect(c.text).toContain('BR-001 KEEP');
  expect(c.text).not.toContain('I_SALESDOCUMENT');
  expect(c.text).toMatch(/more lines? — see Findings in the IT view/);
  // Every section heading survives a cut.
  for (const head of ['A. BUSINESS RULE DECISIONS', 'B. DECISION AND ROUTE', 'C. WHAT THE PROGRAM DOES', 'D. SAP OBJECTS', 'E. NON-FUNCTIONAL', 'F. THE ORIGINAL']) {
    expect(c.text).toContain(head);
  }
  // A decided rule that is cut is counted as decided.
  const d = buildTransformationContext(input, 1_500);
  expect(d.text.length).toBeLessThanOrEqual(1_500);
  expect(d.text).toMatch(/of them decided — see the rule register; never implement a rule against its decision|cut at 1500 characters/);
  expect(TRANSFORMATION_CONTEXT_BUDGET).toBe(8_000);
});

test('accepted requirements are cut after the engine\'s readings, unlike the model\'s proposals', () => {
  const many = Array.from({ length: 40 }, (_, i) => rule(`BR-${String(i + 1).padStart(3, '0')}`, null, null, 100 + i));
  const input = baseInput({ rules: { basis: 'confirmations', revision: 2, items: many }, accepted: ACCEPTED });
  const full = buildTransformationContext(input, 100_000);
  // Open rules go first; the accepted requirements stay.
  const a = buildTransformationContext(input, full.text.length - 300);
  expect(a.budget.cut).toEqual(['decisions']);
  expect(a.text).toContain('FR-001 ACCEPTED');
  expect(a.text).toContain('NFR-03 ACCEPTED');
  // Once an accepted requirement is cut, the successors and the summary are gone already.
  for (let limit = full.text.length; limit > 1_200; limit -= 50) {
    const t = buildTransformationContext(input, limit).text;
    if (!t.includes('NFR-03 ACCEPTED')) {
      expect(t).not.toContain('I_SALESDOCUMENT');
      expect(t).not.toContain('A read-only report on sales orders');
      expect(t).toMatch(/more accepted requirements? — see the requirements specification in Design; implement them too|cut at \d+ characters/);
      break;
    }
  }
});

/* ---------------------------------------------- the server half and the token */

const SOURCE = `REPORT zctx_demo.
PARAMETERS p_amt TYPE p DECIMALS 2.
CONSTANTS gc_limit TYPE p DECIMALS 2 VALUE '1000.00'.
START-OF-SELECTION.
  IF p_amt > gc_limit.
    MESSAGE 'Too high' TYPE 'E'.
  ENDIF.
  IF p_amt < '50.00'.
    MESSAGE 'Below the minimum' TYPE 'E'.
  ENDIF.
  SELECT * FROM vbak INTO TABLE @DATA(lt_orders) UP TO 10 ROWS.
  LOOP AT lt_orders INTO DATA(ls_order).
    IF ls_order-auart = 'TA'.
      WRITE: / ls_order-vbeln.
    ENDIF.
  ENDLOOP.
`;

const answer = (subject: string, state: StateEntry['state'], revision: number, note: string | null = null): StateEntry => ({
  subject,
  kind: 'rule',
  state,
  note,
  account: { uid: 'u1', name: 'Owner' },
  confirmedAt: '2026-10-12T10:00:00.000Z',
  revision,
});

function assembled(answers: RuleAnswers, project: Record<string, unknown> = {}, isAbapCloud = false) {
  const built = contractOfProject({ legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1' }, null);
  if (!built.ok) throw new Error('the fixture builds no contract');
  return {
    built,
    ...assembleTransformationContext({
      source: SOURCE,
      project,
      answers,
      evidence: built.evidence,
      contract: built.contract,
      isAbapCloud,
      grade: () => 'D',
    }),
  };
}

test('the server reads the answers onto the engine\'s rules and stamps both revisions', () => {
  const ids = deriveBusinessRules(SOURCE).rules.map((r) => r.id);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const { context, stamp } = assembled({ basis: 'confirmations', revision: 3, entries: [answer(ids[0], 'keep', 2), answer(ids[1], 'drop', 3, 'The minimum is enforced in the order type.')] });
  expect(context.text).toContain(`${ids[0]} KEEP`);
  expect(context.text).toContain(`${ids[1]} DROP`);
  expect(context.text).toContain('The minimum is enforced in the order type.');
  expect(context.text).toContain('VBAK (level D)');
  expect(stamp.text).toBe(context.text);
  expect(stamp.rules).toMatch(/^confirmations:r3:[0-9a-f]{16}$/);
  expect(stamp.decision).toMatch(/^[0-9a-f]{16}$/);
  const open = assembled({ basis: 'source', revision: null, entries: [] });
  expect(open.context.text).not.toMatch(/BR-\d+ (KEEP|CHANGE|DROP)/);
});

test('a changed rule decision or decision record changes the generation token', () => {
  const ids = deriveBusinessRules(SOURCE).rules.map((r) => r.id);
  const project = { legacyCode: SOURCE, solutionDesign: 'design', analysis: 'analysis' };
  const tokenOf = (a: ReturnType<typeof assembled>, p: Record<string, unknown> = project) =>
    generationRevision(generationStateOf(p, null, a.stamp), a.built.contract.fingerprint);

  const keep = assembled({ basis: 'confirmations', revision: 2, entries: [answer(ids[0], 'keep', 2)] }, project);
  const again = assembled({ basis: 'confirmations', revision: 2, entries: [answer(ids[0], 'keep', 2)] }, project);
  expect(tokenOf(again)).toBe(tokenOf(keep));

  const change = assembled({ basis: 'confirmations', revision: 3, entries: [answer(ids[0], 'change', 3, 'Limit 2000.')] }, project);
  expect(tokenOf(change)).not.toBe(tokenOf(keep));
  // Only the note changed: still another token.
  const changeNote = assembled({ basis: 'confirmations', revision: 3, entries: [answer(ids[0], 'change', 3, 'Limit 3000.')] }, project);
  expect(tokenOf(changeNote)).not.toBe(tokenOf(change));

  // An answer past the budget cut leaves the text alone and still moves the token.
  const sameText = { ...keep.stamp, rules: `${keep.stamp.rules}-other` };
  expect(generationRevision(generationStateOf(project, null, sameText), keep.built.contract.fingerprint)).not.toBe(tokenOf(keep));

  // Accepting a requirement in the specification moves the token too.
  const withAccepted = { ...keep.stamp, requirements: 'abc' };
  expect(generationRevision(generationStateOf(project, null, withAccepted), keep.built.contract.fingerprint)).not.toBe(tokenOf(keep));
  const acceptedStamp = (accepted: AcceptedRequirements | null) => {
    const built = contractOfProject({ legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1' }, null);
    if (!built.ok) throw new Error('no contract');
    return assembleTransformationContext({
      source: SOURCE, project, answers: { basis: 'source', revision: null, entries: [] }, evidence: built.evidence,
      contract: built.contract, isAbapCloud: false, grade: () => 'D', accepted,
    }).stamp;
  };
  const none = acceptedStamp(null);
  const one = acceptedStamp({ ...ACCEPTED, items: ACCEPTED.items.slice(0, 1) });
  const two = acceptedStamp(ACCEPTED);
  expect(none.requirements).toBe('none');
  expect(one.requirements).not.toBe(two.requirements);
  expect(one.text).toContain('FR-001 ACCEPTED');

  const recorded = { ...project, decision: { decisionId: 'DEC-1', revision: 1, status: 'confirmed', summary: 'Rebuild.', fingerprint: 'f1', bindings: [] } };
  const withRecord = assembled({ basis: 'confirmations', revision: 2, entries: [answer(ids[0], 'keep', 2)] }, recorded);
  expect(tokenOf(withRecord, recorded)).not.toBe(tokenOf(keep));
  const confirmedAgain = { ...recorded, decision: { ...recorded.decision, revision: 2, fingerprint: 'f2' } };
  const nextRecord = assembled({ basis: 'confirmations', revision: 2, entries: [answer(ids[0], 'keep', 2)] }, confirmedAgain);
  expect(tokenOf(nextRecord, confirmedAgain)).not.toBe(tokenOf(withRecord, recorded));

  // The inputs hand the page the block the token covers.
  expect(generationInputsOf(generationStateOf(project, null, keep.stamp)).context).toEqual(keep.stamp);
  expect(generationInputsOf(generationStateOf(project, null)).context).toEqual({ text: '', rules: 'none', decision: 'none', requirements: 'none', decisions: [] });
});

/* ------------------------------------------------------------ wiring guards */

test('both prompts carry the block, after the existing inputs, from the token\'s inputs', () => {
  const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
  expect(page).toContain('const platformKnowledge = generation.inputs.context.text;');
  const rap = page.slice(page.indexOf('`You are an elite SAP RAP'), page.indexOf('No conversational text.`', page.indexOf('`You are an elite SAP RAP')));
  const node = page.slice(page.indexOf('`You are an elite Cloud Platform'), page.indexOf('No conversational text.`', page.indexOf('`You are an elite Cloud Platform')));
  for (const prompt of [rap, node]) {
    expect(prompt).toContain('${platformKnowledge}');
    expect(prompt.indexOf('${design}')).toBeLessThan(prompt.indexOf('${platformKnowledge}'));
    expect(prompt.indexOf('${platformKnowledge}')).toBeLessThan(prompt.indexOf('Requirements:'));
  }
  // The client asks for it, and the route builds it only for a generation, in GET and POST alike.
  expect(read('lib/generation-contract-client.ts')).toContain('/contract?for=generation');
  const route = read('app/api/projects/[projectId]/contract/route.ts');
  expect(route).toContain("req.nextUrl.searchParams.get('for') !== 'generation'");
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  const post = route.slice(route.indexOf('export async function POST'));
  for (const half of [get, post]) expect(half).toContain('await platformContextOf(db, projectId, data, built, decision.isAbapCloud)');
});

/** Every module a file reaches through its imports, `@/` and relative alike. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.pop()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = read(rel);
    // Type-only imports load nothing at run time.
    for (const m of src.matchAll(/^\s*(?:import|export)\s(?!type\s)[^;]*?from\s+'([^']+)'/gm)) {
      const spec = m[1];
      let base: string | null = null;
      if (spec.startsWith('@/')) base = spec.slice(2);
      else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(rel), spec);
      if (!base) continue;
      const hit = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => fs.existsSync(path.join(ROOT, c)));
      if (hit && !/\.json$/.test(hit)) queue.push(hit);
    }
  }
  return seen;
}

test('building the block never builds the BPMN map', () => {
  // The owner's condition: more knowledge without slowing everything down. The
  // map has its own worker; the block reads rules, facts and evidence only.
  const pure = read('lib/transformation-context.ts');
  expect(pure).not.toMatch(/^import /m);
  const reached = [...reachable('lib/transformation-context-build.ts')];
  const map = reached.filter((f) => f.startsWith('lib/bpmn/') || f === 'lib/process-map.ts' || /process-map|reading-exports/.test(f));
  expect(map, `the block reaches the map: ${map.join(', ')}`).toEqual([]);
  expect(REVISION_COLLECTION).toBe(PROCESS_REVISION_COLLECTION);
  // And the page adds no engine pass for it: the block arrives as text.
  const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
  expect(page).not.toMatch(/(?:from |import\()'@\/lib\/transformation-context/);
  expect(page).not.toMatch(/(?:from |import\()'@\/lib\/(?:bpmn\/|process-map)/);
});
