/**
 * "Ask this case" end to end, without a browser, a server or a model
 * (roadmap 3.5.4, items 2, 3 and 8).
 *
 * `answerAssistantQuestion` (`lib/assistant-answer.ts`) is what the panel runs
 * for every question; the model call and the evidence read are handed in, so
 * here they are mocks and every path can be walked:
 *
 *   - a grounded model answer inside a project, from the question to the text
 *     the panel shows, with a mocked reply;
 *   - the answers that need no model — glossary, decision, no evidence — given
 *     with the automatic AI steps off and with no account;
 *   - the three questions that used to be answered from the glossary, answered
 *     from the case;
 *   - outside a project, the same output pipeline (Markdown out, a check
 *     against the knowledge base, the sensitive-text screen) and every failure
 *     said as what it is;
 *   - project detection on every tool route and on Re-design.
 *
 * Server-free: pure functions and mocks.
 */
import { test, expect } from '@playwright/test';
import { readSource, decisionLines } from '../lib/first-look';
import { buildWorkspaceSearchIndex } from '../lib/workspace-search';
import {
  answerAssistantQuestion,
  assistantFailureText,
  assistantProjectId,
  evidenceFailureText,
  guardProductAnswer,
  presentsAbsentPlace,
  productAssistantPrompt,
  ASSISTANT_FAILED,
  ASSISTANT_OFFLINE,
  EVIDENCE_LOAD_FAILED,
  EVIDENCE_NO_ACCESS,
  MODEL_INCOMPLETE,
  MODEL_TIMED_OUT,
  MODEL_UNREACHABLE,
  OWN_KEY_REFUSED,
  OWN_KEY_REFUSED_CODE,
  PRODUCT_ANSWER_REFUSED,
  RATE_LIMITED,
  SIGN_IN_TO_ASK,
  type AssistantDeps,
  type AssistantQuestion,
  type CaseEvidence,
} from '../lib/assistant-answer';
import { NO_CASE_EVIDENCE, INVENTED_ANCHOR_PROPOSAL, PRE_ANSWERED_QUESTION } from '../lib/case-answer';
import { buildKnowledgeBase } from '../lib/chatbot-knowledge';
import { assistantOffNote } from '../lib/messages/model-consent';
import { DEMO_ASSISTANT_NOTICE } from '../lib/demo-marks';
import { OWN_KEY_REJECTED_CODE } from '../lib/byok-key';
import { ATTEMPT_LIMIT_CODE } from '../lib/attempt-limit';
import { MODEL_NETWORK_CODE, MODEL_TIMEOUT_CODE } from '../lib/model-deadline';
import { AUTO_MODEL_STEPS_OFF_CODE } from '../lib/auto-model-steps';
import { NO_KEY_CODE } from '../lib/model-stages';
import { MODEL_INCOMPLETE_CODE } from '../lib/model-completion';
import { PHASES } from '../lib/workflow-steps';
import { PROXY_ONLY_STAGES } from '../lib/model-call-stage';
import { MODEL_STAGES } from '../lib/model-stages';
import { maskFor } from '../lib/sensitive-text';
import type { Project, WorklistItem } from '../lib/types';

/* ------------------------------------------------------------------ fixture */

const SOURCE = [
  'REPORT z_ask_pipeline.',
  '',
  'DATA lv_amount TYPE p DECIMALS 2.',
  '',
  'START-OF-SELECTION.',
  "  SELECT SINGLE * FROM kna1 INTO @DATA(ls_kna1) WHERE kunnr = '0000001000'.",
  '  IF lv_amount > 5000.',
  "    MESSAGE 'Above the limit' TYPE 'E'.",
  '  ELSE.',
  '    PERFORM book_order.',
  '  ENDIF.',
  '',
  'FORM book_order.',
  "  UPDATE zorders SET status = 'B'.",
  'ENDFORM.',
  '',
].join('\n');

const WORKLIST: WorklistItem[] = [
  {
    id: 'CC-001',
    title: 'Custom table write outside a released API',
    category: 'Finding',
    severity: 'High',
    location: 'FORM book_order',
    recommendation: 'Route the write through a released business object.',
    status: 'open',
    effort: 'Medium',
    targetAnchor: 'L14',
  },
];

