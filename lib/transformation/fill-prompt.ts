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
/**
 * The most characters `/api/gemini` takes for a call under a generation lease
 * (QA finding 804d0920fff4: a leased call used to accept the route's general
 * 250,000). Twice the fill budget: `bundleFills` keeps a prompt within 14,000
 * by cutting context and ABAP, but what it cannot cut — signature, rules,
 * guards, declarations — can carry one unit over (measured 14,947 on a
 * 1,848-line program, 13.10.2026). The orchestrator never sends a prompt above
 * this; the route refuses one before the lease is read.
 */
export const LEASED_PROMPT_MAX_CHARS = FILL_PROMPT_MAX_CHARS * 2;
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
/** RAP bodies also get rule 25: the scaffold's access layer (`mo_access`) is where SAP is reached (3.0.12, DSAG B4). */
export const FILL_RULE_NUMBERS_RAP = [...FILL_RULE_NUMBERS, 25] as const;

/** The rules above, word for word from `CODE_DRAFT_BUSINESS_RULES`. */
export function fillRulesText(track: 'node' | 'rap' = 'node'): string {
  const lines = CODE_DRAFT_BUSINESS_RULES.split('\n').map((l) => l.trim()).filter(Boolean);
  const byNumber = new Map<number, string>();
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s/);
    if (m) byNumber.set(Number(m[1]), line);
  }
  return (track === 'rap' ? FILL_RULE_NUMBERS_RAP : FILL_RULE_NUMBERS).map((n) => byNumber.get(n)).filter((l): l is string => !!l).join('\n');
}

/**
 * How a body calls the unit's guards and how a predicate reads its inputs.
 * The request lists each guard by name, placement and the keys of its
 * `values`, but not the signatures the scaffold writes for them
 * (`scaffold-node.ts` `guardsFile`, `scaffold-rap.ts`): without these lines
 * the model guessed argument lists (`when_G0877(parent, lvQty)`) and predicate
 * parameters (`lvCode`, `pCase`) that do not exist, and the body guards
 * refused the answer (A/B 13.10.2026, units U16 and U01).
 */
export function fillGuardLines(track: 'node' | 'rap'): string[] {
  if (track === 'node') {
    return [
      '- Guards: helper and predicate take (sel, st, record, values) — record: the row the condition reads, or null; values: { the keys under "values" }, left out when none.',
      '- placement "entry"/"selection": the stub calls it already; never again.',
      '- placement "body": call the helper where the original checks ("line"), never its condition: guard_… returns Refusal | null (`const r = guard_G0345(sel, st, null, { lvCode }); if (r) return r;`); stop_…/skip_… return true where the original ends the step/skips the record.',
      '- A guard with a "regionId": write its predicate when_<id without "-">(sel, st, record, values): boolean, true exactly when "condition" holds, reading only sel, st, record, values.<key>, under "guards": [ { "id": "G-0506", "body": "…" } ].',
    ];
  }
  // Scaffold version 6 (3.0.13): every guard has a predicate when_g<line> with the original's local operands as
  // typed parameters, listed with its exact call in the unit's "types"; the engine writes most predicates itself.
  return [
    '- Guards: each guard of a unit has a predicate when_<id lower case, without "-"> that returns the original\'s condition; "types" lists its signature and the exact call. A guard marked "the engine calls it already": never call it again.',
    '- Every other guard: call it at the original\'s line ("line"), never its condition: IF when_g0387( iv_stamp = iv_stamp ) = abap_true. <the original\'s statements inside that IF> ENDIF. — the parameters take your values of the names the original checks.',
    '- A guard with a "regionId": also write its predicate body, rv_holds = xsdbool( <the condition> ), reading only its parameters, the attributes and constants, under "guards": [ { "id": "G-0506", "body": "…" } ].',
  ];
}

/**
 * The ABAP Cloud rules of a RAP body (3.0.13, after two external reviews of the SD example: 107 parser errors from
 * WRITE, MESSAGE, ULINE and DESCRIBE; bodies written against globals, parameters and access methods the class did
 * not have). The class's contract travels per unit in "types" (`scaffold.rap.unitTypes`).
 */
