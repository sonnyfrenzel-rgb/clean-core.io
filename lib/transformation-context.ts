/**
 * PLATFORM KNOWLEDGE — what Clean-Core.io already knows about a program, as one
 * compact, prioritised block of the Transformation prompt (owner, 12.10.2026;
 * roadmap 3.0.12): *"The transformation must become clearly more intelligent
 * with the prior knowledge we have in the platform, without slowing everything
 * down endlessly."*
 *
 * Until now the code-draft prompt saw the source, the model's analysis and the
 * solution design — and none of what the owner had decided or the engine had
 * read: which rules to keep, change or drop, the decision on record, what the
 * program changes and on whose command, the released successors the catalog
 * names, the non-functional requirements and the data mode. The model then
 * re-derived what was already on record, or invented it.
 *
 * Six sections, in priority order (owner, 12.10.2026; roadmap 3.0.12):
 *   1. the business rule decisions — KEEP / CHANGE / DROP / OPEN per rule;
 *   2. the decision record and the route, loudly when the record builds nothing;
 *   3. what the program does (the business summary facts, ADR-098);
 *   4. the SAP objects with the released successors the catalog names;
 *   5. the requirements the owner accepted (else the model's NFR proposals)
 *      and the data mode, as recorded;
 *   6. a pointer to the FACTS OF THE ORIGINAL section (not repeated here).
 *
 * **Budget.** A hard character budget for the whole block. When the block is
 * longer, the lowest-priority section loses its last items first, then the
 * next one up, and every cut is stated in the text ("n more rules — see the
 * rule register"); a section with nothing left keeps its heading and one line
 * saying where the rest is. Decisions are cut last, and inside them the open
 * rules before the decided ones.
 *
 * Pure: no React, no network, no engine, no model. The server assembles the
 * input (`lib/transformation-context-build.ts`) and the contract route hands
 * the text to the page inside `generation.inputs`, so the generation token
 * covers it.
 */

/** The block's character budget (owner, 12.10.2026; roadmap 3.0.12). See the measurement in the commit. */
export const TRANSFORMATION_CONTEXT_BUDGET = 8_000;

/** Longest condition, meaning and owner text one rule line carries. */
const MAX_CONDITION = 120;
const MAX_MEANING = 160;
const MAX_PROPOSAL = 400;
/** Longest NFR text per topic. */
const MAX_NFR = 220;

export type ContextTrack = 'node' | 'rap';

export type RuleDecisionWord = 'KEEP' | 'CHANGE' | 'DROP' | 'OPEN';

/** One business rule with the owner's answer, as the rule register holds it. */
export interface ContextRule {
  /** `BR-001`. */
  id: string;
  /** The first condition as written — code. */
  condition: string;
  /** What the rule does today, the engine's sentence. */
  meaning: string;
  /** The answer on record; `clarify` and none are open. */
  answer: 'keep' | 'change' | 'drop' | 'clarify' | null;
  /** The account's text with the answer: the new rule (Change), the reason (Drop), the question (Clarify). */
  note: string | null;
  /** First source line, or null. */
  line: number | null;
}

export interface ContextRules {
  /**
   * `confirmations` — the confirmed need revision exists and was read;
   * `source` — no process revision yet, every rule is open;
   * `source-moved` — answers were given against another source and are not applied;
   * `not-read` / `not-detected` — no rows.
   */
  basis: 'confirmations' | 'source' | 'source-moved' | 'not-read' | 'not-detected';
  /** The need revision the answers come from, or null. */
  revision: number | null;
  /** Why there are no rows, for `not-read`. */
  reason?: string | null;
  items: ContextRule[];
}

export type DecisionOptionWord = 'keep' | 'rebuild' | 'standard' | 'retire';