const PROJECT_ID = 'ask-pipeline-fixture';
const reading = readSource(SOURCE);
const project: Project = { name: 'Order approval', legacyCode: SOURCE, worklist: WORKLIST };
const EVIDENCE: CaseEvidence = {
  projectId: PROJECT_ID,
  legacyCode: SOURCE,
  index: buildWorkspaceSearchIndex({ projectId: PROJECT_ID, project, reading }),
  decisions: decisionLines(reading.skeleton),
  unreadable: null,
};

/** Mocks that record what reached them. A model that is not supposed to be asked throws. */
function mocks(reply: string | Error | null, evidence: CaseEvidence | Error = EVIDENCE) {
  const calls = { model: [] as string[], loads: 0, knowledge: 0 };
  const deps: AssistantDeps = {
    loadCase: async () => {
      calls.loads += 1;
      if (evidence instanceof Error) throw evidence;
      return evidence;
    },
    callModel: async (prompt) => {
      calls.model.push(prompt);
      if (reply === null) throw new Error('the model must not be called on this path');
      if (reply instanceof Error) throw reply;
      return reply;
    },
    knowledgeBase: () => {
      calls.knowledge += 1;
      return buildKnowledgeBase();
    },
  };
  return { deps, calls };
}

const inProject = (question: string, over: Partial<AssistantQuestion> = {}): AssistantQuestion => ({
  question, projectId: PROJECT_ID, signedIn: true, modelOff: false, inDemo: false, ...over,
});
const outside = (question: string, over: Partial<AssistantQuestion> = {}): AssistantQuestion => ({
  question, projectId: null, signedIn: true, modelOff: false, inDemo: false, ...over,
});

/** A refusal shaped like `GeminiCallError` (`lib/gemini.ts`): status and code of the proxy. */
const refusal = (status: number, code?: string, message = 'from the proxy') =>
  Object.assign(new Error(message), { name: 'GeminiCallError', status, code });

/* ======================================================== a grounded answer */

test.describe('inside a project: a grounded model answer, end to end', () => {
  const QUESTION = 'What does the program do with lv_amount?';

  test('the model sees only the anchored evidence, and the reply is shown with its anchors and AI marking', async () => {
    const { deps, calls } = mocks(
      'The program checks lv_amount against 5000 [L7]. **This is a classic pattern.** Contact anna.schmidt@example.com [L7].',
    );
    const reply = await answerAssistantQuestion(inProject(QUESTION), deps);

    expect(calls.model).toHaveLength(1);
    expect(calls.model[0]).toContain(QUESTION);
    expect(calls.model[0]).toContain('[L7]');
    expect(calls.model[0], 'no product knowledge inside a project').not.toContain('Clean-Core.io');
    expect(calls.knowledge, 'the knowledge base is never built inside a project').toBe(0);

    expect(reply?.provenance).toBe('proposed');
    expect(reply?.noModelCall).toBeFalsy();
    expect(reply?.anchors).toEqual(['L7']);
    expect(reply?.evidence?.length).toBeGreaterThan(0);
    expect(reply?.text).toContain('The program checks lv_amount against 5000 [L7].');
    // The unanchored sentence is dropped and said so; Markdown never reaches the screen.
    expect(reply?.text).not.toContain('classic pattern');
    expect(reply?.text).not.toContain('**');
    expect(reply?.text).toMatch(/One sentence of the proposal was removed/);
    // The anchored sentence with an address keeps its anchor; the address is masked.
    expect(reply?.text).not.toContain('anna.schmidt@example.com');
    expect(reply?.text).toContain(maskFor('email'));
  });

  test('an invented anchor refuses the whole reply, and the evidence is listed instead', async () => {
    const { deps } = mocks('The program checks lv_amount [L7]. It also writes at [L99].');
    const reply = await answerAssistantQuestion(inProject(QUESTION), deps);
    expect(reply?.text).toBe(INVENTED_ANCHOR_PROPOSAL);
    expect(reply?.provenance).toBe('not-determined');
    expect(reply?.anchors).toEqual([]);
    expect(reply?.evidence?.length).toBeGreaterThan(0);
  });

  test('a model failure inside a project is said as what it is — never answered from general knowledge', async () => {
    const { deps, calls } = mocks(refusal(429, ATTEMPT_LIMIT_CODE));
    const reply = await answerAssistantQuestion(inProject(QUESTION), deps);
    expect(reply?.text).toBe(RATE_LIMITED);
    expect(reply?.provenance).toBe('not-determined');
    expect(calls.knowledge).toBe(0);
  });
});

