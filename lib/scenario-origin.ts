/**
 * Where a test scenario says it comes from — and whether the source agrees.
 *
 * Owner decision 03.10.2026 (translated): "Yes, ask for it — and check it."
 * The testing model is asked, for every scenario, which business rule,
 * decision point, finding or process step it tests, with the source lines.
 * This module is the other half: it reads that statement and checks it against
 * the signed source and the engine's own objects, deterministically.
 *
 * Pure and import-free, so the generation hook (at storage time), the Testing
 * stage (on display) and a spec all run the same check. The engine objects are
 * handed in (`OriginEngine`); `lib/scenario-origin-engine.ts` builds them from a
 * source.
 *
 * Three things are kept apart and never merged:
 *
 *   - **the statement** is the model's — a proposal, whatever the check says;
 *   - **the check** is the product's — lines exist, a named reference is an
 *     engine object anchored on those lines, a quote stands on those lines;
 *   - **a malformed statement** is dropped and recorded as not stated, with the
 *     reason. It never crashes a generation and is never repaired into
 *     something the model did not write.
 *
 * Nothing here is signed or goes into an audit pack: scenarios never did, and
 * the check is derived from the source of the signed run, so it can always be
 * recomputed.
 */

/* ------------------------------------------------------------------ types */

/** What a scenario can say it tests. */
export type OriginKind = 'rule' | 'decision' | 'finding' | 'step';

export const ORIGIN_KINDS: readonly OriginKind[] = ['rule', 'decision', 'finding', 'step'];

/** 1-based, inclusive. A single line has `start === end`. */
export interface OriginLineRange {
  start: number;
  end: number;
}

/** The model's statement, as stored after validation. Firestore-safe: no nested arrays, no `undefined`. */
export interface ScenarioOrigin {
  kind: OriginKind;
  /** An engine id — `BR-009`, `CC-003`, `nd-262-0`. Absent when the model named none. */
  ref?: string;
  /** Never empty, ordered as the model wrote them. */
  lines: OriginLineRange[];
  /** One line (or part of one) the model says stands on those lines. */
  quote?: string;
}

/** What validating a stored or generated `derivedFrom` gives. */
export type OriginParse =
  | { state: 'stated'; origin: ScenarioOrigin }
  | { state: 'not-stated' }
  | { state: 'malformed'; reason: string };

/** One engine object, with the line ranges it stands at. */
export interface OriginEngineObject {
  id: string;
  /** A token out of the source or the engine's title — for the sentence, not for matching. */
  label: string;
  ranges: Array<{ lineStart: number; lineEnd: number }>;
}

/**
 * What the check reads. Built from exactly one source: the one the active run
 * signed (`sourceSha256` is its digest).
 */
export interface OriginEngine {
  sourceSha256: string;
  /** The source split into lines, as every code card splits it. */
  sourceLines: string[];
  /** Business rules `BR-nnn` (`lib/abap/business-rule-set.ts`). */
  rules: OriginEngineObject[];
  /** Exclusive gateways of the process skeleton — the decision points. */
  decisions: OriginEngineObject[];
  /** Every anchored node of the process skeleton. */
  steps: OriginEngineObject[];
  /**
   * The engine's findings `CC-nnn`, read with the catalog the signed run reads.
   * `null` while they are not available: a finding reference is then not
   * checked, never assumed to match.
   */
  findings: OriginEngineObject[] | null;
}

/** A finding as the evidence answer carries it — the part the check reads. */
export interface OriginFindingInput {
  id: string;
  title: string;
  lineStart: number;
  lineEnd?: number;
}

/** The engine's findings as engine objects: one range each, a missing or inverted end read as the start line. */
export function findingObjects(findings: readonly OriginFindingInput[]): OriginEngineObject[] {
  return findings.map((f) => ({
    id: f.id,
    label: f.title,
    ranges: [{ lineStart: f.lineStart, lineEnd: typeof f.lineEnd === 'number' && f.lineEnd >= f.lineStart ? f.lineEnd : f.lineStart }],
  }));
}

/**
 * The outcome, in five values:
 *
 *   - `anchored`     the lines exist, any quote stands on them, and an engine
 *                    object of the stated kind stands there (the named one, when
 *                    a reference was given);
 *   - `lines-only`   the lines exist (and any quote), but no engine object of
 *                    that kind stands there and none was named;
 *   - `mismatch`     the statement does not match the source — a line past
 *                    the end, a reference the engine does not have or that
 *                    stands elsewhere, a quote that is not on those lines;
 *   - `not-stated`   the scenario names no origin, or named a malformed one;
 *   - `not-checked`  there was nothing to check against (no signed source, the
 *                    engine not loaded, findings unavailable for a finding).
 */
