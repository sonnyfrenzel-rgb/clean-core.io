/**
 * „Ask this case" — an answer that comes out of *this* project's evidence, or
 * no answer at all. Roadmap 6.8, owner decision of 15.09.2026.
 *
 * That decision settled two things, and this module exists because of both:
 *
 *   - **No second chat.** The assistant that already sits in the shell
 *     (`components/GlossaryChatbot.tsx`) is the one that answers inside a
 *     project too. So the project half had to become something the existing
 *     component can call, rather than a new surface with a new prompt and a
 *     second set of habits.
 *   - **Inside a project it answers only from the evidence of that project.**
 *     No world knowledge, no SAP generalities, no estimate. The assistant
 *     outside a project stays what it was — product and SAP help, out of
 *     `lib/chatbot-knowledge.ts`.
 *
 * **What makes that boundary real rather than a sentence in a prompt.** A
 * prompt that says "only use the context below" is a request; a model can
 * decline it silently and the reader cannot tell. So the boundary is drawn
 * twice, on this side of the network:
 *
 *   1. **Retrieval first, and it may veto.** The question is matched against
 *     the project's own index (`lib/workspace-search.ts`, roadmap 6.6) —
 *     elements, rules, findings and source lines. Only facts that carry a
 *     **line anchor** count: an assertion about this code that cannot say
 *     where in the code it stands is unsupported, which is this repo's rule
 *     (`DESIGN.md` §5.1, the same rule `lib/first-look.ts` applies to
 *     traceability), not a preference. Nothing anchored found → `no-evidence`,
 *     and the model is never called. The reader is told so in plain words.
 *   2. **The answer has to cite one of them.** `citedAnchors` reads the model's
 *     reply back and looks for the anchors it was handed. A reply that cites
 *     none of them is discarded rather than displayed — the evidence is shown
 *     instead. That is the only check that survives a model deciding to answer
 *     from memory anyway.
 *
 * Two answers in here never reach a model at all: the pre-answered question of
 * roadmap 2.7 (*where does this program decide?*, read straight off the
 * gateways of the skeleton) and, through the caller, the glossary answer of
 * roadmap 6.6. Both are marked "No model call" where they are shown.
 *
 * **Pure and synchronous.** Nothing here imports `lib/gemini.ts` and nothing
 * here `fetch`es, so the "no model call" claims above are a property of the
 * module graph — `tests/ask-this-case.spec.ts` checks exactly that, the way
 * `tests/workspace-search.spec.ts` checks it for the glossary.
 */

import type { DecisionLine } from './first-look';
import { searchWorkspace, type SearchResult, type SearchResultKind } from './workspace-search';

/**
 * One thing this project's evidence actually says, and where it stands.
 *
 * `anchor` is not nullable on purpose. `SearchResult.anchor` is, because the
 * ⌘K dialog may legitimately offer an element whose anchor the engine could
 * not establish; an *answer* may not be built on one. The narrowing happens
 * once, in `gatherCaseEvidence`, so no caller has to remember the rule.
 */
export interface CaseFact {
  id: string;
  kind: SearchResultKind | 'decision';
  title: string;
  detail: string;
  anchor: string;
}

export interface CaseSearchContext {
  projectId: string;
  legacyCode?: string;
}

/** What `answerCase` decided to do, and why. */
export type CaseAnswer =
  /** Nothing anchored matched. No model call — and no answer invented. */
  | { mode: 'no-evidence'; text: string; facts: readonly CaseFact[]; anchors: readonly string[] }
  /** Answered off the evidence itself. No model call. */
  | { mode: 'deterministic'; text: string; facts: readonly CaseFact[]; anchors: readonly string[] }
  /** Evidence found, but the question needs prose. The model gets *only* this. */
  | { mode: 'grounded'; prompt: string; facts: readonly CaseFact[]; anchors: readonly string[] };

/* ------------------------------------------------------------------ wording */

/**
 * What the reader is told when the project's evidence has nothing to say.
 *
 * It names what was searched and what would help, because "I could not find
 * anything" without either is indistinguishable from a broken feature — the
 * reasoning `tests/claims-honesty-guard.spec.ts` applies to every other
 * "not determined" in this product.
 */
export const NO_CASE_EVIDENCE =
  'Nothing in this project\'s evidence answers that. Inside a project this assistant reads only what the engine found in your code — elements, business rules, findings and source lines — and none of them matched, so there is no grounded answer to give. Naming something out of the code, a rule ID, or a line number such as L120 will find it if it is there.';