/* ============================================== answers that need no model */

test.describe('answers that need no model work with the AI steps off and without an account', () => {
  for (const state of [
    { modelOff: true, signedIn: true, name: 'automatic AI steps off' },
    { modelOff: false, signedIn: false, name: 'signed out' },
  ]) {
    test(`${state.name}: glossary, decision and no-evidence answers are given; nothing calls the model`, async () => {
      const { deps, calls } = mocks(null);
      const over = { modelOff: state.modelOff, signedIn: state.signedIn };

      const glossary = await answerAssistantQuestion(inProject('What is RAP?', over), deps);
      expect(glossary?.source).toBe('glossary');
      expect(glossary?.noModelCall).toBe(true);

      const decision = await answerAssistantQuestion(inProject(PRE_ANSWERED_QUESTION, over), deps);
      expect(decision?.provenance).toBe('reconstructed');
      expect(decision?.noModelCall).toBe(true);
      expect(decision?.anchors?.length).toBeGreaterThan(0);

      const none = await answerAssistantQuestion(inProject('How many licence units will SAP charge us?', over), deps);
      expect(none?.text).toBe(NO_CASE_EVIDENCE);
      expect(none?.noModelCall).toBe(true);

      const glossaryOutside = await answerAssistantQuestion(outside('What is Clean Core?', over), deps);
      expect(glossaryOutside?.source).toBe('glossary');

      expect(calls.model).toEqual([]);
    });
  }

  test('a question that needs the model, with the AI steps off, is told so — with the evidence shown', async () => {
    const { deps, calls } = mocks(null);
    const reply = await answerAssistantQuestion(inProject('What does the program do with lv_amount?', { modelOff: true }), deps);
    expect(reply?.text).toBe(assistantOffNote());
    expect(reply?.noModelCall).toBe(true);
    expect(reply?.evidence?.length).toBeGreaterThan(0);
    expect(calls.model).toEqual([]);
  });

  test('outside a project: signed out gets the sign-in line, AI steps off gets the off note — never "check your key"', async () => {
    const { deps, calls } = mocks(null);
    const signedOut = await answerAssistantQuestion(outside('How do I start a project?', { signedIn: false }), deps);
    expect(signedOut?.text).toBe(SIGN_IN_TO_ASK);
    expect(signedOut?.text).not.toMatch(/key/i);
    const off = await answerAssistantQuestion(outside('How do I start a project?', { modelOff: true }), deps);
    expect(off?.text).toBe(assistantOffNote());
    expect(calls.model).toEqual([]);
    expect(calls.knowledge).toBe(0);
  });

  test('the demo answers past the glossary with its notice, and calls nothing', async () => {
    const { deps, calls } = mocks(null);
    const reply = await answerAssistantQuestion(outside('How does TCO analysis work?', { inDemo: true }), deps);
    expect(reply?.text).toBe(DEMO_ASSISTANT_NOTICE);
    expect(calls.model).toEqual([]);
    expect(calls.loads).toBe(0);
  });
});

/* =================================== the three over-matching questions (item 1) */

test.describe('questions that mention a term are answered from the case, not the glossary', () => {
  for (const question of ['Explain RAP vs CAP', 'How does TCO analysis work?', 'Does this program call a released API?']) {
    test(`"${question}"`, async () => {
      const { deps, calls } = mocks('The evidence does not answer this question.');
      const reply = await answerAssistantQuestion(inProject(question), deps);
      expect(reply?.source).toBeUndefined();
      expect(calls.loads, 'the project evidence was read').toBe(1);
      expect(calls.knowledge).toBe(0);
      // Either nothing in the case matched (said as such, no model), or the
      // model was handed this project's anchored evidence and nothing else.
      if (calls.model.length === 0) {
        expect(reply?.text).toBe(NO_CASE_EVIDENCE);
      } else {
        expect(calls.model[0]).toContain('EVIDENCE FROM THIS PROJECT');
        expect(reply?.evidence?.length).toBeGreaterThan(0);
      }
    });
  }

  test('"Does this program call a released API?" reaches this project\'s finding', async () => {
    const { deps, calls } = mocks('The evidence does not answer this question.');
    await answerAssistantQuestion(inProject('Does this program call a released API?'), deps);
    expect(calls.model).toHaveLength(1);
    expect(calls.model[0]).toContain('Custom table write outside a released API');
  });
});