export interface ContextDecision {
  route: {
    /** What generation follows. */
    chosen: 'in-app-rap' | 'side-by-side-cap';
    recommended: 'in-app-rap' | 'side-by-side-cap';
    /** The declared reason when `chosen` departs from `recommended`. */
    deviationReason: string | null;
  };
  /** The stored decision record (roadmap 8.4), or null when none is stored. */
  record: {
    id: string;
    revision: number;
    status: string;
    summary: string;
    /** The option binding as recorded ("optionId · label"), or null when none is chosen. */
    option: string | null;
    /** The option the record's text names, read by `decisionOptionOf`. */
    optionKind: DecisionOptionWord | null;
  } | null;
  /** The signed-off architecture code (`rap`, `cap`, `retire` …), or null. */
  signedOff: string | null;
  /** "SAP-documented pattern for this target: yes (RA0001 …)." — or null when no target is known. */
  reference: string | null;
}

/** What the program does, from the business summary facts (ADR-098). */
export interface ContextSummary {
  program: string | null;
  /** The purpose sentence(s) of `programSummary`. */
  purpose: string[];
  /** Business objects it reads, in words with their table. */
  reads: string[];
  changes: 'changes' | 'none' | 'not-determined';
  /** Writes and changing calls in the normal run. */
  changesInFlow: string[];
  /** Writes and changing calls reached only from a user's command. */
  changesOnCommand: string[];
  outputs: string[];
  /** The first line that needs a user's front end, or null. */
  frontEnd: number | null;
}

export interface ContextObject {
  /** The object the code uses (table, function, class), upper case. */
  object: string;
  /** Clean core level A–D, or null when not determined. */
  level: string | null;
  /** The released successor the catalog names, or null. */
  successor: string | null;
  successorType: string | null;
  /** `Catalog Match` — SAP's catalog lists the name; `Verified` — a curated mapping. */
  confidence: string | null;
}

export interface TransformationContextInput {
  track: ContextTrack;
  rules: ContextRules;
  decision: ContextDecision;
  summary: ContextSummary | null;
  objects: ContextObject[];
  /** The model-written NFR texts stored with the design, by topic label, or null when none. */
  nfr: Array<{ topic: string; text: string }> | null;
  /**
   * The requirements the owner accepted in the requirements specification
   * (Design → Requirements, ADR-078), or null when none is accepted. When
   * present they replace the model's NFR proposals (owner, 12.10.2026).
   */
  accepted: AcceptedRequirements | null;
  /** The data mode as recorded, or null — no run records one today. */
  dataMode: string | null;
  /** Whether the prompt carries the FACTS OF THE ORIGINAL section after this block. */
  originalFactsBelow: boolean;
}

/** One requirement with status `accepted` in the stored specification. */
export interface AcceptedRequirement {
  /** `FR-001`, `NFR-05`, `FR-P01`. */
  id: string;
  kind: 'functional' | 'non-functional';
  /** Non-functional: the category's label. */
  category: string | null;
  title: string;
  /** "The system shall …", as plain text. */
  statement: string;
  /** Non-functional: the measurable target and how it is measured. */
  target: string;
  method: string;
}

export interface AcceptedRequirements {
  /**
   * The account that saved the specification. The specification is the
   * owner's alone to write (`requirements-spec` route), and it carries no
   * per-requirement acceptance stamp, so the saving account is who accepted.
   */
  by: string;
  /** When the specification revision that holds the acceptances was saved, ISO 8601. */
  at: string;
  revision: number;
  items: AcceptedRequirement[];
}

export type ContextSectionKey = 'decisions' | 'route' | 'program' | 'objects' | 'requirements' | 'original';

export interface ContextSection {
  key: ContextSectionKey;
  /** Characters of the section as written into the block. */
  chars: number;
  /** Items the budget cut from this section. */
  cut: number;
}

export interface TransformationContext {
  text: string;
  sections: ContextSection[];
  budget: { limit: number; used: number; cut: ContextSectionKey[] };
}

/* ----------------------------------------------------------------- helpers */

const oneLine = (text: string | null | undefined, max: number): string => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ruleDecisionWord(answer: ContextRule['answer']): RuleDecisionWord {
  if (answer === 'keep') return 'KEEP';
  if (answer === 'change') return 'CHANGE';
  if (answer === 'drop') return 'DROP';
  return 'OPEN';
}