/**
 * What the reader is told when a model proposal cited none of the evidence it
 * was given. The proposal is dropped, not shown with a caveat: a sentence
 * about this code that names no line in it is exactly what this step exists
 * to keep off the screen.
 */
export const UNANCHORED_PROPOSAL =
  'The proposal that came back named none of the evidence it was given, so it is not shown — a statement about this code that cannot say where in the code it stands is unsupported. The evidence found for this question is listed below.';

/* -------------------------------------------------------------- the question */

/**
 * Words that carry no search value. Deliberately short: a long stop list
 * starts deleting ABAP (`DATA`, `IF`, `SELECT` are all English words and all
 * things a reader may be asking about).
 */
const STOPWORDS = new Set([
  'what', 'which', 'where', 'when', 'why', 'how', 'who', 'does', 'do', 'did', 'is', 'are', 'was',
  'were', 'the', 'this', 'that', 'these', 'those', 'a', 'an', 'and', 'or', 'but', 'for', 'from',
  'with', 'about', 'into', 'there', 'here', 'can', 'could', 'would', 'should', 'will', 'shall',
  'my', 'our', 'your', 'its', 'it', 'in', 'on', 'of', 'to', 'at', 'by', 'me', 'us', 'you', 'show',
  'tell', 'give', 'explain', 'please', 'code', 'project', 'program',
]);

/** A line reference a reader typed — `L231`, `line 231`. */
const LINE_TOKEN = /^l\d+$/;

/** The same floor `lib/workspace-search.ts` uses for a text scan of the source. */
const MIN_TERM = 3;

/**
 * The terms worth searching for, longest first.
 *
 * Longest first because `searchWorkspace` ranks within one query but not
 * across several: searching "approval" before "limit" puts the more specific
 * hit at the top of the merged list, where a reader looks.
 */
export function questionTerms(question: string): string[] {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 0);

  const kept = tokens.filter(
    (t) => LINE_TOKEN.test(t) || (t.length >= MIN_TERM && !STOPWORDS.has(t)),
  );
  return [...new Set(kept)].sort((a, b) => b.length - a.length);
}

/* ------------------------------------------------------------------ evidence */

/** At most this many facts. More than this stops being evidence and becomes a dump. */
export const MAX_CASE_FACTS = 8;

/**
 * Everything this project's index has to say about the question, anchored only.
 *
 * The glossary kind is dropped here even though it is in the same index: a
 * glossary entry is general SAP knowledge, which is precisely what an in-project
 * answer may not be built on. The caller answers a glossary question *before*
 * it gets here (roadmap 6.6), where it is labelled as coming from the glossary.
 */
export function gatherCaseEvidence(
  index: readonly SearchResult[],
  context: CaseSearchContext,
  question: string,
): CaseFact[] {
  const facts: CaseFact[] = [];
  const seen = new Set<string>();

  for (const term of questionTerms(question)) {
    for (const hit of searchWorkspace(index, context, term)) {
      if (hit.kind === 'glossary') continue;
      if (!hit.anchor) continue;
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      facts.push({
        id: hit.id,
        kind: hit.kind,
        title: hit.title,
        detail: hit.detail,
        anchor: hit.anchor,
      });
      if (facts.length >= MAX_CASE_FACTS) return facts;
    }
  }
  return facts;
}

/** The anchors of a set of facts, in order, without repeats. */
export function anchorsOf(facts: readonly CaseFact[]): string[] {
  return [...new Set(facts.map((f) => f.anchor))];
}

/* ------------------------------------------- the question answered in advance */

/**
 * Roadmap 2.7 — the question the workspace answers before anybody asks it,
 * "aus den Verzweigungen des Codes, ohne Modellaufruf".
 *
 * The decisions come from the skeleton's gateways, which `lib/first-look.ts`
 * has already read for the first-look build-up; reading them a second time
 * here would be the second-computation defect that file names. Returns `null`
 * when the source branches nowhere — there is then no question to pre-answer,
 * and offering one with the answer "none" would be a chip that teaches nothing.
 */
export const PRE_ANSWERED_QUESTION = 'Where does this program decide?';

