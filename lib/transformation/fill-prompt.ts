/**
 * The per-unit fill prompt of the engine-led transformation
 * (`docs/design/engine-led-transformation.md` §8, Track C).
 *
 * The engine has written the package's skeleton; a fill call asks the model
 * for the body of one to four functions, and nothing else. What a call holds:
 *
 *   - a fixed instruction header (what to write, what never to write);
 *   - the context pack text (PLATFORM KNOWLEDGE essentials, ≤ 3,000 chars,
 *     built by Track A — passed in as text, so this module does not depend on
 *     A's types);
 *   - the code-draft rules that concern a function body, by number and
 *     unchanged (`lib/code-draft-rules.ts`) — the rules about the input
 *     contract, the run store, CSV, the app factory and the call contract are
 *     carried out by the engine-written scaffold, so asking the model for them
 *     again would only invite a second implementation;
 *   - per unit: its signature, its ABAP slice with original line numbers, its
 *     rules with the owner's decisions, its guards, its decimal facts and the
 *     names it may call.
 *
 * Every prompt is at most 14,000 characters. Bundles hold 1–4 units in the
 * order given (the orchestrator orders leaves first, so neighbours in the call
 * tree travel together). A unit that alone would overflow first gives up
 * context-pack lines from the end, then the end of its ABAP slice — each cut
 * is said in the prompt and returned in `trimmed`, never silent.
 *
 * The answer is JSON (`TRANSFORMATION_FILL_SCHEMA`), validated here before any
 * body is spliced: only units that were asked for, one answer each, a string
 * body, `needs` as a string list, `refused` with a reason.
 *
 * Pure: no network, no model, no React.
 */

import { CODE_DRAFT_BUSINESS_RULES } from '../code-draft-rules';
import { parseModelJsonObject } from '../model-json';
import type { FillAnswerUnit, FillRepair, FillRequest, FillRequestUnit } from './types';

/** No fill prompt is longer than this (design §2 goal 4, §7.2). */
export const FILL_PROMPT_MAX_CHARS = 14_000;
/** The context pack's share of one prompt (§5). */
export const FILL_CONTEXT_MAX_CHARS = 3_000;
/** Units per call (§8.3). */
export const FILL_UNITS_PER_CALL = 4;
/** A repair failure is cut to this many characters (§13.2 step 3). */
export const FILL_REPAIR_FAILURE_MAX_CHARS = 2_000;
/** The previous body a repair carries is cut to this many characters. */
export const FILL_REPAIR_PREVIOUS_MAX_CHARS = 4_000;

/**
 * The code-draft rules a function body has to follow. 16 (input contract),
 * 18 (run store), 20 (CSV), 22 (app factory) and 24 (call contract) are
 * engine-written in the scaffold (§6.2) and are therefore not asked for.
 */
export const FILL_RULE_NUMBERS = [11, 12, 13, 14, 15, 17, 19, 21, 23] as const;

/** The rules above, word for word from `CODE_DRAFT_BUSINESS_RULES`. */
export function fillRulesText(): string {
  const lines = CODE_DRAFT_BUSINESS_RULES.split('\n').map((l) => l.trim()).filter(Boolean);
  const byNumber = new Map<number, string>();
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s/);
    if (m) byNumber.set(Number(m[1]), line);
  }
  return FILL_RULE_NUMBERS.map((n) => byNumber.get(n)).filter((l): l is string => !!l).join('\n');
}

/** The fixed instruction header (§8.2). */
export function fillInstructionHeader(track: 'node' | 'rap'): string {
  const lang = track === 'node' ? 'TypeScript' : 'ABAP Cloud';
  const forbidden =
    track === 'node'
      ? 'imports, exports, types, interfaces, function or class declarations, signatures'
      : 'METHOD/ENDMETHOD, CLASS, DEFINITION or IMPLEMENTATION statements, signatures';
  return [
    `You write the ${lang} BODY of each function named under "units" of the request below — the statements between its braces and nothing else.`,
    'The package around them is written by Clean-Core.io from the original ABAP program and is fixed: the signatures, the guard calls, the decimal, input, run and CSV helpers and the file layout cannot be changed by you.',
    'Rules for every body:',
    `- Do not write ${forbidden}, and never the text "@cc-fill".`,
    '- Call only names listed under "available" for that unit (helpers and callees). If you need another allowlisted helper, name it under "needs".',
    '- Keep every guard call the stub already makes; never re-implement a guard condition inline.',
    '- Amounts and quantities only through the dec.* helpers — never Number(), parseFloat(), parseInt() or arithmetic operators on a decimal value.',
    '- Implement each rule as its decision says: "keep" and "open" as the original does; "change" as the owner\'s proposal says, not as the original does.',
    '- If you cannot write a body faithfully from the ABAP shown, answer "refused": { "reason": "…" } for that unit instead of guessing.',
    `- A guard listed with a "regionId" under a unit is a check of the original whose condition you write as well: its predicate body — statements that return ${track === 'node' ? 'true' : "abap_true"} exactly when the original's "condition" holds, reading only the parameters of its signature. Answer it under "guards": [ { "id": "G-0506", "body": "…" } ] of that unit; the engine calls it where the original checks.`,
    '- Answer with JSON only: { "units": [ { "unitId", "body", "guards": [], "needs": [], "refused": null } ] } — one entry per unit asked for.',
    'CODE-DRAFT RULES (by number, unchanged):',
    fillRulesText(),
  ].join('\n');
}

