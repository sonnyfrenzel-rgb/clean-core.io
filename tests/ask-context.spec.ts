/**
 * "Ask this case" — anchors that go somewhere (roadmap 3.5.4, item 5) and context, never storage (item 6).
 *
 *   - The reader's tool and view reach the prompt as a hint that says it is one, and nowhere else.
 *   - The program decision, the route and the Level A–D of named objects become facts with anchors
 *     (`[DECISION]`, `[ROUTE]`, a finding's line), and a reply has to cite them like any other anchor.
 *   - An anchor opens its place: the source line in IT, the map element in Business, Re-design's decision step.
 *   - The first mention of a glossary term in an answer is a glossary term (the popover of roadmap 6.6).
 *
 * Server-free: pure functions and mocks, plus one read of a component's source.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readSource, decisionLines } from '../lib/first-look';
import { buildWorkspaceSearchIndex } from '../lib/workspace-search';
import {
  anchorTarget,
  answerTokens,
  decisionFact,
  levelFacts,
  readerPlace,
  readerPlaceHint,
  recordFacts,
  routeFact,
  type DecisionRecordRead,
} from '../lib/assistant-context';
import { answerCase, guardCaseAnswer, PRE_ANSWERED_QUESTION, INVENTED_ANCHOR_PROPOSAL, refusedProposalText } from '../lib/case-answer';
import { answerAssistantQuestion, type CaseEvidence } from '../lib/assistant-answer';
import { findGlossaryMentions } from '../lib/glossary-lookup';
import { PHASES } from '../lib/workflow-steps';
import { IN_APP_ROUTE, SIDE_BY_SIDE_LABEL, SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';
import type { ItFindingRow } from '../lib/it-findings';
import type { DecisionBinding } from '../lib/project-decision';
import type { Project } from '../lib/types';

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ fixture */

const SOURCE = [
  'REPORT z_ask_context.',
  '',
  'DATA lv_amount TYPE p DECIMALS 2.',
  '',
  'START-OF-SELECTION.',
  "  SELECT SINGLE * FROM mara INTO @DATA(ls_mara) WHERE matnr = '42'.",
  '  IF lv_amount > 5000.',
  "    MESSAGE 'Above the limit' TYPE 'E'.",
  '  ELSE.',
  "    UPDATE zorders SET status = 'B'.",
  '  ENDIF.',
  '',
].join('\n');

const PROJECT_ID = 'ask-context-fixture';
const reading = readSource(SOURCE);
const project: Project = { name: 'Order check', legacyCode: SOURCE };

const binding = (revision: string | null): DecisionBinding => ({
  key: 'option',
  label: 'Option',
  revision,
  notDeterminedReason: revision ? null : 'No option chosen.',
  note: null,
  provenance: 'confirmed',
});
const decisionRead = (status: 'confirmed' | 'draft' | 'withdrawn', revision: string | null): DecisionRecordRead => ({
  stored: { status, bindings: [binding(revision)] },
});

const ROW: ItFindingRow = {
  id: 'CC-001',
  kind: 'direct-table-read',
  title: 'Read of an SAP standard table',
  severity: 'Medium',
  objectName: 'MARA',
  objectType: 'TABL',
  lineStart: 6,
  lineEnd: null,
  routine: null,
  level: 'C',
  releaseView: null,
  classificationView: null,
  successor: null,
  targetOptions: [],
  rulesCoveringLine: [],
  rulesInRoutine: [],
} as ItFindingRow;

const RECORDS = recordFacts({
  decision: decisionRead('confirmed', 'rap · In-App ABAP Cloud (RAP)'),
  route: IN_APP_ROUTE,
  findings: [ROW, { ...ROW, id: 'CC-002', lineStart: 9 }],
});