/** The comment marker of the track's main language. */
const commentOf = (track: ContextTrack) => (track === 'rap' ? '"' : '//');

/**
 * The option a recorded option text names — the binding is "optionId ·
 * label", and both halves come from the Economics option list or the
 * Management choice. Read by word, never guessed past it: an unknown text is
 * `null`, and the record is quoted verbatim anyway.
 */
export function decisionOptionOf(text: string | null | undefined): DecisionOptionWord | null {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return null;
  if (/\bretire\b/.test(t)) return 'retire';
  if (/\bstandard\b/.test(t)) return 'standard';
  if (/\brebuild\b/.test(t)) return 'rebuild';
  if (/\b(?:do-nothing|keep)\b/.test(t)) return 'keep';
  return null;
}

const ROUTE_WORD: Record<ContextDecision['route']['chosen'], string> = {
  'in-app-rap': 'in-app RAP on ABAP Cloud (developer extensibility)',
  'side-by-side-cap': 'side-by-side on SAP BTP (Node.js / CAP)',
};

/* ---------------------------------------------------------------- sections */

/**
 * A section as head lines (always kept), items (cut from the end) and the
 * sentence that replaces cut items.
 */
interface Draft {
  key: ContextSectionKey;
  head: string[];
  items: string[];
  /** The line standing for `n` cut items. */
  rest: (n: number, cutItems: readonly string[]) => string;
}

const INDENT = '        ';

function decisionsSection(input: TransformationContextInput): Draft {
  const { rules, track } = input;
  const c = commentOf(track);
  const head: string[] = [];
  const basisLine: Record<ContextRules['basis'], string> = {
    confirmations: `read from need revision ${rules.revision ?? '?'} of the confirmed process — the owner's answers in the rule register`,
    source: 'no rule has been answered yet — the process has no stored revision, so every rule is OPEN',
    'source-moved': 'answers on record were given against an earlier source and are not applied — every rule is OPEN',
    'not-read': `the rules could not be read${rules.reason ? ` (${rules.reason})` : ''} — take them from the legacy code and keep them`,
    'not-detected': 'the engine read the source and found no business rule in it',
  };
  head.push(`A. BUSINESS RULE DECISIONS (${basisLine[rules.basis]}):`);
  if (rules.items.length > 0) {
    head.push(
      `   KEEP → implement exactly as the original, cite the rule id in a comment. CHANGE → implement the decided text, not the original. DROP → do not implement; a comment "${c} BR-nnn dropped on purpose". OPEN → implement as the original does and mark "${c} OPEN: BR-nnn awaits a decision".`,
    );
  }
  // Decided rules first (CHANGE, DROP, KEEP), then the open ones, each in id
  // order: the budget cuts from the end, so the open rules go first.
  const rank: Record<RuleDecisionWord, number> = { CHANGE: 0, DROP: 1, KEEP: 2, OPEN: 3 };
  const sorted = [...rules.items].sort(
    (a, b) => rank[ruleDecisionWord(a.answer)] - rank[ruleDecisionWord(b.answer)] || a.id.localeCompare(b.id),
  );
  const items = sorted.map((r) => {
    const word = ruleDecisionWord(r.answer);
    const where = r.line ? ` (L${r.line})` : '';
    const cond = oneLine(r.condition, MAX_CONDITION);
    if (word === 'CHANGE') {
      return `   ${r.id} CHANGE · ${cond}${where} → implement instead: "${oneLine(r.note, MAX_PROPOSAL) || 'no text recorded — keep the original and mark it OPEN'}"`;
    }
    if (word === 'DROP') {
      return `   ${r.id} DROP · ${cond}${where}${r.note ? ` — reason: "${oneLine(r.note, MAX_PROPOSAL)}"` : ''}`;
    }
    if (word === 'KEEP') return `   ${r.id} KEEP · ${cond}${where} — ${oneLine(r.meaning, MAX_MEANING)}`;
    // An open rule is the original's behaviour, which the legacy code above
    // already shows: its condition and line are enough to find and mark it,
    // and the engine's sentence would mostly restate the condition.
    const question = r.answer === 'clarify' && r.note ? ` — open question: "${oneLine(r.note, MAX_MEANING)}"` : '';
    return `   ${r.id} OPEN · ${cond}${where}${question}`;
  });
  return {
    key: 'decisions',
    head,
    items,
    rest: (n, cut) => {
      const decided = cut.filter((l) => !isOpenRuleLine(l)).length;
      return decided === 0
        ? `   (${plural(n, 'more rule')}, all OPEN — see the rule register; implement them as the original does and mark them OPEN)`
        : `   (${plural(n, 'more rule')}, ${decided} of them decided — see the rule register; never implement a rule against its decision)`;
    },
  };
}