/** The prompt string sent to `/api/gemini`: the header and the request serialised. */
export function fillPrompt(request: FillRequest): string {
  return `${fillInstructionHeader(request.track)}\n\nREQUEST (JSON):\n${JSON.stringify(request)}`;
}

export interface FillBundle {
  /** The units of this call, in order. */
  unitIds: string[];
  request: FillRequest;
  prompt: string;
  /** What was cut to stay within the budget, per unit — said in the prompt as well. */
  trimmed: Array<{ unitId: string; what: 'context' | 'abap'; chars: number }>;
}

export interface BundleOptions {
  track: 'node' | 'rap';
  program: string | null;
  /** The context pack text (`contextPackText(ctx, 3000)`); cut to 3,000 when longer. */
  context: string;
  /** Repair rounds: the failure and previous body per unit id. */
  repair?: ReadonlyMap<string, FillRepair> | null;
  unitsPerCall?: number;
  maxChars?: number;
}

function cutRepair(r: FillRepair): FillRepair {
  return {
    unitId: r.unitId,
    round: r.round,
    failure: r.failure.length > FILL_REPAIR_FAILURE_MAX_CHARS ? `${r.failure.slice(0, FILL_REPAIR_FAILURE_MAX_CHARS - 1)}…` : r.failure,
    previousBody:
      r.previousBody && r.previousBody.length > FILL_REPAIR_PREVIOUS_MAX_CHARS
        ? `${r.previousBody.slice(0, FILL_REPAIR_PREVIOUS_MAX_CHARS - 1)}…`
        : r.previousBody,
  };
}

/** The context pack cut to `max` characters at a line end, saying how many lines were dropped. */
export function cutContext(context: string, max: number): { text: string; cut: number } {
  if (context.length <= max) return { text: context, cut: 0 };
  if (max <= 0) return { text: '', cut: context.length };
  const lines = context.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    // Room for the note line below.
    if (used + line.length + 1 > max - 60) break;
    kept.push(line);
    used += line.length + 1;
  }
  const dropped = lines.length - kept.length;
  const text = `${kept.join('\n')}\n[${dropped} context line${dropped === 1 ? '' : 's'} dropped to fit the prompt budget]`;
  return { text: text.length <= max ? text : text.slice(0, max), cut: context.length - kept.join('\n').length };
}

/** A unit's ABAP slice cut at a line end so the unit costs at most `excess` characters fewer. */
function cutAbap(unit: FillRequestUnit, excess: number): { unit: FillRequestUnit; cut: number } {
  const lines = unit.abap.text.split('\n');
  let removed = 0;
  let removedLines = 0;
  while (lines.length > 1 && removed < excess + 80) {
    const last = lines.pop()!;
    removed += last.length + 1;
    removedLines++;
  }
  const text = `${lines.join('\n')}\n[${removedLines} ABAP line${removedLines === 1 ? '' : 's'} at the end of this slice cut to fit the prompt budget]`;
  return { unit: { ...unit, abap: { ...unit.abap, text } }, cut: removed };
}

function requestOf(opts: BundleOptions, context: string, units: FillRequestUnit[]): FillRequest {
  const repair = opts.repair
    ? units.map((u) => opts.repair!.get(u.unitId)).filter((r): r is FillRepair => !!r).map(cutRepair)
    : [];
  return {
    schema: 'cc.fill.v1',
    track: opts.track,
    program: opts.program,
    context,
    rules: 'See CODE-DRAFT RULES in the header.',
    units,
    repair: repair.length > 0 ? repair : null,
  };
}

/**
 * The fill calls for these units, in their order: ≤ 4 units and ≤ 14,000
 * characters per prompt. Never drops a unit; a unit too large alone is cut
 * (context first, then its ABAP slice from the end) and the cut is reported.
 */
