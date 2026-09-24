import { buildProcessFacts, type ProcessFacts } from './abap/process-facts';
import {
  buildProcessSkeletonFrom,
  type NodeAnchor,
  type ProcessSkeleton,
  type SkeletonNodeKind,
} from './abap/process-skeleton';
import type { SourceRange } from './abap/statement-reader';
import { inspectModelText } from './model-text';
import {
  NOT_GENERATED,
  absenceFromError,
  modelAbsenceReason,
  type ModelAbsence,
  type ModelStage,
} from './model-stages';
import type { ProvenanceValue } from './provenance';

/**
 * Business names for the process skeleton — roadmap 2.4.
 *
 * The skeleton of 2.3 is the process. It is read out of the code without a
 * model, every node carries its line range or says it has none, and its labels
 * are tokens the source writes. What it lacks is the language a business reader
 * uses: `IF sy-subrc <> 0` inside `CHECK_AUTHORITY` is "Not authorised?".
 *
 * A model may supply that language and nothing else. The whole design follows
 * from one sentence: **a naming is a map from node id to name, not a process.**
 *
 *   - The model sees node ids, kinds, technical labels and the condition texts
 *     of the edges, grouped by the part of the program they sit in, plus the
 *     AUTHORITY-CHECK objects 2.2 read. Not the source, not a field value of an
 *     authorization check, not a customer's data beyond what a label already is.
 *   - The answer is validated, never repaired. An id the skeleton does not have,
 *     a node named twice, a key outside the format, a name too long, a lane
 *     called "CFO" — each is dropped and **counted**, so the reader can see how
 *     much of the answer did not fit. Nothing the model says adds a node, an
 *     edge, a line number or an anchor: those come from the skeleton, always.
 *   - The technical name stays. A business name stands beside it and never in
 *     its place, and the anchor of a node does not move because it was named.
 *   - A node without an anchor is "Unanchored" whatever it is called. A good
 *     name is not evidence.
 *   - A lane is a proposal. It carries the sentence the mockup gives it —
 *     reconstructed from AUTHORITY-CHECK and naming, not an organisational
 *     statement — and a lane with no AUTHORITY-CHECK behind it has no anchor.
 *   - Every business name is `proposed` (*Model proposal*). The type below does
 *     not admit any other provenance, so a name cannot be shown as proven or
 *     confirmed by a later change that forgets why.
 *
 * Without a key, or with the stage switched off, `applyNaming` returns the
 * whole skeleton with its technical names and one honest sentence saying that
 * nothing was named — no error, no empty map (V25-A12, Phase 2 "Fertig, wenn":
 * *"ohne API-Key das Skelett mit technischen Namen"*).
 *
 * Pure: the browser builds the prompt and applies a naming, the server route
 * validates and stores one, and both read this file. Nothing here reaches the
 * signed run, and nothing here is the ABAP engine — `lib/abap/**` is not
 * changed by naming, so the reference corpus does not move either.
 */

/** The model stage this module calls under (`lib/model-stages.ts`). */
export const NAMING_STAGE = 'naming' satisfies ModelStage;

/** Bumped only when the stored record changes shape. */
export const NAMING_FORMAT_VERSION = 1;

/**
 * The sentence every lane carries — the mockup's, in the interface language.
 * `docs/ROADMAP.md` 2.4: *"rekonstruiert aus AUTHORITY-CHECK und Benennung,
 * keine organisatorische Aussage"*.
 */
export const LANE_STATEMENT = 'Reconstructed from AUTHORITY-CHECK and naming, not an organisational statement.';

/** What an element without a line anchor is called, however it is named. Roadmap 2.4: „unbelegt“. */
export const UNANCHORED = 'Unanchored';

/** One spelling for what the reader keeps when there are no business names. */
export const TECHNICAL_NAMES_KEPT =
  'Every step keeps its technical name from the code, and every line anchor is unchanged.';

/** Longest business name for a node. A label on a BPMN task, not a paragraph. */
export const NAME_MAX_LENGTH = 80;

/** Longest lane name. A lane header is rotated text in a narrow column. */
export const LANE_NAME_MAX_LENGTH = 40;

/**
 * Most lanes a naming may propose. The mockup has three, `DESIGN.md` §5.8 two;
 * above eight the proposal is an organisation chart, which is exactly what a
 * lane must not be. More than this and every lane is dropped, not the tail —
 * choosing which eight survive would be repairing the answer.
 */