/* ======================================================== evidence failures */

test.describe('the evidence read', () => {
  test('a failed read is said, and nothing is answered from anything else', async () => {
    const { deps, calls } = mocks(null, new Error('unavailable'));
    const reply = await answerAssistantQuestion(inProject('What does the program do with lv_amount?'), deps);
    expect(reply?.text).toBe(EVIDENCE_LOAD_FAILED);
    expect(calls.model).toEqual([]);
    expect(calls.knowledge).toBe(0);
  });

  test('a refused read says the account may not read the project', () => {
    expect(evidenceFailureText(Object.assign(new Error('x'), { code: 'permission-denied' }))).toBe(EVIDENCE_NO_ACCESS);
    expect(evidenceFailureText(new Error('x'))).toBe(EVIDENCE_LOAD_FAILED);
  });

  test('a project without source says so instead of "no evidence"', async () => {
    const empty: CaseEvidence = { ...EVIDENCE, legacyCode: '', index: [], decisions: [], unreadable: 'No source has been staged.' };
    const { deps } = mocks(null, empty);
    const reply = await answerAssistantQuestion(inProject('What does lv_amount do?'), deps);
    expect(reply?.text).toBe('No source has been staged.');
  });

  test('an answer for a place the reader has left while the model was writing it is dropped', async () => {
    // The reader is still there when the evidence is read and the model is asked; they leave while the model
    // writes. Only the check after the model call can drop this answer.
    let left = false;
    let answer: (text: string) => void = () => undefined;
    const { deps, calls } = mocks(null);
    const pending = answerAssistantQuestion(inProject('What does the program do with lv_amount?'), {
      ...deps,
      callModel: (prompt) => {
        calls.model.push(prompt);
        return new Promise<string>((resolve) => {
          answer = resolve;
        });
      },
      stale: () => left,
    });
    await expect.poll(() => calls.model.length).toBe(1);
    expect(calls.loads).toBe(1);
    left = true;
    answer('The program checks lv_amount against 5000 [L7].');
    expect(await pending).toBeNull();
  });

  test('the same answer is shown when the reader stays', async () => {
    let answer: (text: string) => void = () => undefined;
    const { deps, calls } = mocks(null);
    const pending = answerAssistantQuestion(inProject('What does the program do with lv_amount?'), {
      ...deps,
      callModel: (prompt) => {
        calls.model.push(prompt);
        return new Promise<string>((resolve) => {
          answer = resolve;
        });
      },
      stale: () => false,
    });
    await expect.poll(() => calls.model.length).toBe(1);
    answer('The program checks lv_amount against 5000 [L7].');
    expect((await pending)?.provenance).toBe('proposed');
  });
});

/* ============================================ outside a project: one pipeline */