export function bundleFills(units: readonly FillRequestUnit[], opts: BundleOptions): FillBundle[] {
  const perCall = Math.max(1, Math.min(opts.unitsPerCall ?? FILL_UNITS_PER_CALL, 6));
  const maxChars = opts.maxChars ?? FILL_PROMPT_MAX_CHARS;
  const context = cutContext(opts.context, FILL_CONTEXT_MAX_CHARS).text;

  const bundles: FillBundle[] = [];
  let current: FillRequestUnit[] = [];

  const close = () => {
    if (current.length === 0) return;
    const request = requestOf(opts, context, current);
    bundles.push({ unitIds: current.map((u) => u.unitId), request, prompt: fillPrompt(request), trimmed: [] });
    current = [];
  };

  for (const unit of units) {
    const tryWith = [...current, unit];
    if (current.length < perCall && fillPrompt(requestOf(opts, context, tryWith)).length <= maxChars) {
      current = tryWith;
      continue;
    }
    close();
    if (fillPrompt(requestOf(opts, context, [unit])).length <= maxChars) {
      current = [unit];
      continue;
    }
    // Alone and still too large: give up context, then the end of the slice.
    const trimmed: FillBundle['trimmed'] = [];
    let ctx = context;
    let u = unit;
    let over = fillPrompt(requestOf(opts, ctx, [u])).length - maxChars;
    if (over > 0 && ctx.length > 0) {
      const cut = cutContext(ctx, Math.max(0, ctx.length - over - 80));
      trimmed.push({ unitId: unit.unitId, what: 'context', chars: ctx.length - cut.text.length });
      ctx = cut.text;
      over = fillPrompt(requestOf(opts, ctx, [u])).length - maxChars;
    }
    // JSON escaping makes a character of the slice cost more than one in the
    // prompt, so the cut is measured again until it fits.
    let abapCut = 0;
    for (let i = 0; over > 0 && i < 20; i++) {
      const cut = cutAbap(unit, over + abapCut);
      abapCut = cut.cut;
      u = cut.unit;
      over = fillPrompt(requestOf(opts, ctx, [u])).length - maxChars;
      if (cut.unit.abap.text.split('\n').length <= 2) break;
    }
    if (abapCut > 0) trimmed.push({ unitId: unit.unitId, what: 'abap', chars: abapCut });
    const request = requestOf(opts, ctx, [u]);
    bundles.push({ unitIds: [unit.unitId], request, prompt: fillPrompt(request), trimmed });
  }
  close();
  return bundles;
}

/* -------------------------------------------------------------- answer */

export type FillAnswerCheck =
  | { ok: true; units: FillAnswerUnit[]; missing: string[] }
  | { ok: false; reason: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A guard id as the plan writes it: `G-0506`. */
const GUARD_ID = /^G-\d{4,}$/;

/**
 * The predicate bodies of an answer (design §9.1: a guard's predicate is a fill
 * region of its own, `U02.G0506`): the schema's list `[{ id, body }]`, or a map
 * by guard id. Only string bodies under a well-formed guard id are taken; the
 * splice checks each body like any other before it lands.
 */
export function guardBodiesOf(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (id: unknown, body: unknown) => {
    if (typeof id !== 'string' || !GUARD_ID.test(id) || typeof body !== 'string' || !body.trim() || id in out) return;
    out[id] = body;
  };
  if (Array.isArray(raw)) {
    for (const g of raw.slice(0, 40)) if (isPlainObject(g)) take(g.id, g.body);
  } else if (isPlainObject(raw)) {
    for (const [id, body] of Object.entries(raw).slice(0, 40)) take(id, body);
  }
  return out;
}

/** The fill region of a guard's predicate: `U02` + `G-0506` → `U02.G0506` (`unit-plan.ts`). */
export const predicateRegionOf = (unitId: string, guardId: string): string => `${unitId}.${guardId.replace('-', '')}`;

/**
 * The model's answer to one fill call, checked before any body is used:
 * JSON with a `units` list; each entry names a unit that was asked for, once,
 * with a string body (may be empty only when refused), `needs` as strings and
 * `refused` null or `{ reason }`. Units asked for and not answered come back
 * as `missing`; entries for units not asked for are dropped.
 */
export function parseFillAnswer(text: string | null | undefined, askedFor: readonly string[]): FillAnswerCheck {
  const parsed = parseModelJsonObject(text);
  if (!parsed.ok) return { ok: false, reason: `The answer is not usable JSON (${parsed.reason}).` };
  const list = parsed.value.units;
  if (!Array.isArray(list)) return { ok: false, reason: 'The answer has no "units" list.' };
  const wanted = new Set(askedFor);
  const seen = new Set<string>();
  const units: FillAnswerUnit[] = [];
  for (const raw of list) {
    if (!isPlainObject(raw) || typeof raw.unitId !== 'string') continue;
    if (!wanted.has(raw.unitId) || seen.has(raw.unitId)) continue;
    const refused =
      isPlainObject(raw.refused) && typeof raw.refused.reason === 'string' && raw.refused.reason.trim()
        ? { reason: raw.refused.reason.trim().slice(0, 500) }
        : null;
    const body = typeof raw.body === 'string' ? raw.body : '';
    if (!refused && body.trim() === '') continue; // neither a body nor a reason: unanswered
    const needs = Array.isArray(raw.needs) ? raw.needs.filter((n): n is string => typeof n === 'string').slice(0, 20) : [];
    seen.add(raw.unitId);
    const guards = refused ? {} : guardBodiesOf(raw.guards);
    units.push({ unitId: raw.unitId, body: refused ? '' : body, ...(Object.keys(guards).length > 0 ? { guards } : {}), needs, refused });
  }
  return { ok: true, units, missing: askedFor.filter((id) => !seen.has(id)) };
}