const EVIDENCE: CaseEvidence = {
  projectId: PROJECT_ID,
  legacyCode: SOURCE,
  index: buildWorkspaceSearchIndex({ projectId: PROJECT_ID, project, reading }),
  decisions: decisionLines(reading.skeleton),
  unreadable: null,
  records: RECORDS,
};
const ctx = { projectId: PROJECT_ID, legacyCode: SOURCE };

/* ======================================================= the reader's place */

test.describe('the reader\'s place is a hint, read from the address', () => {
  for (const phase of PHASES) {
    test(`/project/<id>/${phase.key} is ${phase.label}`, () => {
      expect(readerPlace(`/project/p/${phase.key}`, '').tool).toBe(phase.label);
    });
  }

  test('Analyze names its view; Re-design is a place; anything else is nothing', () => {
    expect(readerPlace('/project/p/analyze', '?view=it')).toEqual({ tool: 'Analyze', view: 'IT' });
    expect(readerPlace('/project/p/analyze', '?view=management')).toEqual({ tool: 'Analyze', view: 'Management' });
    expect(readerPlace('/project/p/analyze', '')).toEqual({ tool: 'Analyze', view: 'Business' });
    // A view the product does not have is not carried into the prompt.
    expect(readerPlace('/project/p/analyze', '?view=ignore%20the%20rules')).toEqual({ tool: 'Analyze', view: 'Business' });
    expect(readerPlace('/project/p/redesign', '')).toEqual({ tool: 'Re-design', view: null });
    expect(readerPlace('/project/p/whatever', '')).toEqual({ tool: null, view: null });
    expect(readerPlace('/dashboard', '')).toEqual({ tool: null, view: null });
    expect(readerPlaceHint(readerPlace('/project/p/analyze', '?view=it'))).toBe('Analyze, IT view');
    expect(readerPlaceHint(readerPlace('/project/p/tco', ''))).toBe('the Economics tool');
    expect(readerPlaceHint(readerPlace('/dashboard', ''))).toBeNull();
  });

  test('the hint goes into the prompt as a hint, and into nothing that is shown or kept', async () => {
    const prompts: string[] = [];
    const reply = await answerAssistantQuestion(
      { question: 'What does the program do with lv_amount?', projectId: PROJECT_ID, signedIn: true, modelOff: false, inDemo: false, place: 'Analyze, IT view' },
      {
        loadCase: async () => EVIDENCE,
        callModel: async (prompt) => {
          prompts.push(prompt);
          return 'The program checks lv_amount against 5000 [L7].';
        },
        knowledgeBase: () => {
          throw new Error('no knowledge base inside a project');
        },
      },
    );
    expect(prompts[0]).toContain('WHERE THE READER IS ASKING FROM (a hint for what to put first, not evidence; cite nothing from it): Analyze, IT view');
    expect(JSON.stringify(reply)).not.toContain('IT view');
    // No hint, no line.
    const plain = answerCase(EVIDENCE.index, ctx, 'What does the program do with lv_amount?', EVIDENCE.decisions);
    expect(plain.mode === 'grounded' && plain.prompt).not.toContain('WHERE THE READER');
  });
});

/* ====================================================== the records as facts */