export type OriginOutcome = 'anchored' | 'lines-only' | 'mismatch' | 'not-stated' | 'not-checked';

export interface OriginMatch {
  kind: OriginKind;
  id: string;
  label: string;
  lineStart: number;
  lineEnd: number;
  /** `ref` when the model named it, `lines` when the engine found it on the stated lines. */
  by: 'ref' | 'lines';
}

export interface OriginCheck {
  /** Bumped when the rule of this check changes, so a stored result can be told apart. */
  version: 1;
  outcome: OriginOutcome;
  /** The digest of the source the check read; null when there was none. */
  sourceSha256: string | null;
  /** The engine objects the statement is anchored to. Empty unless `anchored`. */
  matches: OriginMatch[];
  /** One sentence per thing that did not match. Empty unless `mismatch`. */
  problems: string[];
  /** The result in one sentence. */
  sentence: string;
}

/* ------------------------------------------------------------- constants */

const MAX_LINE = 1_000_000;
const MAX_RANGES = 20;
const MAX_SPAN = 2_000;
const MAX_REF = 40;
const MAX_QUOTE = 400;

export const ORIGIN_KIND_WORD: Record<OriginKind, string> = {
  rule: 'Business rule',
  decision: 'Decision point',
  finding: 'Finding',
  step: 'Process step',
};

const KIND_NOUN: Record<OriginKind, string> = {
  rule: 'business rule',
  decision: 'decision point',
  finding: 'finding',
  step: 'process step',
};

/** The short word of an outcome, as the row chip shows it. */
export const ORIGIN_OUTCOME_WORD: Record<OriginOutcome, string> = {
  anchored: 'Anchored',
  'lines-only': 'Not anchored',
  mismatch: 'Mismatch',
  'not-stated': 'Not anchored',
  'not-checked': 'Not checked',
};

/* ---------------------------------------------------------------- parse */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLineNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_LINE;
}

/** `412`, `"412"`, `"L412"`, `"412-414"`, `"L412-L414"`, `[412, 414]`, `{start, end}`. */
function rangeOf(raw: unknown): OriginLineRange | string {
  let start: unknown;
  let end: unknown;
  if (typeof raw === 'number') {
    start = raw;
    end = raw;
  } else if (typeof raw === 'string') {
    const m = raw.trim().match(/^L?\s*(\d{1,7})(?:\s*[-–]\s*L?\s*(\d{1,7}))?$/i);
    if (!m) return `"${raw.slice(0, 40)}" is not a line number or a range`;
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : start;
  } else if (Array.isArray(raw) && raw.length === 2) {
    [start, end] = raw;
  } else if (isPlainObject(raw)) {
    start = raw.start ?? raw.from ?? raw.lineStart;
    end = raw.end ?? raw.to ?? raw.lineEnd ?? start;
  } else {
    return 'a line is neither a number nor a range';
  }
  if (!isLineNumber(start) || !isLineNumber(end)) return 'a line number is not a positive whole number';
  if (end < start) return `the range ${start}-${end} ends before it starts`;
  if (end - start > MAX_SPAN) return `the range ${start}-${end} spans more than ${MAX_SPAN} lines`;
  return { start, end };
}

/** Engine ids as the engine writes them: `br-9` → `BR-009`, `CC-17` → `CC-017`, node ids lower case. */
export function normaliseRef(raw: string): string {
  const t = raw.trim();
  const numbered = t.match(/^(BR|CC)[-_ ]?(\d{1,6})$/i);
  if (numbered) return `${numbered[1].toUpperCase()}-${numbered[2].padStart(3, '0')}`;
  if (/^nd-/i.test(t)) return t.toLowerCase();
  return t;
}

/**
 * Validate a `derivedFrom` the model wrote or the project stores. Anything that
 * is not the asked-for shape is `malformed`, with the reason — never thrown,
 * never repaired into something the model did not say.
 */