export const MAX_LANES = 8;

/** Largest answer that is read at all. A naming of the 1,000-line example is ~15 kB. */
export const MAX_ANSWER_LENGTH = 200_000;

/** Condition texts sent per node, and the length each is cut to. */
const MAX_CONDITIONS_PER_NODE = 8;
const MAX_CONDITION_LENGTH = 160;

/* ------------------------------------------------------------------ *
 * The context: the skeleton, the checks a lane may stand on, and a
 * fingerprint that binds a naming to exactly this reading.
 * ------------------------------------------------------------------ */

/** An AUTHORITY-CHECK a lane may be based on. Only what the prompt is allowed to see, plus its range. */
export interface NamingAuthorityCheck extends SourceRange {
  /** `ac-<n>` in source order. The model refers to a check by this and by nothing else. */
  ref: string;
  /** The authorization object, or null when 2.2 could not resolve it. */
  object: string | null;
  /** Field ids only (`ACTVT`, `EKGRP`). Field *values* are customer data and are not sent. */
  fields: string[];
  /** Routine or event block the check is written in. */
  container: string | null;
}

export interface NamingContext {
  skeleton: ProcessSkeleton;
  authorityChecks: NamingAuthorityCheck[];
  /**
   * Fingerprint of the nodes and checks a naming refers to. A naming applies to
   * the reading it was made for and to no other — a changed source renumbers
   * statements, and `nd-12-0` then names something else.
   */
  digest: string;
}

/**
 * cyrb53 — a 53-bit string hash. Twice, with two seeds.
 *
 * A fingerprint for drift, not a signature: it has to be computable in the
 * browser synchronously, and nothing trusts it for more than "is this the same
 * reading". The server computes its own from the stored source; a browser that
 * lies about its digest only fools itself.
 */
function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

function digestOf(skeleton: ProcessSkeleton, checks: NamingAuthorityCheck[]): string {
  const parts: string[] = [`v${NAMING_FORMAT_VERSION}`];
  for (const n of skeleton.nodes) {
    parts.push(`${n.id}|${n.kind}|${n.label}|${n.anchor ? `${n.anchor.lineStart}-${n.anchor.lineEnd}` : '-'}`);
  }
  for (const c of checks) {
    parts.push(`${c.ref}|${c.object ?? '?'}|${c.fields.join(',')}|${c.lineStart}-${c.lineEnd}`);
  }
  const canonical = parts.join('\n');
  return `nm1-${cyrb53(canonical, 0)}${cyrb53(canonical, 1)}`;
}

/** The context for one reading of the source. Facts are read once (`process-facts.ts`). */
export function namingContextFrom(facts: ProcessFacts): NamingContext {
  const skeleton = buildProcessSkeletonFrom(facts);
  // A check in a routine nothing reaches is not evidence for a role in this
  // process — the routine is not in the process at all (§5.8).
  const unreached = new Set(skeleton.notDrawn.unreached.map((r) => r.name));
  const authorityChecks: NamingAuthorityCheck[] = facts.calls.authorityChecks
    .filter((c) => !(c.caller && unreached.has(c.caller)))
    .map((c, i) => ({
      ref: `ac-${i + 1}`,
      object: c.object ?? null,
      fields: c.fields.map((f) => f.id),
      container: c.caller,
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
    }));
  return { skeleton, authorityChecks, digest: digestOf(skeleton, authorityChecks) };
}

export function namingContextOf(source: string): NamingContext {
  return namingContextFrom(buildProcessFacts(source));
}

/* ------------------------------------------------------------------ *
 * The prompt.
 * ------------------------------------------------------------------ */