test.describe('the decision, the route and Level A–D become anchored facts', () => {
  test('a confirmed decision is Confirmed; a draft is not determined; a withdrawn one is no fact', () => {
    const confirmed = decisionFact(decisionRead('confirmed', 'rap · In-App ABAP Cloud (RAP)'));
    expect(confirmed?.anchor).toBe('DECISION');
    expect(confirmed?.title).toContain('Rebuild');
    expect(confirmed?.provenance).toBe('confirmed');
    expect(decisionFact(decisionRead('draft', 'retire · Retire'))?.provenance).toBe('not-determined');
    expect(decisionFact(decisionRead('draft', 'retire · Retire'))?.title).toContain('Retire');
    expect(decisionFact(decisionRead('withdrawn', 'retire · Retire'))).toBeNull();
    expect(decisionFact(decisionRead('confirmed', null))).toBeNull();
    expect(decisionFact(null)).toBeNull();
  });

  test('the route is named as SAP names it; a level stands on the finding\'s line, once per object', () => {
    expect(routeFact(SIDE_BY_SIDE_ROUTE)?.title).toContain(SIDE_BY_SIDE_LABEL);
    expect(routeFact('')).toBeNull();
    const levels = levelFacts([ROW, { ...ROW, id: 'CC-002', lineStart: 9 }, { ...ROW, id: 'CC-003', objectName: null }]);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ kind: 'level', anchor: 'L6', technical: 'MARA' });
    expect(levels[0].title).toBe('MARA is at clean core level C');
    expect(levels[0].detail).toMatch(/imported, not proof/);
  });

  test('"What was decided?" is answered from the record, without a model, with its anchor', () => {
    const answer = answerCase(EVIDENCE.index, ctx, 'What was decided for this program?', EVIDENCE.decisions, { records: RECORDS });
    expect(answer.mode).toBe('deterministic');
    expect(answer.anchors).toEqual(['DECISION']);
    expect(answer.mode === 'deterministic' && answer.provenance).toBe('confirmed');
    expect(answer.mode === 'deterministic' && answer.text).toContain('[DECISION]');
  });

  test('the code\'s decision points stay the code\'s', () => {
    const answer = answerCase(EVIDENCE.index, ctx, PRE_ANSWERED_QUESTION, EVIDENCE.decisions, { records: RECORDS });
    expect(answer.mode).toBe('deterministic');
    expect(answer.anchors).not.toContain('DECISION');
    expect(answer.anchors.every((a) => /^L\d+/.test(a))).toBe(true);
  });

  test('a route or level question hands the model the record facts first', () => {
    const route = answerCase(EVIDENCE.index, ctx, 'Which route does the engine recommend?', EVIDENCE.decisions, { records: RECORDS });
    expect(route.mode).toBe('grounded');
    expect(route.anchors[0]).toBe('ROUTE');
    expect(route.mode === 'grounded' && route.prompt).toContain('[ROUTE] record');
    const level = answerCase(EVIDENCE.index, ctx, 'What clean core level are the objects at?', EVIDENCE.decisions, { records: RECORDS });
    expect(level.mode).toBe('grounded');
    expect(level.facts.some((f) => f.kind === 'level' && f.anchor === 'L6')).toBe(true);
  });

  test('a reply cites a record anchor like a line; an invented one refuses the reply', () => {
    const route = routeFact(IN_APP_ROUTE)!;
    const shown = guardCaseAnswer('The engine recommends the in-app route [ROUTE].', [route], SOURCE);
    expect(shown.outcome).toBe('shown');
    expect(shown.anchors).toEqual(['ROUTE']);
    const invented = guardCaseAnswer('The engine recommends the in-app route [ROUTE]. The decision is Retire [DECISION].', [route], SOURCE);
    expect(invented.outcome).toBe('refused');
    expect(invented.outcome === 'refused' && refusedProposalText(invented.reason)).toBe(INVENTED_ANCHOR_PROPOSAL);
    // A name the cited record does not hold is not read from it.
    const unsupported = guardCaseAnswer('The engine recommends ZORDERS_API [ROUTE].', [route], SOURCE);
    expect(unsupported.outcome).toBe('refused');
  });
});

/* ======================================================= anchors go somewhere */