export function parseScenarioOrigin(raw: unknown): OriginParse {
  if (raw === undefined || raw === null) return { state: 'not-stated' };
  if (typeof raw === 'string' && !raw.trim()) return { state: 'not-stated' };
  if (!isPlainObject(raw)) return { state: 'malformed', reason: 'it is not an object with a kind and lines' };

  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  if (!(ORIGIN_KINDS as readonly string[]).includes(kind)) {
    return { state: 'malformed', reason: `its kind is ${typeof raw.kind === 'string' ? `"${raw.kind.slice(0, 40)}"` : 'missing'}, not rule, decision, finding or step` };
  }

  const rawLines = Array.isArray(raw.lines) ? raw.lines : raw.lines !== undefined && raw.lines !== null ? [raw.lines] : [];
  if (rawLines.length === 0) return { state: 'malformed', reason: 'it names no source line' };
  if (rawLines.length > MAX_RANGES) return { state: 'malformed', reason: `it names more than ${MAX_RANGES} line ranges` };
  const lines: OriginLineRange[] = [];
  for (const item of rawLines) {
    const range = rangeOf(item);
    if (typeof range === 'string') return { state: 'malformed', reason: range };
    if (!lines.some((l) => l.start === range.start && l.end === range.end)) lines.push(range);
  }

  const origin: ScenarioOrigin = { kind: kind as OriginKind, lines };

  if (raw.ref !== undefined && raw.ref !== null && !(typeof raw.ref === 'string' && !raw.ref.trim())) {
    if (typeof raw.ref !== 'string') return { state: 'malformed', reason: 'its reference is not text' };
    const ref = raw.ref.trim();
    if (ref.length > MAX_REF || !/^[A-Za-z0-9][A-Za-z0-9_\-. ]*$/.test(ref)) {
      return { state: 'malformed', reason: 'its reference is not an id like BR-009' };
    }
    origin.ref = normaliseRef(ref);
  }

  if (raw.quote !== undefined && raw.quote !== null && !(typeof raw.quote === 'string' && !raw.quote.trim())) {
    if (typeof raw.quote !== 'string') return { state: 'malformed', reason: 'its quote is not text' };
    const quote = raw.quote.trim();
    if (quote.length > MAX_QUOTE) return { state: 'malformed', reason: `its quote is longer than ${MAX_QUOTE} characters` };
    origin.quote = quote;
  }

  return { state: 'stated', origin };
}

/* ---------------------------------------------------------------- check */

/** `L412`, `L412-414`. */
export function lineWord(range: { start: number; end: number } | { lineStart: number; lineEnd: number }): string {
  const s = 'start' in range ? range.start : range.lineStart;
  const e = 'end' in range ? range.end : range.lineEnd;
  return s === e ? `L${s}` : `L${s}-${e}`;
}

function linesWord(ranges: readonly OriginLineRange[]): string {
  return ranges.map(lineWord).join(', ');
}

/** "L412 exists", "L412-414 exist", "L12, L40 exist". */
function linesExistWord(ranges: readonly OriginLineRange[]): string {
  const single = ranges.length === 1 && ranges[0].start === ranges[0].end;
  return `${linesWord(ranges)} ${single ? 'exists' : 'exist'}`;
}

/** `BR-009 at L412`; an opaque node id carries its label: `nd-262-0 (IF lv_dev_pct > 5) at L412`. */
function matchWord(m: OriginMatch): string {
  const label = m.kind === 'decision' || m.kind === 'step' ? ` (${m.label.replace(/\s+/g, ' ').slice(0, 60)})` : '';
  return `${m.id}${label} at ${lineWord(m)}`;
}

/** Whitespace runs as one space: indentation and line breaks are not part of what a quote says. */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function overlaps(a: OriginLineRange, b: { lineStart: number; lineEnd: number }): boolean {
  return a.start <= b.lineEnd && b.lineStart <= a.end;
}

function objectsOf(engine: OriginEngine, kind: OriginKind): OriginEngineObject[] | null {
  switch (kind) {
    case 'rule':
      return engine.rules;
    case 'decision':
      return engine.decisions;
    case 'finding':
      return engine.findings;
    case 'step':
      return engine.steps;
  }
}

function firstOverlap(obj: OriginEngineObject, lines: readonly OriginLineRange[]): { lineStart: number; lineEnd: number } | null {
  for (const r of obj.ranges) if (lines.some((l) => overlaps(l, r))) return r;
  return null;
}

export const NOT_STATED_CHECK_SENTENCE = 'The scenario names no business rule, decision point, finding or source line.';