test.describe('outside a project: the same output pipeline', () => {
  test('the model answer is cleaned, checked against the knowledge base and screened', async () => {
    const { deps, calls } = mocks(
      [
        '**Analyze** is where every project opens.',
        'It saves 40% of the effort.',
        'Open the Live Tenant tab under Testing.',
        'Pricing is on /pricing.',
        'Write to support@example.com for help.',
      ].join(' '),
    );
    const reply = await answerAssistantQuestion(outside('How do I start?'), deps);
    expect(calls.knowledge).toBe(1);
    expect(calls.model).toHaveLength(1);
    expect(calls.model[0]).toContain('How do I start?');
    expect(calls.model[0]).toContain(buildKnowledgeBase().trim().slice(0, 80));

    expect(reply?.provenance).toBe('proposed');
    expect(reply?.text).toContain('Analyze is where every project opens.');
    expect(reply?.text).not.toContain('**');
    expect(reply?.text).not.toContain('40%');
    expect(reply?.text).not.toContain('Live Tenant');
    expect(reply?.text).not.toContain('/pricing');
    expect(reply?.text).not.toContain('support@example.com');
    expect(reply?.text).toContain(maskFor('email'));
    expect(reply?.text).toMatch(/3 sentences were removed/);
  });

  test('a reply with nothing the knowledge base carries is refused, not shown', async () => {
    const { deps } = mocks('It cuts costs by 73%. The premium tier unlocks it.');
    const reply = await answerAssistantQuestion(outside('Is it worth it?'), deps);
    expect(reply?.text).toBe(PRODUCT_ANSWER_REFUSED);
    expect(reply?.provenance).toBe('not-determined');
  });

  test('an empty reply is said as incomplete, never shown as an answer', async () => {
    const { deps } = mocks('   ');
    const reply = await answerAssistantQuestion(outside('Anything?'), deps);
    expect(reply?.text).toBe(MODEL_INCOMPLETE);
  });

  test('a negation binds to its own clause: a place pointed at after a negated one is dropped', () => {
    const kb = buildKnowledgeBase();
    expect(presentsAbsentPlace('There is no sidebar, but open the Live Tenant tab under Testing.')).toBe(true);
    expect(presentsAbsentPlace('There is no sidebar and open the Live Tenant tab under Testing.')).toBe(true);
    expect(presentsAbsentPlace('Open the Live Tenant tab; there is no sidebar.')).toBe(true);
    expect(presentsAbsentPlace('There is no sidebar and no Live Tenant tab.')).toBe(false);
    expect(presentsAbsentPlace('It is not SAP-certified.')).toBe(false);
    // A negation after the place, as its predicate, says it is absent too.
    expect(presentsAbsentPlace('The Live Tenant tab is not available.')).toBe(false);
    expect(presentsAbsentPlace("The sidebar doesn't exist any more.")).toBe(false);
    expect(presentsAbsentPlace('The Live Tenant tab was removed in 3.5.')).toBe(false);
    expect(presentsAbsentPlace('A sidebar no longer exists.')).toBe(false);
    // ... but a predicate that is no negation still points the reader at it.
    expect(presentsAbsentPlace('The Live Tenant tab is where you connect the system.')).toBe(true);
    expect(presentsAbsentPlace('Use the Live Tenant tab, not Settings.')).toBe(true);
    const guarded = guardProductAnswer('There is no sidebar, but open the Live Tenant tab under Testing. Settings holds the connection.', kb);
    expect(guarded.dropped).toBe(1);
    expect(guarded.text).not.toContain('Live Tenant');
  });

  test('a sentence that says a place does not exist is kept', () => {
    const kb = buildKnowledgeBase();
    const guarded = guardProductAnswer('There is no sidebar and no Live Tenant tab. The tenant connection is in Settings.', kb);
    expect(guarded.outcome).toBe('shown');
    expect(guarded.dropped).toBe(0);
  });

  test('the prompt asks for plain text and carries the knowledge base, the glossary names and the question', () => {
    const prompt = productAssistantPrompt('Where is my key?', 'KB-MARKER');
    expect(prompt).toContain('KB-MARKER');
    expect(prompt).toContain('Where is my key?');
    expect(prompt).toContain('Clean Core');
    expect(prompt).toMatch(/No headings, no bold, no tables/);
  });

  test('model failures outside a project are said as what they are', async () => {
    for (const [error, text] of [
      [refusal(401), SIGN_IN_TO_ASK],
      [refusal(429, ATTEMPT_LIMIT_CODE), RATE_LIMITED],
      [refusal(504, MODEL_TIMEOUT_CODE), MODEL_TIMED_OUT],
      [refusal(502, OWN_KEY_REFUSED_CODE), OWN_KEY_REFUSED],
    ] as const) {
      const { deps } = mocks(error);
      const reply = await answerAssistantQuestion(outside('How do I start?'), deps);
      expect(reply?.text).toBe(text);
      expect(reply?.provenance).toBe('not-determined');
    }
  });
});