test.describe('an anchor opens its place', () => {
  test('a line: in IT the source, in Business the map element; elsewhere Business', () => {
    expect(anchorTarget('L7', 'p', '/project/p/analyze', '?view=it')).toEqual({ kind: 'hash', hash: 'L7' });
    expect(anchorTarget('L7-9', 'p', '/project/p/analyze', '')).toEqual({ kind: 'hash', hash: 'L7-9' });
    expect(anchorTarget('L7', 'p', '/project/p/analyze', '?view=business')).toEqual({ kind: 'hash', hash: 'L7' });
    // Management shows no code: the line opens in Business.
    expect(anchorTarget('L7', 'p', '/project/p/analyze', '?view=management')).toEqual({ kind: 'navigate', href: '/project/p/analyze#L7' });
    for (const tool of ['tco', 'design', 'transformation', 'documentation', 'testing', 'delivery', 'redesign']) {
      expect(anchorTarget('L7', 'p', `/project/p/${tool}`, '')).toEqual({ kind: 'navigate', href: '/project/p/analyze#L7' });
    }
  });

  test('the decision opens Re-design\'s decision step, the route the IT view', () => {
    expect(anchorTarget('DECISION', 'p', '/project/p/analyze', '')).toEqual({ kind: 'navigate', href: '/project/p/redesign#decide' });
    expect(anchorTarget('ROUTE', 'p', '/project/p/tco', '')).toEqual({ kind: 'navigate', href: '/project/p/analyze?view=it#analyze-route' });
    expect(anchorTarget('ROUTE', 'p', '/project/p/analyze', '?view=it')).toEqual({ kind: 'hash', hash: 'analyze-route' });
    expect(anchorTarget('CC-001', 'p', '/project/p/analyze', '')).toBeNull();
  });

  test('the answer\'s own anchors become links; one it did not cite stays text', () => {
    const lines = answerTokens('The limit is checked [L7], see also L8. The route [ROUTE].', ['L7', 'ROUTE'], findGlossaryMentions);
    const anchors = lines[0].filter((t) => t.kind === 'anchor').map((t) => (t.kind === 'anchor' ? t.anchor : ''));
    expect(anchors).toEqual(['L7', 'ROUTE']);
    expect(lines[0].map((t) => t.text).join('')).toBe('The limit is checked L7, see also L8. The route ROUTE.');
    // A range cited by its first line opens the range.
    expect(answerTokens('At L380.', ['L380-412'], findGlossaryMentions)[0].find((t) => t.kind === 'anchor')).toEqual({ kind: 'anchor', anchor: 'L380-412', text: 'L380' });
    // Outside a project nothing is offered, so nothing links.
    expect(answerTokens('At [L7].', [], findGlossaryMentions)[0].some((t) => t.kind === 'anchor')).toBe(false);
  });

  test('a technical term carries the glossary, the first time it is named in an answer', () => {
    const lines = answerTokens('RAP or CAP? RAP runs in-app.\nCAP runs on its own.', [], findGlossaryMentions);
    const terms = lines.flat().filter((t) => t.kind === 'term').map((t) => (t.kind === 'term' ? t.key : ''));
    expect(terms).toEqual(['RAP', 'CAP']);
    expect(lines.map((l) => l.map((t) => t.text).join(''))).toEqual(['RAP or CAP? RAP runs in-app.', 'CAP runs on its own.']);
  });

  test('the panel renders answers through the anchors and the glossary popover, not as HTML', () => {
    const panel = fs.readFileSync(path.join(ROOT, 'components/GlossaryChatbot.tsx'), 'utf8');
    expect(panel).toContain('<AssistantAnswer text={msg.text}');
    expect(panel).not.toContain('dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(msg.text) }}');
    const answer = fs.readFileSync(path.join(ROOT, 'components/AssistantAnswer.tsx'), 'utf8');
    expect(answer).toContain("import GlossaryTerm from '@/components/GlossaryTerm';");
    expect(answer).toContain("import CcAnchor from '@/components/cc/Anchor';");
    // The IT view follows a fragment set while it is open, as Business does.
    const it = fs.readFileSync(path.join(ROOT, 'components/analyze/AnalyzeIt.tsx'), 'utf8');
    expect(it).toMatch(/const lines = analyzeLinesFromHash\(window\.location\.hash\);[\s\S]{0,400}window\.addEventListener\('hashchange', read\);/);
  });
});