function result(
  outcome: OriginOutcome,
  sourceSha256: string | null,
  sentence: string,
  extra: { matches?: OriginMatch[]; problems?: string[] } = {},
): OriginCheck {
  return { version: 1, outcome, sourceSha256, matches: extra.matches ?? [], problems: extra.problems ?? [], sentence };
}

/** The check without an engine: there is nothing to read the statement against. */
export function originNotChecked(origin: ScenarioOrigin | null, reason: string, sourceSha256: string | null = null): OriginCheck {
  if (!origin) return result('not-stated', sourceSha256, NOT_STATED_CHECK_SENTENCE);
  return result('not-checked', sourceSha256, reason);
}

/**
 * Check one statement against the signed source and the engine's objects.
 * Deterministic: the same statement and the same source give the same result.
 */
export function checkScenarioOrigin(origin: ScenarioOrigin | null, engine: OriginEngine): OriginCheck {
  const sha = engine.sourceSha256;
  if (!origin) return result('not-stated', sha, NOT_STATED_CHECK_SENTENCE);

  // A source ending in a line break has no line after it.
  const total =
    engine.sourceLines.length > 0 && engine.sourceLines[engine.sourceLines.length - 1] === ''
      ? engine.sourceLines.length - 1
      : engine.sourceLines.length;
  const problems: string[] = [];

  // 1. The lines exist in the signed source.
  for (const range of origin.lines) {
    if (range.end > total) {
      problems.push(`${lineWord(range)} is past the end of the source, which has ${total} lines.`);
    }
  }
  const linesExist = problems.length === 0;

  // 2. A quote occurs verbatim on those lines (whitespace runs read as one space).
  if (linesExist && origin.quote) {
    const onLines = origin.lines.map((r) => engine.sourceLines.slice(r.start - 1, r.end).join('\n')).join('\n');
    if (!squash(onLines).includes(squash(origin.quote))) {
      problems.push(`The quote "${origin.quote}" does not stand on ${linesWord(origin.lines)}.`);
    }
  }

  // 3. A named reference is an engine object of that kind anchored on those lines.
  const objects = objectsOf(engine, origin.kind);
  const noun = KIND_NOUN[origin.kind];
  const matches: OriginMatch[] = [];
  let refUnchecked = false;
  if (objects === null) {
    refUnchecked = true;
  } else if (origin.ref) {
    const named = objects.find((o) => o.id.toLowerCase() === origin.ref!.toLowerCase());
    if (!named) {
      problems.push(`${origin.ref} is not a ${noun} the engine reads in this source.`);
    } else if (linesExist) {
      const at = firstOverlap(named, origin.lines);
      if (!at) {
        const where = named.ranges.slice(0, 3).map(lineWord).join(', ') || 'no line';
        problems.push(`${named.id} stands at ${where}, not at ${linesWord(origin.lines)}.`);
      } else {
        matches.push({ kind: origin.kind, id: named.id, label: named.label, lineStart: at.lineStart, lineEnd: at.lineEnd, by: 'ref' });
      }
    }
  } else if (linesExist) {
    for (const obj of objects) {
      const at = firstOverlap(obj, origin.lines);
      if (at) matches.push({ kind: origin.kind, id: obj.id, label: obj.label, lineStart: at.lineStart, lineEnd: at.lineEnd, by: 'lines' });
    }
  }

  if (problems.length > 0) {
    return result('mismatch', sha, `Does not match the source: ${problems[0]}`, { problems });
  }
  if (refUnchecked) {
    return result(
      'not-checked',
      sha,
      `${linesExistWord(origin.lines)} in the signed source${origin.quote ? ' and the quote stands there' : ''}; the engine's ${noun}s could not be read, so ${origin.ref ?? 'the reference'} is not checked.`,
    );
  }
  if (matches.length === 0) {
    return result(
      'lines-only',
      sha,
      `${linesExistWord(origin.lines)} in the signed source${origin.quote ? ' and the quote stands there' : ''}, but no ${noun} of the engine stands there.`,
    );
  }
  const shown = matches.slice(0, 3).map(matchWord).join(', ');
  const more = matches.length > 3 ? ` and ${matches.length - 3} more` : '';
  return result(
    'anchored',
    sha,
    matches[0].by === 'ref'
      ? `Checked against the signed source: matches ${shown}.`
      : `Checked against the signed source: no reference was named, and ${shown}${more} ${matches.length === 1 ? 'stands' : 'stand'} on these lines.`,
    { matches },
  );
}

/* ------------------------------------------------------- storage and read */