function regionHeading(skeleton: ProcessSkeleton, key: string): string {
  const region = skeleton.regions.find((r) => r.key === key);
  if (!region) return key;
  return region.kind === 'sub-process' ? `FORM ${region.label}` : region.label;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/**
 * The prompt, built from the context and nothing else.
 *
 * What goes in is listed in the module header, and the test reads the prompt
 * back to hold it there. The grouping by region is the one addition to "id,
 * kind, label, conditions": `IF sy-subrc <> 0` cannot be named without knowing
 * that it sits in `CHECK_AUTHORITY`, and the heading is that routine's name — a
 * technical label the call-site node already carries.
 *
 * The prompt is not the defence. A string literal in the source can say
 * anything, and it reaches the prompt as part of a condition. What holds is
 * `validateNamingAnswer`, which does not care what the model was told.
 */
export function buildNamingPrompt(context: NamingContext): string {
  const { skeleton } = context;
  const lines: string[] = [
    'You propose business names for a process that was reconstructed from ABAP source code without a model.',
    '',
    'The process is fixed. You do not add, remove, merge, split or reconnect anything. You only:',
    '1. give a node a short business name, and',
    '2. propose lanes: roles that act in this process.',
    '',
    'Answer with JSON only, in exactly this shape and with no other keys:',
    '{"names":[{"id":"<node id>","name":"<business name>"}],"lanes":[{"name":"<role>","authorityCheck":"<check id or null>","nodes":["<node id>"]}]}',
    '',
    'Rules:',
    '- Use only node ids from the list below. Name each node at most once, and put each node in at most one lane.',
    `- A name is plain business language in English, one line, at most ${NAME_MAX_LENGTH} characters, no Markdown. Leave a node out if what is given does not tell you what it does for the business.`,
    // Roadmap 17.3 (measured 24.09.2026): without this line the fast model named
    // work steps only and left every start, end and decision on its technical
    // token — the nodes a business reader recognises a process by.
    '- Name every node of kind start, end, end-error, gateway and parallel-gateway. A start says what sets the process off, an end the outcome it reaches, a gateway the business question it decides (its conditions say which). Leave one of these out only if the list gives nothing to go on.',
    `- A lane is a role in this process as the program shows it, for example "Requester", "Approver" or "Batch run", at most ${LANE_NAME_MAX_LENGTH} characters. Never a job title, a person, a department or a position in an organisation chart: a lane is not an organisational statement.`,
    `- Base a lane on an authorization check from the list where one supports it, and give that check's id as "authorityCheck". Otherwise use null. At most ${MAX_LANES} lanes.`,
    '- Give no line numbers, anchors, confidence values or any other field.',
    '',
    'Nodes, as "id | kind | technical name as the code writes it", grouped by the part of the program they belong to:',
  ];

  const order = new Map(skeleton.regions.map((r, i) => [r.key, i]));
  const byRegion = new Map<string, typeof skeleton.nodes>();
  for (const node of skeleton.nodes) {
    byRegion.set(node.region, [...(byRegion.get(node.region) ?? []), node]);
  }
  const regionKeys = [...byRegion.keys()].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  for (const key of regionKeys) {
    lines.push('', `Part: ${regionHeading(skeleton, key)}`);
    const nodes = [...(byRegion.get(key) ?? [])].sort(
      (a, b) => (a.anchor?.lineStart ?? Number.MAX_SAFE_INTEGER) - (b.anchor?.lineStart ?? Number.MAX_SAFE_INTEGER)
        || a.id.localeCompare(b.id),
    );
    for (const node of nodes) {
      const conditions = [
        ...new Set(
          skeleton.edges
            .filter((e) => e.from === node.id && e.condition && !node.label.includes(e.condition))
            .map((e) => clip(e.condition, MAX_CONDITION_LENGTH)),
        ),
      ].slice(0, MAX_CONDITIONS_PER_NODE);
      const tail = conditions.length ? ` | conditions: ${conditions.join(' ; ')}` : '';
      lines.push(`${node.id} | ${node.kind} | ${node.label}${tail}`);
    }
  }

  lines.push('', 'Authorization checks, as "id | object | fields | part of the program":');
  if (!context.authorityChecks.length) lines.push('(none)');
  for (const check of context.authorityChecks) {
    lines.push(
      `${check.ref} | ${check.object ?? '(object not resolved)'} | ${check.fields.join(', ') || '(no fields)'} | ${check.container ?? 'program'}`,
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Validation. Dropped and counted, never repaired.
 * ------------------------------------------------------------------ */

/** Why a piece of the answer was dropped. One reason per dropped piece. */
export type NamingRejection =
  /** No answer, or only whitespace. */
  | 'empty-answer'
  /** Longer than `MAX_ANSWER_LENGTH`; not read. */
  | 'too-large'
  /** Not JSON. */
  | 'malformed-json'
  /** JSON, but not an object with `names` and `lanes`. */
  | 'not-an-object'
  /** A key outside the format — `nodes`, `edges`, an `anchor` on a name, `lines` on a lane. Counted per item. */
  | 'unexpected-field'
  /** An entry of the wrong type: a name that is not a string, `nodes` that is not a list. */
  | 'malformed-entry'
  /** An id the skeleton does not have. */
  | 'unknown-node'
  /** The same node named more than once — every one of those names is dropped. */
  | 'duplicate-node'
  | 'empty-name'
  | 'name-too-long'
  /** A line break or another control character. */
  | 'control-character'
  /** Wording `lib/model-text.ts` refuses on a screen: a chatbot phrase, an emoji, Markdown. */
  | 'model-text'
  /** The "business" name is the technical name again. */
  | 'same-as-technical'
  /** A lane named as a position, a person or a unit of an organisation. */
  | 'lane-organisational'
  /** Two lanes with the same name — both dropped. */
  | 'duplicate-lane'
  /** A lane based on a check id the context does not have. */
  | 'unknown-authority-check'
  /** One AUTHORITY-CHECK claimed by two lanes — both dropped. */
  | 'authority-check-twice'
  /** A node placed in two lanes — removed from both. */
  | 'node-in-two-lanes'
  /** A lane left with no node of this skeleton. */
  | 'empty-lane'
  /** More than `MAX_LANES` — every lane dropped. */
  | 'too-many-lanes';

export interface DiscardTally {
  total: number;
  byRule: Partial<Record<NamingRejection, number>>;
}

export interface AcceptedName {
  id: string;
  /** The skeleton's label when the name was accepted. The name applies only while this still matches. */
  technicalName: string;
  name: string;
}

export interface AcceptedLane {
  /** `lane-<n>` in the order the lanes survived. */
  key: string;
  name: string;
  /** `ac-<n>` from the context, or null for a lane proposed from naming alone. */
  authorityCheck: string | null;
  nodes: string[];
}

export interface ValidatedNaming {
  names: AcceptedName[];
  lanes: AcceptedLane[];
  discarded: DiscardTally;
}

class Tally {
  private counts: Partial<Record<NamingRejection, number>> = {};
  private sum = 0;

  bump(rule: NamingRejection, by = 1): void {
    if (by <= 0) return;
    this.counts[rule] = (this.counts[rule] ?? 0) + by;
    this.sum += by;
  }

  result(): DiscardTally {
    return { total: this.sum, byRule: { ...this.counts } };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * A lane that names a position, a person or a unit of an organisation.
 *
 * A closed list, and a heuristic one: it catches the common forms — C-level
 * acronyms, "Head of", "Director", "Manager", "Owner", "Department", "Team",
 * their German counterparts, and anything with an address in it. It cannot
 * catch every job title in every language, and it does not have to: the
 * sentence under every lane says it is no organisational statement. What it
 * prevents is a lane whose *name* contradicts that sentence — "CFO" over
 * "not an organisational statement" is a claim the code never made. "Approver",
 * "Purchasing" and "Batch run" describe what happens in the program and pass.
 */
const ORGANISATIONAL: readonly RegExp[] = [
  /\bC(?:E|F|O|I|T|P|R|M|D|S|C|IS|HR)O\b/i,
  /\bchief\b/i,
  /\bhead\s+of\b/i,
  /\bdirector\b/i,
  /\b(?:vice[\s-]+)?president\b/i,
  /\bVP\b/,
  /\bboard\b/i,
  /\bexecutive\b/i,
  /\bofficer\b/i,
  /\bmanager\b/i,
  /\bmanagement\b/i,
  /\bsupervisor\b/i,
  /\bowner\b/i,
  /\bdepartment\b/i,
  /\bdivision\b/i,
  /\bteam\b/i,
  /\bvorstand\b/i,
  /gesch(?:ä|ae)ftsf(?:ü|ue)hr/i,
  /leiter(?:in)?\b/i,
  /abteilung/i,
  /\bprokurist/i,
  /\b(?:mr|mrs|ms|herr|frau)\.?\s+[A-ZÄÖÜ]/,
  /@/,
];

export function isOrganisationalLaneName(name: string): boolean {
  return ORGANISATIONAL.some((pattern) => pattern.test(name));
}

/** The first rule a name breaks, or null. Shared by node names and lane names. */
function nameProblem(raw: string, max: number): NamingRejection | null {
  const name = raw.trim();
  if (!name) return 'empty-name';
  if (CONTROL.test(raw)) return 'control-character';
  if (Array.from(name).length > max) return 'name-too-long';
  if (inspectModelText(name, 'screen').length > 0) return 'model-text';
  return null;
}

function validateNames(
  raw: unknown,
  nodes: Map<string, ProcessSkeleton['nodes'][number]>,
  tally: Tally,
): AcceptedName[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    tally.bump('malformed-entry');
    return [];
  }

  const wellFormed: Array<{ id: string; name: string }> = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) { tally.bump('malformed-entry'); continue; }
    if (Object.keys(entry).some((k) => k !== 'id' && k !== 'name')) { tally.bump('unexpected-field'); continue; }
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') { tally.bump('malformed-entry'); continue; }
    wellFormed.push({ id: entry.id, name: entry.name });
  }

  const perId = new Map<string, number>();
  for (const entry of wellFormed) perId.set(entry.id, (perId.get(entry.id) ?? 0) + 1);

  const accepted: AcceptedName[] = [];
  for (const entry of wellFormed) {
    const node = nodes.get(entry.id);
    if (!node) { tally.bump('unknown-node'); continue; }
    // Two names for one node are two claims, and picking one is repairing the
    // answer. Both go.
    if ((perId.get(entry.id) ?? 0) > 1) { tally.bump('duplicate-node'); continue; }
    const problem = nameProblem(entry.name, NAME_MAX_LENGTH);
    if (problem) { tally.bump(problem); continue; }
    const name = entry.name.trim();
    if (name.toLowerCase() === node.label.trim().toLowerCase()) { tally.bump('same-as-technical'); continue; }
    accepted.push({ id: node.id, technicalName: node.label, name });
  }
  return accepted;
}

function validateLanes(
  raw: unknown,
  nodes: Map<string, ProcessSkeleton['nodes'][number]>,
  checks: Map<string, NamingAuthorityCheck>,
  tally: Tally,
): AcceptedLane[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    tally.bump('malformed-entry');
    return [];
  }
  if (raw.length > MAX_LANES) {
    tally.bump('too-many-lanes', raw.length);
    return [];
  }

  const allowed = new Set(['name', 'authorityCheck', 'nodes']);
  let candidates: Array<{ name: string; ref: string | null; nodes: string[] }> = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) { tally.bump('malformed-entry'); continue; }
    if (Object.keys(entry).some((k) => !allowed.has(k))) { tally.bump('unexpected-field'); continue; }
    const ref = entry.authorityCheck;
    if (
      typeof entry.name !== 'string'
      || !Array.isArray(entry.nodes)
      || entry.nodes.some((id) => typeof id !== 'string')
      || !(ref === undefined || ref === null || typeof ref === 'string')
    ) {
      tally.bump('malformed-entry');
      continue;
    }
    const problem = nameProblem(entry.name, LANE_NAME_MAX_LENGTH);
    if (problem) { tally.bump(problem); continue; }
    const name = entry.name.trim();
    if (isOrganisationalLaneName(name)) { tally.bump('lane-organisational'); continue; }
    if (typeof ref === 'string' && !checks.has(ref)) { tally.bump('unknown-authority-check'); continue; }
    candidates.push({ name, ref: typeof ref === 'string' ? ref : null, nodes: entry.nodes as string[] });
  }

  // Two lanes of one name, or one check behind two lanes: two claims about the
  // same thing, and neither is kept.
  const perName = new Map<string, number>();
  const perRef = new Map<string, number>();
  for (const c of candidates) {
    perName.set(c.name.toLowerCase(), (perName.get(c.name.toLowerCase()) ?? 0) + 1);
    if (c.ref) perRef.set(c.ref, (perRef.get(c.ref) ?? 0) + 1);
  }
  candidates = candidates.filter((c) => {
    if ((perName.get(c.name.toLowerCase()) ?? 0) > 1) { tally.bump('duplicate-lane'); return false; }
    if (c.ref && (perRef.get(c.ref) ?? 0) > 1) { tally.bump('authority-check-twice'); return false; }
    return true;
  });

  // Membership. An unknown id is dropped; a repeated id inside one lane is one
  // member said twice; a node in two lanes is in neither.
  const members = candidates.map((c) => {
    const known: string[] = [];
    for (const id of c.nodes) {
      if (!nodes.has(id)) { tally.bump('unknown-node'); continue; }
      if (known.includes(id)) { tally.bump('duplicate-node'); continue; }
      known.push(id);
    }
    return known;
  });
  const laneCount = new Map<string, number>();
  for (const list of members) for (const id of list) laneCount.set(id, (laneCount.get(id) ?? 0) + 1);

  const accepted: AcceptedLane[] = [];
  candidates.forEach((c, i) => {
    const kept = members[i].filter((id) => {
      if ((laneCount.get(id) ?? 0) > 1) { tally.bump('node-in-two-lanes'); return false; }
      return true;
    });
    if (!kept.length) { tally.bump('empty-lane'); return; }
    accepted.push({ key: `lane-${accepted.length + 1}`, name: c.name, authorityCheck: c.ref, nodes: kept });
  });
  return accepted;
}