function routeSection(input: TransformationContextInput): Draft {
  const { decision, track } = input;
  const c = commentOf(track);
  const head: string[] = ['B. DECISION AND ROUTE:'];
  const { route } = decision;
  head.push(
    route.chosen === route.recommended
      ? `   Route: ${ROUTE_WORD[route.chosen]} — the engine's recommendation.`
      : `   Route: ${ROUTE_WORD[route.chosen]}, chosen against the engine's ${ROUTE_WORD[route.recommended]} — reason on record: "${oneLine(route.deviationReason, MAX_PROPOSAL)}".`,
  );
  const rec = decision.record;
  const items: string[] = [];
  if (rec) {
    const live = rec.status !== 'withdrawn' && rec.status !== 'superseded';
    items.push(
      `   Decision record ${rec.id} revision ${rec.revision} (${rec.status}): "${oneLine(rec.summary, MAX_PROPOSAL)}"${rec.option ? `; option: ${oneLine(rec.option, 120)}` : '; no option chosen'}.`,
    );
    if (live && rec.optionKind && rec.optionKind !== 'rebuild') {
      const what = rec.optionKind === 'retire' ? 'RETIRE THIS PROGRAM' : rec.optionKind === 'standard' ? 'MOVE TO SAP STANDARD' : 'KEEP THE PROGRAM AS IT IS';
      head.push(
        `   !!! THE DECISION ON RECORD IS TO ${what} — IT BUILDS NOTHING. This draft contradicts it; put a first-line comment "${c} DRAFT AGAINST THE DECISION ON RECORD (${rec.id}): ${rec.optionKind}" in every main file and build no more than the original does.`,
      );
    }
  } else {
    items.push('   Decision record: none stored — keep, rebuild, standard or retire is not decided on record.');
  }
  if (decision.signedOff) items.push(`   Architecture signed off as: ${decision.signedOff}.`);
  if (decision.reference) items.push(`   ${decision.reference}`);
  return { key: 'route', head, items, rest: (n) => `   (${plural(n, 'more line')} — see the decision record in Management)` };
}

function programSection(input: TransformationContextInput): Draft {
  const s = input.summary;
  const head = ['C. WHAT THE PROGRAM DOES (the engine\'s reading of the source — build these and no integration it does not have):'];
  if (!s) {
    return { key: 'program', head: [...head, '   Not read — take it from the legacy code.'], items: [], rest: () => '' };
  }
  const items: string[] = [];
  if (s.purpose.length) items.push(`   Purpose: ${oneLine(s.purpose.join(' '), 300)}`);
  if (s.reads.length) items.push(`   Reads: ${oneLine(s.reads.join(', '), 400)}.`);
  if (s.changes === 'none') {
    items.push('   Changes in SAP: none — it posts, writes and commits nothing. Do not add a posting, an update or a changing API call.');
  } else if (s.changes === 'not-determined') {
    items.push('   Changes in SAP: not determined by the engine — take them from the legacy code, do not add any.');
  } else {
    items.push(`   Changes in the normal run: ${s.changesInFlow.length ? oneLine(s.changesInFlow.join(', '), 400) : 'none'}.`);
    if (s.changesOnCommand.length) {
      items.push(`   Changes only on a user's command: ${oneLine(s.changesOnCommand.join(', '), 400)} — an explicit, separate operation in the target, never part of the read.`);
    }
  }
  items.push(`   Outputs: ${s.outputs.length ? s.outputs.join(', ') : 'none found'}.`);
  items.push(
    s.frontEnd
      ? `   Front end: needs a user's session from L${s.frontEnd} (screen, list commands, PC file or GUI control) — expose these as explicit API operations, not as a background job.`
      : '   Front end: none — the program runs without a user\'s screen.',
  );
  return { key: 'program', head, items, rest: (n) => `   (${plural(n, 'more line')} — see "In short" in the Business view)` };
}