/** The fields a scenario carries for its origin, besides `derivedFrom` itself. */
export const ORIGIN_CHECK_KEY = 'derivedFromCheck';
export const ORIGIN_DROPPED_KEY = 'derivedFromDropped';

/**
 * A generated scenario as it is stored: `derivedFrom` validated (or dropped,
 * with the reason under `derivedFromDropped`), and the check beside it under
 * `derivedFromCheck`. Every other field is left exactly as the model wrote it.
 * No `undefined` value is produced — Firestore refuses them.
 */
export function withOriginCheck(tc: Record<string, unknown>, engine: OriginEngine | null, noEngineReason: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...tc };
  delete out[ORIGIN_CHECK_KEY];
  delete out[ORIGIN_DROPPED_KEY];
  const parsed = parseScenarioOrigin(tc.derivedFrom);
  let origin: ScenarioOrigin | null = null;
  if (parsed.state === 'stated') {
    origin = parsed.origin;
    out.derivedFrom = origin;
  } else {
    delete out.derivedFrom;
    if (parsed.state === 'malformed') out[ORIGIN_DROPPED_KEY] = `The model's statement of origin was dropped: ${parsed.reason}.`;
  }
  out[ORIGIN_CHECK_KEY] = engine ? checkScenarioOrigin(origin, engine) : originNotChecked(origin, noEngineReason);
  return out;
}

/** A stored check, read back defensively — the field is client-written. */
export function storedOriginCheck(raw: unknown): OriginCheck | null {
  if (!isPlainObject(raw)) return null;
  const outcome = raw.outcome;
  if (outcome !== 'anchored' && outcome !== 'lines-only' && outcome !== 'mismatch' && outcome !== 'not-stated' && outcome !== 'not-checked') return null;
  if (typeof raw.sentence !== 'string') return null;
  const matches = Array.isArray(raw.matches)
    ? raw.matches.filter(
        (m): m is OriginMatch =>
          isPlainObject(m) &&
          typeof m.id === 'string' &&
          typeof m.label === 'string' &&
          isLineNumber(m.lineStart) &&
          isLineNumber(m.lineEnd) &&
          (ORIGIN_KINDS as readonly unknown[]).includes(m.kind),
      )
    : [];
  const problems = Array.isArray(raw.problems) ? raw.problems.filter((p): p is string => typeof p === 'string') : [];
  return {
    version: 1,
    outcome,
    sourceSha256: typeof raw.sourceSha256 === 'string' ? raw.sourceSha256 : null,
    matches,
    problems,
    sentence: raw.sentence,
  };
}

/** What the stage shows for one scenario's origin. */
export interface OriginReading {
  /** The model's statement, validated. Null when it named none (or a malformed one). */
  origin: ScenarioOrigin | null;
  /** Why a stored statement was dropped, when it was. */
  dropped: string | null;
  check: OriginCheck;
  /**
   * `live` — checked now against the engine of the signed source;
   * `stored` — the result recorded at generation, for the same source digest,
   *            shown while the engine is not ready;
   * `none` — nothing to check against.
   */
  basis: 'live' | 'stored' | 'none';
  /** The stored result was for another source and has been re-checked. */
  recheckedAfterChange: boolean;
}

/**
 * Read one scenario's origin for display. With the engine, the check is run
 * again — always: it is cheap, and a stored result is client-written, so it is
 * never what decides once the source can be read. Without it, the stored result
 * counts only for the source digest it was computed from.
 */
export function readScenarioOrigin(
  tc: Record<string, unknown>,
  engine: OriginEngine | null,
  signedSha256: string | null,
  noEngineReason: string,
): OriginReading {
  const parsed = parseScenarioOrigin(tc.derivedFrom);
  const origin = parsed.state === 'stated' ? parsed.origin : null;
  const droppedRaw = tc[ORIGIN_DROPPED_KEY];
  const dropped =
    parsed.state === 'malformed'
      ? `The stored statement of origin is not readable: ${parsed.reason}.`
      : typeof droppedRaw === 'string' && droppedRaw.trim()
        ? droppedRaw.trim()
        : null;
  const stored = storedOriginCheck(tc[ORIGIN_CHECK_KEY]);
  if (engine) {
    return {
      origin,
      dropped,
      check: checkScenarioOrigin(origin, engine),
      basis: 'live',
      recheckedAfterChange: !!stored?.sourceSha256 && stored.sourceSha256 !== engine.sourceSha256,
    };
  }
  if (stored && signedSha256 && stored.sourceSha256 === signedSha256 && (stored.outcome === 'not-stated') === (origin === null)) {
    return { origin, dropped, check: stored, basis: 'stored', recheckedAfterChange: false };
  }
  return { origin, dropped, check: originNotChecked(origin, noEngineReason, null), basis: 'none', recheckedAfterChange: false };
}