export function fillRapLines(): string[] {
  return [
    '- "types" of a unit is the logic class around the body, engine-written and fixed: its types, constants, attributes, the methods you may call with their exact signatures, its guards and the SAP access methods. Use only those names; declare your own locals (DATA, inline DATA( ), FIELD-SYMBOLS).',
    '- The original\'s globals and selection inputs are attributes under their original names (gt_claims, gv_status, p_org, s_show): read and write them as the original does. There is no is_sel, cs_st, ty_selection or ty_state.',
    '- A PERFORM of the original is a call of its method with the signature shown: check_stamp( EXPORTING iv_stamp = p_eff CHANGING cv_code = lv_code ). A routine that is not listed was folded into this unit: write its lines in place. Where the original runs demo-data routines, call load_input( ) if the class lists it, else leave them out.',
    '- ABAP Cloud has no WRITE, ULINE, SKIP, NEW-LINE, NEW-PAGE, FORMAT, MESSAGE, DESCRIBE, FORM, PERFORM, CALL FUNCTION, CALL SCREEN, SUBMIT, TABLES, OCCURS, header lines or SELECT on an SAP table: never write them.',
    '- MESSAGE … TYPE \'E\', \'A\' or \'X\' becomes the RAISE EXCEPTION NEW … refusal the class names (guard and the original\'s text); MESSAGE … TYPE \'I\', \'S\' or \'W\' becomes APPEND <text> TO mt_messages; a list (WRITE, ULINE) is left out — its data is in the attributes the run returns; DESCRIBE TABLE t LINES n becomes n = lines( t ).',
    '- SAP is reached only through mo_access-><method>( … ) with the parameters "types" lists; never call SAP directly and never an access method that is not listed.',
    '- Numbers keep the types the class declares (packed with its DECIMALS, i, n, d): compute and compare them as the original does, never through text and never TYPE f.',
  ];
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
    ...(track === 'node' ? ['- "types" of a unit declares every type its signature and callees name: read and write only those fields.'] : fillRapLines()),
    ...fillGuardLines(track),
    ...(track === 'node'
      ? [
          // Defect F (A/B 13.10.2026): "on a decimal value" read as permission for Number() on a TYPE i field.
          '- Numbers reach a body as text (packed, TYPE i, digits). Never Number(), parseFloat() or parseInt() on any value — NaN passes every range check — nor arithmetic operators on a decimal.',
          '- Use dec.compare(a, b) (exact; throws on a non-number), dec.add/sub/mul/div(a, b, places), dec.isZero(a); digits: /^\\d+$/.test(x); a date: new Date(`${y}-${m}-${d}T00:00:00Z`).toJSON()?.slice(0, 10) === `${y}-${m}-${d}`.',
        ]
      : []),
    '- Implement each rule as its decision says: "keep" and "open" as the original does; "change" as the owner\'s proposal says, not as the original does.',
    '- If you cannot write a body faithfully from the ABAP shown, answer "refused": { "reason": "…" } for that unit instead of guessing.',
    '- Answer with JSON only: { "units": [ { "unitId", "body", "guards": [], "needs": [] } ] } — one entry per unit asked for; "refused" only on a unit you refuse.',
    'CODE-DRAFT RULES (by number, unchanged):',
    fillRulesText(track),
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
  /** The most characters of a call of several units (default `FILL_PROMPT_MAX_CHARS`). */
  maxChars?: number;
  /** The most characters of a call of one unit before its context or ABAP is cut (default `LEASED_PROMPT_MAX_CHARS`). */
  maxAloneChars?: number;
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
 * characters per prompt of several units. A unit that does not fit 14,000
 * goes alone, and alone it may use up to `LEASED_PROMPT_MAX_CHARS` (28,000)
 * uncut (13.10.2026: cutting a unit to 14,000 dropped 108 of its ABAP lines,
 * and the model then — rightly — declined it every time). Never drops a unit;
 * a unit too large even for that is cut (context first, then its ABAP slice
 * from the end) and the cut is reported.
 */
export function bundleFills(units: readonly FillRequestUnit[], opts: BundleOptions): FillBundle[] {
  const perCall = Math.max(1, Math.min(opts.unitsPerCall ?? FILL_UNITS_PER_CALL, 6));
  const maxChars = opts.maxChars ?? FILL_PROMPT_MAX_CHARS;
  const maxAlone = Math.max(maxChars, opts.maxAloneChars ?? LEASED_PROMPT_MAX_CHARS);
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
    const aloneRequest = requestOf(opts, context, [unit]);
    const alonePrompt = fillPrompt(aloneRequest);
    if (alonePrompt.length <= maxChars) {
      current = [unit];
      continue;
    }
    if (alonePrompt.length <= maxAlone) {
      // Too large to share a call, small enough to go alone uncut.
      bundles.push({ unitIds: [unit.unitId], request: aloneRequest, prompt: alonePrompt, trimmed: [] });
      continue;
    }
    // Alone and still too large: give up context, then the end of the slice.
    const trimmed: FillBundle['trimmed'] = [];
    let ctx = context;
    let u = unit;
    let over = fillPrompt(requestOf(opts, ctx, [u])).length - maxAlone;
    if (over > 0 && ctx.length > 0) {
      const cut = cutContext(ctx, Math.max(0, ctx.length - over - 80));
      trimmed.push({ unitId: unit.unitId, what: 'context', chars: ctx.length - cut.text.length });
      ctx = cut.text;
      over = fillPrompt(requestOf(opts, ctx, [u])).length - maxAlone;
    }
    // JSON escaping makes a character of the slice cost more than one in the
    // prompt, so the cut is measured again until it fits.
    let abapCut = 0;
    for (let i = 0; over > 0 && i < 20; i++) {
      const cut = cutAbap(unit, over + abapCut);
      abapCut = cut.cut;
      u = cut.unit;
      over = fillPrompt(requestOf(opts, ctx, [u])).length - maxAlone;
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
 *
 * `refused`: the schema types it as an object, so a model cannot answer null;
 * absent, or without a non-blank reason, it reads as not refused. A reason the
 * model writes is taken at its word — `{ "reason": "none" }` included — and the
 * body is not used: splicing on a guess about what the model meant is worse
 * than one more repair round (A/B 13.10.2026; the header asks to leave it out).
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