function objectsSection(input: TransformationContextInput): Draft {
  const head = [
    'D. SAP OBJECTS AND RELEASED SUCCESSORS (the engine\'s catalog; "name found in SAP\'s catalog" means the name is listed, not that it fits — check fields and release before you use it):',
  ];
  const level = (o: ContextObject) => (o.level ? `level ${o.level}` : 'level not determined');
  const withSuccessor = input.objects.filter((o) => o.successor);
  const without = input.objects.filter((o) => !o.successor);
  const items = withSuccessor.map((o) => {
    const how = o.confidence === 'Catalog Match' ? "name found in SAP's catalog" : 'curated mapping, not checked against SAP\'s catalog';
    return `   ${o.object} (${level(o)}) → ${o.successor}${o.successorType ? ` (${o.successorType})` : ''}, ${how}`;
  });
  if (without.length) {
    items.push(`   No successor named in the catalog: ${without.map((o) => `${o.object} (${level(o)})`).join(', ')}.`);
  }
  if (items.length === 0) items.push('   No SAP object with a catalog entry was found in the code.');
  return { key: 'objects', head, items, rest: (n) => `   (${plural(n, 'more line')} — see Findings in the IT view)` };
}

/** An accepted requirement's line — the budget tells it from a model proposal by this shape. */
const isAcceptedLine = (line: string) => /^\s*(?:FR|NFR)-\S+ ACCEPTED /.test(line);

function requirementsSection(input: TransformationContextInput): Draft {
  const accepted = input.accepted && input.accepted.items.length > 0 ? input.accepted : null;
  const head = [accepted ? 'E. ACCEPTED REQUIREMENTS AND DATA:' : 'E. NON-FUNCTIONAL REQUIREMENTS AND DATA:'];
  const items: string[] = [];
  head.push(
    input.dataMode
      ? `   Data mode: ${oneLine(input.dataMode, 200)}`
      : '   Data mode: not recorded — no run says where the data comes from. Take the data the caller hands in; do not claim or invent a live SAP connection.',
  );
  if (accepted) {
    // Owner, 12.10.2026: accepted requirements replace the model's proposals.
    head.push(
      `   Requirements accepted by ${oneLine(accepted.by, 120)} on ${accepted.at.slice(0, 10)} (requirements specification revision ${accepted.revision}) — implement each; they replace the model's NFR proposals:`,
    );
    for (const r of accepted.items) {
      const kind = r.kind === 'functional' ? 'functional' : `non-functional${r.category ? `, ${r.category}` : ''}`;
      const target = r.kind === 'non-functional' && r.target.trim()
        ? ` Target: ${oneLine(r.target, 120)}${r.method.trim() ? ` (measured by ${oneLine(r.method, 80)})` : ''}.`
        : '';
      items.push(`   ${r.id} ACCEPTED (${kind}) · ${oneLine(r.title, 80)} — ${oneLine(r.statement, MAX_NFR)}${target}`);
    }
  } else if (!input.nfr || input.nfr.length === 0) {
    head.push('   Non-functional requirements: not recorded.');
  } else {
    head.push('   Non-functional requirements (proposed with the design by a model, not confirmed — honour them where the code can):');
    for (const n of input.nfr) items.push(`   ${n.topic}: ${oneLine(n.text, MAX_NFR)}`);
  }
  return {
    key: 'requirements',
    head,
    items,
    rest: (n) =>
      accepted
        ? `   (${plural(n, 'more accepted requirement')} — see the requirements specification in Design; implement them too)`
        : `   (${plural(n, 'more topic')} — see the requirements in Design)`,
  };
}