/**
 * The model's answer, held against the context.
 *
 * Takes the raw text as it came back from `/api/gemini` — not a parsed object —
 * so "not JSON" is one of the outcomes rather than an exception somewhere
 * upstream. Never throws.
 */
export function validateNamingAnswer(context: NamingContext, answer: unknown): ValidatedNaming {
  const tally = new Tally();
  const nothing = (): ValidatedNaming => ({ names: [], lanes: [], discarded: tally.result() });

  if (typeof answer !== 'string' || answer.trim() === '') { tally.bump('empty-answer'); return nothing(); }
  if (answer.length > MAX_ANSWER_LENGTH) { tally.bump('too-large'); return nothing(); }

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    tally.bump('malformed-json');
    return nothing();
  }
  if (!isPlainObject(parsed)) { tally.bump('not-an-object'); return nothing(); }

  // New nodes, edges, lanes under another key, a "process" of its own: none of
  // it is read, all of it is counted — one per item where it is a list.
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'names' || key === 'lanes') continue;
    tally.bump('unexpected-field', Array.isArray(value) ? Math.max(1, value.length) : 1);
  }

  const nodes = new Map(context.skeleton.nodes.map((n) => [n.id, n]));
  const checks = new Map(context.authorityChecks.map((c) => [c.ref, c]));
  const names = validateNames(parsed.names, nodes, tally);
  const lanes = validateLanes(parsed.lanes, nodes, checks, tally);
  return { names, lanes, discarded: tally.result() };
}