/* ================================================ every failure, its sentence */

test.describe('a failed model call says what happened', () => {
  test('one sentence per cause', () => {
    expect(assistantFailureText(refusal(401))).toBe(SIGN_IN_TO_ASK);
    expect(assistantFailureText(refusal(429, ATTEMPT_LIMIT_CODE))).toBe(RATE_LIMITED);
    expect(assistantFailureText(refusal(429))).toBe(RATE_LIMITED);
    expect(assistantFailureText(refusal(504, MODEL_TIMEOUT_CODE))).toBe(MODEL_TIMED_OUT);
    expect(assistantFailureText(refusal(504, MODEL_NETWORK_CODE))).toBe(MODEL_TIMED_OUT);
    expect(assistantFailureText(refusal(502, MODEL_NETWORK_CODE))).toBe(MODEL_UNREACHABLE);
    expect(assistantFailureText(refusal(502, OWN_KEY_REJECTED_CODE))).toBe(OWN_KEY_REFUSED);
    expect(assistantFailureText(refusal(502, MODEL_INCOMPLETE_CODE))).toBe(MODEL_INCOMPLETE);
    expect(assistantFailureText(refusal(403, AUTO_MODEL_STEPS_OFF_CODE))).toBe(assistantOffNote());
    expect(assistantFailureText(refusal(503, NO_KEY_CODE, 'No Gemini key is available for this account.'))).toBe(
      'No Gemini key is available for this account.',
    );
    expect(assistantFailureText(refusal(403, undefined, 'MFA verification required.'))).toBe('MFA verification required.');
    expect(assistantFailureText(refusal(500))).toBe(ASSISTANT_FAILED);
    expect(assistantFailureText(new TypeError('Failed to fetch'))).toBe(ASSISTANT_OFFLINE);
  });

  test('the six sentences are six different sentences', () => {
    const all = [SIGN_IN_TO_ASK, RATE_LIMITED, MODEL_TIMED_OUT, OWN_KEY_REFUSED, MODEL_UNREACHABLE, ASSISTANT_FAILED, ASSISTANT_OFFLINE];
    expect(new Set(all).size).toBe(all.length);
    // Only the refused key is about the key.
    for (const text of all.filter((t) => t !== OWN_KEY_REFUSED)) expect(text).not.toMatch(/\bkey\b/i);
  });

  test('the own-key code is the one the proxy sends', () => {
    expect(OWN_KEY_REFUSED_CODE).toBe(OWN_KEY_REJECTED_CODE);
  });

  test('the assistant\'s model calls name the proxy-only stage, which no workflow quota counts', () => {
    expect(PROXY_ONLY_STAGES).toContain('glossary');
    expect((MODEL_STAGES as readonly string[]).includes('glossary')).toBe(false);
  });
});

/* ================================================ where the assistant stands */

test.describe('project detection', () => {
  const ID = 'p-123';
  const routes = [...PHASES.map((p) => `/project/${ID}/${p.key}`), `/project/${ID}/redesign`, `/project/${ID}/design/requirements`, `/project/${ID}`];

  for (const route of routes) {
    test(`${route} is inside the project`, () => {
      expect(assistantProjectId(route)).toBe(ID);
    });
  }

  test('every tool of the tool bar is covered, in its order', () => {
    expect(PHASES.map((p) => p.key)).toEqual(['analyze', 'tco', 'design', 'transformation', 'documentation', 'testing', 'delivery']);
  });

  test('an encoded id is decoded; places outside a project have none', () => {
    expect(assistantProjectId('/project/a%20b/analyze')).toBe('a b');
    for (const route of ['/dashboard', '/projects', '/settings', '/demo/analyze', '/', '', null, undefined]) {
      expect(assistantProjectId(route)).toBeNull();
    }
  });

  test('the shell names the assistant from the same rule', () => {
    // `app/(app)/layout.tsx`: `/^\/project\/[^/]+/` — "Ask this case" exactly where the panel has a project.
    const shell = /^\/project\/[^/]+/;
    for (const route of [...routes, '/dashboard', '/projects', '/demo/analyze']) {
      expect(Boolean(assistantProjectId(route))).toBe(shell.test(route));
    }
  });
});