export function preAnsweredDecisionAnswer(
  decisions: readonly DecisionLine[],
): { question: string; text: string; facts: CaseFact[] } | null {
  const anchored = decisions.filter((d) => d.anchor);
  if (anchored.length === 0) return null;

  const facts: CaseFact[] = anchored.map((d) => ({
    id: `decision:${d.nodeId}`,
    kind: 'decision',
    title: d.label,
    detail: d.branches.length > 0 ? d.branches.join(' / ') : 'no branch condition written on the edges',
    anchor: d.anchor as string,
  }));

  const count = anchored.length;
  const head = `This program branches in ${count} ${count === 1 ? 'place' : 'places'}, all read from the code:`;
  const lines = facts.map((f) => `${f.anchor} — ${f.title} (${f.detail})`);
  return { question: PRE_ANSWERED_QUESTION, text: [head, ...lines].join('\n'), facts };
}

/** The question forms the pre-answered decision answer also covers when typed. */
const DECISION_QUESTION = /\b(decide|decides|decision|decisions|branch|branches|branching|gateway|gateways)\b/i;

/* ----------------------------------------------------------------- the prompt */

/**
 * The only thing the model is told, inside a project.
 *
 * No knowledge base, no glossary dump, no product positioning — the three
 * things the out-of-project prompt carries. What goes in is the reader's
 * question and the anchored facts, and the instruction is to answer from those
 * or to say it cannot. The instruction is still only an instruction; what
 * actually holds the line is `citedAnchors` on the way back.
 *
 * Plain text is demanded rather than Markdown because §3.1 forbids raw Markdown
 * on screen; the reply also goes through `cleanModelText` at the call site, so
 * a model that ignores this is repaired rather than trusted.
 */
export function caseGroundingPrompt(question: string, facts: readonly CaseFact[]): string {
  const evidence = facts
    .map((f) => `- [${f.anchor}] ${f.kind}: ${f.title}${f.detail ? ` — ${f.detail}` : ''}`)
    .join('\n');

  return [
    'You are answering a question about one specific piece of custom ABAP, using only the evidence listed below.',
    '',
    'Rules, in order of importance:',
    '1. Use nothing but the evidence below. No general SAP knowledge, no assumptions about what the program probably does, no estimates, no recommendations that the evidence does not carry.',
    '2. Every statement must name the line anchor it rests on, in square brackets, exactly as written below (for example [L120]).',
    '3. If the evidence below does not answer the question, say so in one sentence and stop. That is a correct answer here, not a failure.',
    '4. Answer in plain sentences. No Markdown, no headings, no bullet characters, no bold.',
    '',
    'EVIDENCE FROM THIS PROJECT:',
    evidence,
    '',
    `QUESTION: ${question}`,
    'ANSWER:',
  ].join('\n');
}

/**
 * Which of the offered anchors a reply actually names.
 *
 * Matched with a word boundary so `L12` does not count as a citation of `L120`,
 * and a range anchor (`L380-412`) is accepted both as written and by its first
 * line, which is how a model usually shortens it.
 */
export function citedAnchors(text: string, anchors: readonly string[]): string[] {
  const haystack = text.toUpperCase();
  return anchors.filter((anchor) => {
    const upper = anchor.toUpperCase();
    if (new RegExp(`\\b${upper}\\b`).test(haystack)) return true;
    const start = upper.split('-')[0];
    return start !== upper && new RegExp(`\\b${start}\\b`).test(haystack);
  });
}

/* ------------------------------------------------------------------ the entry */

/**
 * What to do with one question asked inside a project.
 *
 * The order is retrieval, then the pre-answered question, then the model —
 * never the model first. A caller that gets `no-evidence` or `deterministic`
 * must not call the model at all; that is the whole point, and the browser
 * half of `tests/ask-this-case.spec.ts` asserts it by intercepting
 * `/api/gemini`.
 */
export function answerCase(
  index: readonly SearchResult[],
  context: CaseSearchContext,
  question: string,
  decisions: readonly DecisionLine[] = [],
): CaseAnswer {
  if (DECISION_QUESTION.test(question)) {
    const pre = preAnsweredDecisionAnswer(decisions);
    if (pre) {
      return {
        mode: 'deterministic',
        text: pre.text,
        facts: pre.facts,
        anchors: anchorsOf(pre.facts),
      };
    }
  }

  const facts = gatherCaseEvidence(index, context, question);
  if (facts.length === 0) {
    return { mode: 'no-evidence', text: NO_CASE_EVIDENCE, facts: [], anchors: [] };
  }

  return {
    mode: 'grounded',
    prompt: caseGroundingPrompt(question, facts),
    facts,
    anchors: anchorsOf(facts),
  };
}
