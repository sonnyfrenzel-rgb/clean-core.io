/**
 * The assistant's answer pipeline — "Ask this case" inside a project, the
 * product assistant outside one (`components/GlossaryChatbot.tsx`).
 *
 * The component holds the panel; everything that decides *what* is said lives
 * here, so it can be run and tested without a browser, a server or a model:
 * the model call and the evidence read are handed in.
 *
 * **One order, both places.**
 *
 *   1. The glossary — an explicit "What is …?" or the bare term only
 *      (`glossaryAnswerFor`). No model call.
 *   2. The demo — past the glossary it says it makes no model call, and stops.
 *   3. Inside a project, the project's own evidence (`lib/case-answer.ts`):
 *      "no evidence" and the answers read off the code need no model, so they
 *      are given whether or not the account's automatic AI steps are on and
 *      whether or not a model key exists. Only a question that needs prose
 *      reaches the model, and the reply is read back sentence by sentence.
 *      The knowledge base below is never consulted here, on any path.
 *   4. Outside a project, the product knowledge base
 *      (`lib/chatbot-knowledge.ts`) and the model.
 *
 * **One output pipeline.** Model text, wherever it was asked for, goes through
 * `cleanModelText`, a check against what it was given (the anchored evidence
 * inside a project, the knowledge base outside), and the sensitive-text screen
 * — and carries the AI-generated provenance.
 *
 * **Honest states.** A signed-out visitor is asked to sign in, not to check a
 * key; the account's main switch off is said as such; a rate limit, a timeout,
 * a refused own key and an evidence read that failed each say what happened.
 *
 * No `fetch`, no Firebase, no `lib/gemini.ts` in here: what the model and the
 * project store answer is injected.
 */

import { glossaryAnswerFor } from './glossary-lookup';
import { GLOSSARY_ITEMS } from './glossary';
import {
  answerCase,
  caseSentences,
  droppedSentencesNote,
  guardCaseAnswer,
  refusedProposalText,
  type CaseFact,
} from './case-answer';
import type { DecisionLine } from './first-look';
import type { SearchResult } from './workspace-search';
import { cleanModelText } from './model-text';
import { screenSensitiveText, sensitiveTextNote } from './sensitive-text';
import type { ProvenanceValue } from './provenance';
import { assistantOffNote } from './messages/model-consent';
import { DEMO_ASSISTANT_NOTICE } from './demo-marks';
import { ATTEMPT_LIMIT_CODE } from './attempt-limit';
import { MODEL_NETWORK_CODE, MODEL_TIMEOUT_CODE } from './model-deadline';
import { AUTO_MODEL_STEPS_OFF_CODE } from './auto-model-steps';
import { AUTO_STEPS_OFF_CODE, PROVIDER_NOT_ENABLED_CODE, PROVIDER_SUSPENDED_CODE } from './model-providers';
import { NO_KEY_CODE } from './model-stages';
import { PLATFORM_BUDGET_CODE } from './platform-model-budget';
import { MODEL_INCOMPLETE_CODE } from './model-completion';

/* ------------------------------------------------------------- where it is */

/**
 * The project the assistant stands in, read from the path: `/project/<id>` and
 * every page below it — the seven tools and Re-design — or `null` anywhere
 * else. `app/(app)/layout.tsx` names the assistant from the same expression.
 */