/* ------------------------------------------------------------------ *
 * The stored record.
 * ------------------------------------------------------------------ */

/**
 * Where the names came from. Written by the server after it verified the
 * receipt `/api/gemini` issued for exactly this answer (`lib/model-receipt.ts`)
 * — the browser cannot produce one of these.
 */
export interface NamingOrigin {
  source: 'model';
  /** The receipt was checked against the answer's text, the account and the window. */
  receipt: 'verified';
  provider: string;
  modelId: string;
  byok: boolean;
  /** When the model call happened, ms since the epoch — the receipt's `iat`. */
  issuedAt: number;
  /** SHA-256 of the answer the names were read from. The answer itself is not kept. */
  textSha256: string;
}

export interface ProcessNamingRecord extends ValidatedNaming {
  formatVersion: typeof NAMING_FORMAT_VERSION;
  /** `NamingContext.digest` of the reading the names were validated against. */
  digest: string;
  origin: NamingOrigin;
  /** ISO time the server stored the naming. */
  namedAt: string;
}

/** Shape check for a record that arrives over the wire. Anything else is treated as absent. */
export function isProcessNamingRecord(value: unknown): value is ProcessNamingRecord {
  if (!isPlainObject(value)) return false;
  const origin = value.origin;
  const discarded = value.discarded;
  return value.formatVersion === NAMING_FORMAT_VERSION
    && typeof value.digest === 'string'
    && typeof value.namedAt === 'string'
    && Array.isArray(value.names)
    && value.names.every((n) => isPlainObject(n) && typeof n.id === 'string' && typeof n.name === 'string' && typeof n.technicalName === 'string')
    && Array.isArray(value.lanes)
    && value.lanes.every((l) => isPlainObject(l) && typeof l.key === 'string' && typeof l.name === 'string'
      && (l.authorityCheck === null || typeof l.authorityCheck === 'string')
      && Array.isArray(l.nodes) && l.nodes.every((id) => typeof id === 'string'))
    && isPlainObject(discarded) && typeof discarded.total === 'number' && isPlainObject(discarded.byRule)
    && isPlainObject(origin) && origin.source === 'model' && origin.receipt === 'verified'
    && typeof origin.modelId === 'string' && typeof origin.provider === 'string';
}