/* --------------------------------------------------------------- summary */

export interface OriginCounts {
  total: number;
  anchored: number;
  /** Anchored to a business rule `BR-nnn`. */
  anchoredToRule: number;
  mismatch: number;
  notAnchored: number;
  notChecked: number;
}

export function countOrigins(checks: ReadonlyArray<OriginCheck>): OriginCounts {
  const c: OriginCounts = { total: checks.length, anchored: 0, anchoredToRule: 0, mismatch: 0, notAnchored: 0, notChecked: 0 };
  for (const check of checks) {
    if (check.outcome === 'anchored') {
      c.anchored++;
      if (check.matches.some((m) => m.kind === 'rule')) c.anchoredToRule++;
    } else if (check.outcome === 'mismatch') c.mismatch++;
    else if (check.outcome === 'not-checked') c.notChecked++;
    else c.notAnchored++;
  }
  return c;
}

/** "3 of 10 anchored to a business rule · 1 more anchored to the code · 1 mismatch · 5 not anchored". */
export function originSummary(c: OriginCounts): string {
  const parts = [`${c.anchoredToRule} of ${c.total} anchored to a business rule`];
  const otherAnchored = c.anchored - c.anchoredToRule;
  if (otherAnchored > 0) parts.push(`${otherAnchored} more anchored to the code`);
  if (c.mismatch > 0) parts.push(`${c.mismatch} ${c.mismatch === 1 ? 'mismatch' : 'mismatches'}`);
  if (c.notAnchored > 0) parts.push(`${c.notAnchored} not anchored`);
  if (c.notChecked > 0) parts.push(`${c.notChecked} not checked`);
  return parts.join(' · ');
}

/* ---------------------------------------------------------------- prompt */

/** The source with its line numbers, as the testing prompt shows it, so the model can cite lines. */
export function numberedSource(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  const width = String(lines.length).length;
  return lines.map((text, i) => `${String(i + 1).padStart(width, ' ')}| ${text}`).join('\n');
}

const PROMPT_LIST_CAP = 120;

function promptList(objects: readonly OriginEngineObject[], cap = PROMPT_LIST_CAP): string {
  if (objects.length === 0) return '  (none)';
  const shown = objects.slice(0, cap).map((o) => {
    const where = o.ranges.slice(0, 4).map(lineWord).join(', ');
    const label = o.label.replace(/\s+/g, ' ').slice(0, 100);
    return `  ${o.id} at ${where}: ${label}`;
  });
  if (objects.length > cap) shown.push(`  (and ${objects.length - cap} more)`);
  return shown.join('\n');
}

/**
 * The part of the testing prompt that asks for `derivedFrom`, with the engine's
 * objects to choose a reference from. The model is told to leave it out rather
 * than guess — an absent statement reads "not stated", a guessed one is flagged.
 */
export function originPromptSection(engine: OriginEngine | null): string {
  const lists = engine
    ? `
        ENGINE OBJECTS OF THE LEGACY SOURCE (use these ids as "ref"; never invent one):
        Business rules (kind "rule"):
${promptList(engine.rules)}
        Decision points (kind "decision"):
${promptList(engine.decisions)}
        Findings (kind "finding"):
${engine.findings ? promptList(engine.findings) : '  (not available)'}
`
    : '';
  return `
        ORIGIN OF EACH TEST CASE (derivedFrom):
        - For every test case, add "derivedFrom": the business rule, decision point, finding or process step of the LEGACY source it tests.
        - Shape: { "kind": "rule" | "decision" | "finding" | "step", "ref": "<id from the lists below, e.g. BR-009>", "lines": [412] or ["412-414"], "quote": "<one line copied verbatim from those lines>" }.
        - "lines" are the line numbers shown at the left of the numbered legacy source. "ref" and "quote" are optional; leave them out when unsure.
        - If a test case does not rest on a specific place in the legacy source, leave "derivedFrom" out. Never guess an id or a line: every statement is checked against the source, and a wrong one is flagged.
${lists}`;
}