function originalSection(input: TransformationContextInput): Draft {
  return {
    key: 'original',
    head: [
      input.originalFactsBelow
        ? 'F. THE ORIGINAL\'S CHECKS, PACKED DECIMALS AND SELECTION INPUTS: listed under FACTS OF THE ORIGINAL below — not repeated here.'
        : 'F. THE ORIGINAL\'S CHECKS: every check of the legacy code that refuses, stops or skips input stays, before any calculation, with its rule id or line.',
    ],
    items: [],
    rest: () => '',
  };
}

const isOpenRuleLine = (line: string) => /^\s*BR-\S+ OPEN /.test(line);

/**
 * Lowest priority first — the order the budget cuts in. The open rules go
 * right after the model's NFR proposals, before the successors, what the program does
 * and the route: an OPEN line says "do as the
 * original does", which the legacy code in the prompt already says, while a
 * decided rule and the facts below say what the code cannot. Measured on the
 * CO case (66 rules, 12.10.2026): cut strictly by section, the open rules
 * crowded out the route, the summary and the successors entirely.
 */
const CUT_ORDER: ReadonlyArray<{ key: ContextSectionKey; only?: (item: string) => boolean }> = [
  { key: 'requirements', only: (item) => !isAcceptedLine(item) },
  { key: 'decisions', only: isOpenRuleLine },
  { key: 'objects' },
  { key: 'program' },
  // Accepted requirements are the owner's word, like a decided rule: they go
  // after the engine's readings and before the route.
  { key: 'requirements' },
  { key: 'route' },
  { key: 'decisions' },
];

const LEAD = `${INDENT}PLATFORM KNOWLEDGE (Clean-Core.io's records and engine readings, no model — where the Business Analysis or the Solution Design disagree with it, this wins):`;

function render(drafts: ReadonlyArray<{ draft: Draft; kept: number }>): string {
  const lines = [LEAD];
  for (const { draft, kept } of drafts) {
    for (const h of draft.head) lines.push(`${INDENT}${h}`);
    for (const i of draft.items.slice(0, kept)) lines.push(`${INDENT}${i}`);
    const cut = draft.items.length - kept;
    if (cut > 0) lines.push(`${INDENT}${draft.rest(cut, draft.items.slice(kept))}`);
  }
  return `\n${lines.join('\n')}\n`;
}

/**
 * The PLATFORM KNOWLEDGE block of both code-draft prompts (Node.js/CAP and
 * RAP), within `limit` characters.
 */
export function buildTransformationContext(
  input: TransformationContextInput,
  limit: number = TRANSFORMATION_CONTEXT_BUDGET,
): TransformationContext {
  const drafts = [
    decisionsSection(input),
    routeSection(input),
    programSection(input),
    objectsSection(input),
    requirementsSection(input),
    originalSection(input),
  ].map((draft) => ({ draft, kept: draft.items.length }));
  const byKey = new Map(drafts.map((d) => [d.draft.key, d]));

  let text = render(drafts);
  const cutKeys: ContextSectionKey[] = [];
  for (const { key, only } of CUT_ORDER) {
    const d = byKey.get(key)!;
    while (text.length > limit && d.kept > 0 && (!only || only(d.draft.items[d.kept - 1]))) {
      d.kept -= 1;
      if (!cutKeys.includes(key)) cutKeys.push(key);
      text = render(drafts);
    }
    if (text.length <= limit) break;
  }
  // The heads alone are the floor: a block that still does not fit is cut at
  // the limit with the cut said, rather than sent whole past its budget.
  if (text.length > limit) {
    const marker = `\n${INDENT}(cut at ${limit} characters — see the rule register and the decision record)\n`;
    text = `${text.slice(0, Math.max(0, limit - marker.length))}${marker}`;
  }

  const sections: ContextSection[] = drafts.map(({ draft, kept }) => {
    const part = render([{ draft, kept }]).length - LEAD.length - 2;
    return { key: draft.key, chars: part, cut: draft.items.length - kept };
  });
  return { text, sections, budget: { limit, used: text.length, cut: cutKeys } };
}