/* ------------------------------------------------------------------ *
 * Applying a naming — what 2.5 draws.
 * ------------------------------------------------------------------ */

/** The one provenance a business name or a lane can have. Not a union on purpose. */
export type NamingProvenance = Extract<ProvenanceValue, 'proposed'>;

export interface NamedNode {
  id: string;
  kind: SkeletonNodeKind;
  region: string;
  container: string | null;
  /** The skeleton's label. Always present, never replaced. */
  technicalName: string;
  /** Beside the technical name, never instead of it. Null when not named. */
  businessName: string | null;
  /** `proposed` exactly when `businessName` is set. */
  nameProvenance: NamingProvenance | null;
  /** The skeleton's anchor, unchanged by naming. */
  anchor: NodeAnchor | null;
  evidence: 'anchored' | 'unanchored';
  /** `UNANCHORED` when there is no anchor, however the node is named. */
  evidenceLabel: typeof UNANCHORED | null;
  unanchoredReason?: string;
}

export interface ProposedLane {
  key: string;
  name: string;
  provenance: NamingProvenance;
  basis: 'authority-check' | 'naming';
  /** The authorization object behind the lane, when there is one. */
  authorityObject: string | null;
  /** The AUTHORITY-CHECK statement's range. Null for a lane from naming alone. */
  anchor: SourceRange | null;
  evidence: 'anchored' | 'unanchored';
  evidenceLabel: typeof UNANCHORED | null;
  nodes: string[];
  statement: typeof LANE_STATEMENT;
}