export function assistantProjectId(pathname: string | null | undefined): string | null {
  const match = /^\/project\/([^/?#]+)/.exec(pathname ?? '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * The questions offered outside a project, against the product as it is in
 * 3.5 (`lib/chatbot-knowledge.ts`, `PRODUCT_LAYOUT`): where things are, the
 * decision, sharing, the own key, the tenant connection — and one glossary
 * term, answered from its entry without a model.
 */
export const ASSISTANT_CHIPS: readonly string[] = [
  'Walk me through the seven tools',
  'Where do I decide keep, rebuild or retire?',
  'How do I share a project?',
  'Where do I add my own model key?',
  'Where do I connect my SAP test system?',
  'What is Clean Core?',
];

/* ------------------------------------------------------------------ shapes */

/** One answer of the assistant, as the panel shows it. */
export interface AssistantReply {
  text: string;
  /** Answered from the glossary entry — the panel says so and names the source. */
  source?: 'glossary';
  glossarySource?: string;
  /** Inside a project: the line anchors the answer rests on. */
  anchors?: string[];
  /** The evidence listed under an answer that has to show its working. */
  evidence?: readonly CaseFact[];
  /** Which row of `lib/provenance.ts` this answer is. */
  provenance?: ProvenanceValue;
  /** No model was called for this answer. */
  noModelCall?: boolean;
}

/** What the assistant may read inside one project — read by the caller, from the project store. */
export interface CaseEvidence {
  projectId: string;
  legacyCode: string;
  index: SearchResult[];
  decisions: DecisionLine[];
  /** Why there is no evidence, when there is none — said instead of silence. */
  unreadable: string | null;
  /**
   * The project's records as anchored facts — the program decision, the route, the Level A–D of named objects
   * (`recordFacts` in `lib/assistant-context.ts`). Read for the panel's opening; never written anywhere.
   */
  records?: CaseFact[];
}

export interface AssistantQuestion {
  question: string;
  /** From `assistantProjectId`. */
  projectId: string | null;
  /** Someone is signed in. A model call needs an account; the glossary does not. */
  signedIn: boolean;
  /** The account's main switch "All automatic AI steps" is off: no model call. */
  modelOff: boolean;
  /** The demo: no model call on any screen. */
  inDemo: boolean;
  /**
   * Where the reader asks from — "Analyze, IT view" (`readerPlaceHint`). Inside a project it goes into the prompt
   * as a hint for what to put first, said not to be evidence; it is not stored and not part of any answer's facts.
   */
  place?: string | null;
}

export interface AssistantDeps {
  /** Reads the project's evidence. May throw; the failure is said, never answered around. */
  loadCase: (projectId: string) => Promise<CaseEvidence>;
  /** One model call with the prompt given; throws the proxy's refusal (`status`, `code`). */
  callModel: (prompt: string) => Promise<string>;
  /** The product knowledge base — built only outside a project. */
  knowledgeBase: () => string;
  /** True once the reader has moved on (another project, a new conversation): the answer is dropped. */
  stale?: () => boolean;
}

/* ------------------------------------------------------------------ wording */

/** A signed-out visitor asked something only a model could answer. */
export const SIGN_IN_TO_ASK =
  'Answers written by the model need an account. Sign in (it is free) and ask again — glossary terms such as "What is RAP?" are answered without one.';

/** The model refused: too many questions in a short time. */
export const RATE_LIMITED =
  'Too many questions from this account in a short time, so the model was not asked. Wait a few minutes and ask again.';

/** The model did not answer in time. */
export const MODEL_TIMED_OUT =
  'The model did not answer in time, so the call was stopped and nothing from it is shown. Ask again; a shorter question usually helps.';

/** The provider refused the account's own key. */
export const OWN_KEY_REFUSED =
  'The model provider refused your own model key, so nothing was answered. Check or replace the key in Settings; the platform key is not used instead.';

/** The provider could not be reached. */
export const MODEL_UNREACHABLE =
  'The model service could not be reached just now, so nothing was answered. Ask again in a moment.';

/** The model answered, but not completely. */
export const MODEL_INCOMPLETE =
  'The model\'s answer came back incomplete, so it is not shown. Ask again, or ask a narrower question.';

/** The request never reached the server. */
export const ASSISTANT_OFFLINE =
  'The assistant could not reach the server. Check the connection and ask again.';

/** Anything else the proxy refused without a reason a reader can act on. */
export const ASSISTANT_FAILED =
  'The assistant could not answer just now — the model call failed on the server. Ask again in a moment.';

/** The project's evidence could not be read: nothing is answered from anything else. */
export const EVIDENCE_LOAD_FAILED =
  'The evidence of this project could not be loaded, so there is no grounded answer. Reload the page and ask again.';

/** The reader may not read this project. */
export const EVIDENCE_NO_ACCESS =
  'This account cannot read this project\'s evidence, so nothing can be answered from it.';

/** Every sentence of a product answer made a claim the knowledge base does not carry. */
export const PRODUCT_ANSWER_REFUSED =
  'The answer that came back named places, figures or offers the product does not have, so it is not shown. Ask again, or read the How-to guide (/how-to).';

/** Said when the main switch is off and the question needs a model. */
export function modelOffReply(): AssistantReply {
  return { text: assistantOffNote(), provenance: 'not-determined', noModelCall: true };
}

/* ------------------------------------------------------ errors, said plainly */

interface ProxyRefusal {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

/**
 * What the reader is told when a model call failed — one sentence per cause,
 * read from the proxy's status and code (`app/api/gemini/route.ts`), never
 * "check your key" for a cause that is not the key.
 */
export function assistantFailureText(error: unknown): string {
  const e = (error && typeof error === 'object' ? error : {}) as ProxyRefusal;
  const status = typeof e.status === 'number' ? e.status : null;
  const code = typeof e.code === 'string' ? e.code : null;
  const message = typeof e.message === 'string' ? e.message : '';

  if (status === null) {
    // `fetch` itself failed: the browser is offline or the server is gone.
    return e.name === 'TypeError' || /fetch|network/i.test(message) ? ASSISTANT_OFFLINE : ASSISTANT_FAILED;
  }
  if (status === 401) return SIGN_IN_TO_ASK;
  if (code === ATTEMPT_LIMIT_CODE || status === 429) return RATE_LIMITED;
  if (code === MODEL_TIMEOUT_CODE || (code === MODEL_NETWORK_CODE && status === 504)) return MODEL_TIMED_OUT;
  if (code === OWN_KEY_REFUSED_CODE) return OWN_KEY_REFUSED;
  if (code === MODEL_NETWORK_CODE) return MODEL_UNREACHABLE;
  if (code === MODEL_INCOMPLETE_CODE) return MODEL_INCOMPLETE;
  if (code === AUTO_MODEL_STEPS_OFF_CODE || code === AUTO_STEPS_OFF_CODE) return assistantOffNote();
  // The proxy's own sentence is written for the reader on these: which key is
  // missing, which provider is paused, that the platform budget is used up.
  if (
    (code === NO_KEY_CODE || code === PLATFORM_BUDGET_CODE || code === PROVIDER_SUSPENDED_CODE || code === PROVIDER_NOT_ENABLED_CODE) &&
    message
  ) {
    return message;
  }
  // 403 without a code is the account gate (MFA, Terms, approval); its sentence says which.
  if (status === 403 && message) return message;
  if (status === 504) return MODEL_TIMED_OUT;
  return ASSISTANT_FAILED;
}

/** `lib/byok-key.ts` imports `crypto`, so its code is repeated here; `tests/ask-pipeline.spec.ts` holds the two equal. */
export const OWN_KEY_REFUSED_CODE = 'own-key-rejected';

/** What the reader is told when the project's evidence could not be read. */
export function evidenceFailureText(error: unknown): string {
  const code = (error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined);
  return code === 'permission-denied' ? EVIDENCE_NO_ACCESS : EVIDENCE_LOAD_FAILED;
}

/* ------------------------------------------------- the product answer, checked */

/**
 * Places, offers and parts the product does not have. A sentence that names
 * one as if it existed is dropped. A sentence that says it does *not* exist is
 * kept — that is the knowledge base's own wording.
 */
const ABSENT_PLACES: readonly RegExp[] = [
  /\blive[- ]tenant\b/i,
  /\bside ?bar\b/i,
  /\b(?:premium|paid|pro|enterprise|pilot|business) (?:tier|plan|edition|subscription)s?\b/i,
  /\bsap[- ](?:certified|approved|endorsed)\b/i,
  /\bknowledge hub tab\b/i,
];

const NEGATION = /\b(?:no|not|never|none|without|isn't|aren't|doesn't|don't|cannot|can't)\b/i;

/**
 * A negation that follows the place as its predicate, within a couple of words: "the Live Tenant tab is not
 * available", "a sidebar no longer exists", "the pro plan was removed". An instruction ("open the Live Tenant tab")
 * has no such predicate and stays flagged, and so does "not only … but also".
 */
const NEGATED_AFTER =
  /^(?:\s+[\w-]+){0,2}?\s+(?:(?:is|are|was|were|does|do|has|have)(?:\s+(?:not|no longer)|n't)\b(?!\s+(?:only|just|merely|simply)\b)|no longer\b|(?:was|were|has been|have been) (?:removed|retired|dropped)\b|is gone\b)/i;

/** Where one clause ends and the next begins: a negation in one clause says nothing about the next. */
const CLAUSE_SPLIT = /[;:,]|\s(?:but|and|or|however|while|whereas|yet)\s/i;

/**
 * Whether a sentence presents a place the product does not have as if it existed. The negation has to stand in the
 * same clause, before the place: "There is no sidebar and no Live Tenant tab" says both are absent; "There is no
 * sidebar, but open the Live Tenant tab" points the reader at one.
 */
export function presentsAbsentPlace(sentence: string): boolean {
  for (const clause of sentence.split(CLAUSE_SPLIT)) {
    for (const place of ABSENT_PLACES) {
      const hit = place.exec(clause);
      if (!hit || NEGATION.test(clause.slice(0, hit.index))) continue;
      // The negation can also follow the place as its predicate: "The Live Tenant tab is not available."
      if (NEGATED_AFTER.test(clause.slice(hit.index + hit[0].length))) continue;
      return true;
    }
  }
  return false;
}

export interface GuardedProductAnswer {
  outcome: 'shown' | 'refused';
  text: string;
  /** Sentences dropped because they claimed something the knowledge base does not carry. */
  dropped: number;
}

/**
 * Read a product answer back against the knowledge base it was given — the
 * outside-a-project counterpart of `guardCaseAnswer`. Lexical, like that one:
 *
 *   - a percentage or a money figure the knowledge base does not contain is a
 *     made-up metric — the sentence is dropped;
 *   - an in-app path (`/settings`, `/project/<id>/redesign`) whose first part
 *     the knowledge base never names is a made-up place — dropped;
 *   - a place or offer the product does not have (`ABSENT_PLACES`), named as if
 *     it existed — dropped.
 *
 * Nothing left → refused, and the reader is told why.
 */
export function guardProductAnswer(text: string, knowledgeBase: string): GuardedProductAnswer {
  const kb = knowledgeBase.toLowerCase();
  const kbCompact = kb.replace(/\s/g, '');
  const claimsTooMuch = (sentence: string): boolean => {
    const lower = sentence.toLowerCase();
    const figures = [
      ...lower.matchAll(/\d+(?:[.,]\d+)?\s?%/g),
      ...lower.matchAll(/(?:[$€£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:eur|usd|euros?|dollars?)\b)/g),
    ].map((m) => m[0].replace(/\s/g, ''));
    if (figures.some((f) => !kbCompact.includes(f))) return true;
    const paths = [...lower.matchAll(/(?<![\w.:/])\/([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
    if (paths.some((first) => !kb.includes(`/${first}`))) return true;
    return presentsAbsentPlace(sentence);
  };

  // Line by line, so a list the model wrote keeps its lines.
  let dropped = 0;
  let keptAny = false;
  const lines = text.split('\n').map((line) => {
    if (!line.trim()) return line;
    const sentences = caseSentences(line);
    const kept = sentences.filter((sentence) => !claimsTooMuch(sentence));
    dropped += sentences.length - kept.length;
    if (kept.length > 0) keptAny = true;
    return kept.length === sentences.length ? line : kept.join(' ');
  });

  if (!keptAny) return { outcome: 'refused', text: PRODUCT_ANSWER_REFUSED, dropped };
  return {
    outcome: 'shown',
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    dropped,
  };
}

/** The note under a product answer from which sentences were removed. */
export function droppedProductSentencesNote(dropped: number): string {
  return dropped === 1
    ? 'One sentence was removed because it named a place, figure or offer the product does not have.'
    : `${dropped} sentences were removed because they named places, figures or offers the product does not have.`;
}

/* ------------------------------------------------------------ the two prompts */

/** The glossary in the prompt: the names, not the definitions (they are answered without the model). */
export function glossaryTermList(): string {
  return Object.values(GLOSSARY_ITEMS)
    .map((item) => item.term)
    .join(', ');
}

/** The refusal the model is told to give for a question outside the product's scope. */
export const OFF_TOPIC_REFUSAL =
  'My apologies, but as the Clean-Core.io Assistant I only help with Clean-Core.io and the clean core concepts it works with. I am not SAP product support. Please ask a question about Clean-Core.io or clean core.';

/** The prompt of the product assistant — outside a project only. */
export function productAssistantPrompt(question: string, knowledgeBase: string): string {
  return `You are the Clean-Core.io Assistant. You help the people who use Clean-Core.io — business readers, SAP architects and developers — with the product itself (its tools, views, results and limits) and with the clean core method and concepts it works with. You are NOT SAP product support: for how an SAP product, a release, a licence, an SAP note or a system configuration works, say that this is a question for SAP or the reader's SAP team, and answer only what Clean-Core.io itself does with it.

ABOUT CLEAN-CORE.IO (positioning — always represent it honestly):
- It is a FREE, community-built assessment & modernization assistant. There are no paid, premium, or "pilot" tiers to buy.
- It is COMPLEMENTARY to SAP's own tooling (ADT, ATC, Readiness Check, Signavio) — it does not replace them, and it is NOT affiliated with, endorsed by, or certified by SAP SE. Never claim SAP certification or approval.
- AI output is a DRAFT for human review — never present it as production-ready or as formal SAP, legal or security advice.
Use only the knowledge base below. Do not invent features, places, metrics, prices or percentages that are not in it: a sentence that names one is removed before the answer is shown. If the knowledge base does not cover the question, say so in one sentence.

## GLOSSARY TERMS THIS PRODUCT DEFINES
These are answered from the glossary itself when asked plainly. Do not contradict them.
${glossaryTermList()}

${knowledgeBase}

RULES:
- Questions unrelated to Clean-Core.io or the clean core concepts it works with (cooking, general programming outside SAP, stories, weather, sports and the like) get exactly this reply: "${OFF_TOPIC_REFUSAL}"
- Professional, factual English (or German if the question is in German). Plain sentences; a short list is fine. No headings, no bold, no tables.
- When you name a place in the product, name it as the knowledge base does (for example "Settings, own model key" or "Analyze, tool bar, Economics").

QUESTION: ${question}
ANSWER:`;
}

/* ---------------------------------------------------------------- the entry */

/**
 * Answer one question. Returns `null` when the reader moved on before the
 * answer was ready (`deps.stale`) — the caller then shows nothing.
 *
 * Never throws for a model or evidence failure: each is answered in words.
 */
export async function answerAssistantQuestion(
  ask: AssistantQuestion,
  deps: AssistantDeps,
): Promise<AssistantReply | null> {
  const stale = deps.stale ?? (() => false);

  // 1 — the glossary, for an explicit question only.
  const glossary = glossaryAnswerFor(ask.question);
  if (glossary) {
    return { text: glossary.answer, source: 'glossary', glossarySource: glossary.item.source, noModelCall: true };
  }

  // 2 — the demo promises no model call on every screen.
  if (ask.inDemo) {
    return { text: DEMO_ASSISTANT_NOTICE, noModelCall: true, provenance: 'not-determined' };
  }

  // 3 — inside a project: its evidence, and nothing else, on every path.
  if (ask.projectId) {
    return answerFromCase(ask, ask.projectId, deps, stale);
  }

  // 4 — outside a project: the knowledge base and the model.
  if (!ask.signedIn) return { text: SIGN_IN_TO_ASK, provenance: 'not-determined', noModelCall: true };
  if (ask.modelOff) return modelOffReply();
  const knowledgeBase = deps.knowledgeBase();
  let raw: string;
  try {
    raw = await deps.callModel(productAssistantPrompt(ask.question, knowledgeBase));
  } catch (error) {
    if (stale()) return null;
    return { text: assistantFailureText(error), provenance: 'not-determined' };
  }
  if (stale()) return null;
  return finishProductAnswer(raw, knowledgeBase);
}

async function answerFromCase(
  ask: AssistantQuestion,
  projectId: string,
  deps: AssistantDeps,
  stale: () => boolean,
): Promise<AssistantReply | null> {
  let context: CaseEvidence;
  try {
    context = await deps.loadCase(projectId);
  } catch (error) {
    if (stale()) return null;
    return { text: evidenceFailureText(error), provenance: 'not-determined', noModelCall: true };
  }
  if (stale()) return null;

  const decision = answerCase(
    context.index,
    { projectId, legacyCode: context.legacyCode },
    ask.question,
    context.decisions,
    { records: context.records ?? [], hint: ask.place ?? null },
  );

  if (decision.mode === 'no-evidence') {
    return { text: context.unreadable ?? decision.text, anchors: [], provenance: 'not-determined', noModelCall: true };
  }
  if (decision.mode === 'deterministic') {
    return {
      text: decision.text,
      anchors: [...decision.anchors],
      provenance: decision.provenance ?? 'reconstructed',
      noModelCall: true,
    };
  }

  // Grounded: the question needs prose, and prose needs the model.
  if (!ask.signedIn) return { text: SIGN_IN_TO_ASK, evidence: decision.facts, provenance: 'not-determined', noModelCall: true };
  if (ask.modelOff) return { ...modelOffReply(), evidence: decision.facts };

  let raw: string;
  try {
    raw = await deps.callModel(decision.prompt);
  } catch (error) {
    if (stale()) return null;
    return { text: assistantFailureText(error), evidence: decision.facts, provenance: 'not-determined' };
  }
  if (stale()) return null;
  return finishCaseAnswer(raw, decision.facts, context.legacyCode);
}

/**
 * A model reply inside a project, made fit to show: Markdown out
 * (`cleanModelText`), read back sentence by sentence against the anchored
 * evidence (`guardCaseAnswer` — a sentence without an offered anchor is
 * dropped, an invented anchor refuses the reply), personal data and secrets
 * masked (`screenSensitiveText`).
 */
export function finishCaseAnswer(raw: string, facts: readonly CaseFact[], legacyCode: string): AssistantReply {
  const { text: cleaned } = cleanModelText(raw ?? '', 'screen');
  const guarded = guardCaseAnswer(cleaned, facts, legacyCode);
  if (guarded.outcome === 'refused') {
    return { text: refusedProposalText(guarded.reason), anchors: [], evidence: facts, provenance: 'not-determined' };
  }
  const screened = screenSensitiveText(guarded.text);
  const notes = [
    ...(guarded.dropped > 0 ? [droppedSentencesNote(guarded.dropped)] : []),
    ...(screened.findings.length > 0 ? [sensitiveTextNote(screened.findings)] : []),
  ];
  return { text: [screened.text, ...notes].join('\n\n'), anchors: guarded.anchors, evidence: facts, provenance: 'proposed' };
}

/**
 * A model reply outside a project, through the same three steps: Markdown out,
 * read back against the knowledge base (`guardProductAnswer`), personal data
 * and secrets masked. An empty reply is said as such, never shown as an answer.
 */
export function finishProductAnswer(raw: string, knowledgeBase: string): AssistantReply {
  const { text: cleaned } = cleanModelText(raw ?? '', 'screen');
  if (!cleaned.trim()) {
    return { text: MODEL_INCOMPLETE, provenance: 'not-determined' };
  }
  const guarded = guardProductAnswer(cleaned, knowledgeBase);
  if (guarded.outcome === 'refused') return { text: guarded.text, provenance: 'not-determined' };
  const screened = screenSensitiveText(guarded.text);
  const notes = [
    ...(guarded.dropped > 0 ? [droppedProductSentencesNote(guarded.dropped)] : []),
    ...(screened.findings.length > 0 ? [sensitiveTextNote(screened.findings)] : []),
  ];
  return { text: [screened.text, ...notes].join('\n\n'), provenance: 'proposed' };
}