export type NamingState = 'named' | 'not-named' | 'stale';

export interface NamedProcess {
  state: NamingState;
  /**
   * One sentence for the reader, or null when names are shown and nothing needs
   * saying. Never an error: an absence of names is a state of the map.
   */
  notice: string | null;
  nodes: NamedNode[];
  lanes: ProposedLane[];
  counts: {
    nodes: number;
    named: number;
    anchored: number;
    unanchored: number;
    lanes: number;
    anchoredLanes: number;
    /** Pieces of the model's answer that did not fit. Null when nothing was named. */
    discarded: number | null;
  };
  origin: NamingOrigin | null;
}

/**
 * The skeleton with its names, or with none — complete either way.
 *
 * `record` is what `GET /api/projects/{id}/process-naming` returned; `absence`
 * says why there is none, when it is known (`lib/model-stages.ts`). A record
 * made for another reading of the source is not applied, and the map says so.
 */
export function applyNaming(
  context: NamingContext,
  record: ProcessNamingRecord | null | undefined,
  absence: ModelAbsence = null,
): NamedProcess {
  const usable = record && record.formatVersion === NAMING_FORMAT_VERSION && record.digest === context.digest
    ? record
    : null;
  const state: NamingState = usable ? 'named' : record ? 'stale' : 'not-named';

  const names = new Map((usable?.names ?? []).map((n) => [n.id, n]));
  const nodes: NamedNode[] = context.skeleton.nodes.map((node) => {
    const entry = names.get(node.id);
    const applies = entry !== undefined && entry.technicalName === node.label;
    return {
      id: node.id,
      kind: node.kind,
      region: node.region,
      container: node.container,
      technicalName: node.label,
      businessName: applies ? entry.name : null,
      nameProvenance: applies ? 'proposed' : null,
      anchor: node.anchor,
      evidence: node.anchor ? 'anchored' : 'unanchored',
      evidenceLabel: node.anchor ? null : UNANCHORED,
      ...(node.unanchoredReason ? { unanchoredReason: node.unanchoredReason } : {}),
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const checks = new Map(context.authorityChecks.map((c) => [c.ref, c]));
  const lanes: ProposedLane[] = (usable?.lanes ?? []).map((lane) => {
    const check = lane.authorityCheck ? checks.get(lane.authorityCheck) : undefined;
    return {
      key: lane.key,
      name: lane.name,
      provenance: 'proposed',
      basis: check ? 'authority-check' : 'naming',
      authorityObject: check?.object ?? null,
      anchor: check ? { lineStart: check.lineStart, lineEnd: check.lineEnd } : null,
      evidence: check ? 'anchored' : 'unanchored',
      evidenceLabel: check ? null : UNANCHORED,
      nodes: lane.nodes.filter((id) => nodeIds.has(id)),
      statement: LANE_STATEMENT,
    };
  });

  const named = nodes.filter((n) => n.businessName !== null).length;
  let notice: string | null = null;
  if (state === 'not-named') {
    notice = `${NOT_GENERATED}. ${modelAbsenceReason(absence, NAMING_STAGE)} ${TECHNICAL_NAMES_KEPT}`;
  } else if (state === 'stale') {
    notice = `Not applied. These business names were proposed for an earlier version of this source. ${TECHNICAL_NAMES_KEPT}`;
  } else if (named === 0 && lanes.length === 0) {
    const dropped = usable?.discarded.total ?? 0;
    notice = `No usable name. Nothing in the model's answer fit this process (${dropped} ${dropped === 1 ? 'proposal' : 'proposals'} dropped). ${TECHNICAL_NAMES_KEPT}`;
  }

  return {
    state,
    notice,
    nodes,
    lanes,
    counts: {
      nodes: nodes.length,
      named,
      anchored: nodes.filter((n) => n.evidence === 'anchored').length,
      unanchored: nodes.filter((n) => n.evidence === 'unanchored').length,
      lanes: lanes.length,
      anchoredLanes: lanes.filter((l) => l.evidence === 'anchored').length,
      discarded: usable ? usable.discarded.total : null,
    },
    origin: usable?.origin ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Asking for a naming — the sequence, with its two calls injected.
 * ------------------------------------------------------------------ */

/** What the browser posts to the naming route: the answer exactly as it came back. */
export interface NamingSubmission {
  digest: string;
  text: string;
  receipt: unknown;
}

export interface NamingAvailability {
  /** False while `/api/model-stages` has not answered; then nothing is decided here. */
  known: boolean;
  keyAvailable: boolean;
  stages: Partial<Record<string, boolean>>;
}

export interface NamingRequestDeps {
  /** `/api/gemini` with `stage: 'naming'`. Throws with the route's message on refusal. */
  callModel: (prompt: string) => Promise<{ text: string; receipt: unknown }>;
  /** `POST /api/projects/{id}/process-naming`. */
  store: (submission: NamingSubmission) => Promise<
    { ok: true; record: ProcessNamingRecord } | { ok: false; status: number; error: string }
  >;
}

export type NamingRequestOutcome =
  | { ok: true; record: ProcessNamingRecord }
  | { ok: false; absence: 'no-key' | 'stage-off' | 'failed'; message: string };

/**
 * Why no call should be made at all, when that is already known.
 *
 * `/api/gemini` refuses a switched-off stage and a missing key by itself, but a
 * refusal still costs the account a slot of its hourly rate limit. A map that
 * opens without a key should not spend one to learn what it already knows.
 */
export function absenceBeforeCall(availability: NamingAvailability | null | undefined): 'no-key' | 'stage-off' | null {
  if (!availability?.known) return null;
  if (!availability.keyAvailable) return 'no-key';
  if (availability.stages[NAMING_STAGE] === false) return 'stage-off';
  return null;
}

/**
 * Prompt → model → route. Never throws: every way it can end is an outcome
 * the map can show next to the technical names.
 *
 * The answer is posted **as it came back**. The receipt is a MAC over those
 * bytes; a browser that tidied the JSON first would have its own names refused.
 */
export async function runNamingRequest(
  context: NamingContext,
  deps: NamingRequestDeps,
  availability?: NamingAvailability | null,
): Promise<NamingRequestOutcome> {
  const before = absenceBeforeCall(availability);
  if (before) return { ok: false, absence: before, message: modelAbsenceReason(before, NAMING_STAGE) };

  let answer: { text: string; receipt: unknown };
  try {
    answer = await deps.callModel(buildNamingPrompt(context));
  } catch (err) {
    const absence = absenceFromError(err);
    const reason = absence === 'failed' && err instanceof Error && err.message ? err.message : modelAbsenceReason(absence, NAMING_STAGE);
    return { ok: false, absence: absence === 'declined' ? 'failed' : absence, message: reason };
  }

  try {
    const stored = await deps.store({ digest: context.digest, text: answer.text, receipt: answer.receipt });
    if (stored.ok) return stored;
    return { ok: false, absence: 'failed', message: stored.error };
  } catch (err) {
    return { ok: false, absence: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
