/**
 * Rules for the Transformation code draft, and a deterministic lint over what
 * the model wrote.
 *
 * External review of FI_Collection_Worklist, F-01 and F-02 (owner, 11.10.2026):
 * the generated service looked up a credit memo's reference with
 *
 *     const referenceItem01 = filteredItems.find(i => i.belnr === '1900000001');
 *
 * — a document number out of its own demo data, used as business logic for
 * every item. A credit of another customer took that invoice's due date, and
 * the item's bucket then depended on whether customer 0000100001 was selected.
 * And the totals and the CSV built their own selection, without the customer
 * filter the list applied.
 *
 * The prompt rules below say what the original says (a reference validates
 * identity with the full key and the customer; posted values are kept;
 * missing dates are not invented) and that one selection serves every
 * endpoint. The lint is the check that does not rely on the model listening:
 * a document-number-shaped literal compared in business logic is flagged as a
 * Transformation warning, and more strongly when the same literal is a value of
 * the code's own demo data.
 *
 * Rule 24 (owner, 12.10.2026): the call contract (`lib/engine-call-contract.ts`)
 * the engine cases run against without a model-written assertion
 * (`scripts/acceptance/engine-cases.mjs`).
 *
 * Rules 15–23 (roadmap 3.0.12; CO/FI/PP/SD reviews): the generated packages of
 * four external reviews dropped the original's guards, accepted "2026x" as a
 * year, computed packed quantities in binary floating point, kept a global
 * "latest result", ignored options, started a server on import and named
 * in-memory stores after SAP APIs. The rules say what to keep; the FACTS
 * section (`codeDraftFactsSection`) says which checks, places and inputs this
 * source has — read by `lib/abap/original-contract.ts` and the engine's
 * control rules, never by a model.
 *
 * Pure, no network, no model.
 */

import { sandboxFilesFromStoredCode, type SandboxFile } from './test-sandbox/files';
import { codeMask, lineAt } from './ts-source-scan';
import type { Guard, OriginalContract } from './abap/original-contract';

/** The rules section of the Node.js code-draft prompt (numbered on from the stage's own list). */
export const CODE_DRAFT_BUSINESS_RULES = `
        11. CRITICAL — NO HARD-CODED DATA IN BUSINESS LOGIC: never compare against, look up or branch on a literal document number, customer number, company code value or any other value of the demo/sample data (for example: items.find(i => i.belnr === '1900000001') is forbidden). Demo data may only live in a clearly named mock/sample-data function and is never referenced by the logic.
        12. REFERENCE LOOKUPS USE THE FULL KEY AND THE IDENTITY: when an item refers to another document (invoice reference, clearing document, predecessor), look it up per item with the complete key the original uses (company code, document number, fiscal year, line item — and the customer or vendor it must belong to, and its account type), and keep the original's behaviour when the reference is missing or belongs to someone else.
        13. ONE SELECTION FOR EVERY ENDPOINT: every endpoint that answers for the same selection (a list, its totals, its export or file, an audit record) MUST read the selection through ONE shared, validated selection function and pass the same selection object on. No endpoint may drop, rename or re-default a filter that another endpoint of the same selection applies.
        14. KEEP POSTED VALUES, DO NOT INVENT MISSING ONES: keep the item's own posted values (amounts, payment terms, baseline date, due date). Where the original leaves a value unknown (for example, no baseline date → due date unknown), the target leaves it unknown too and reports it — never fill it from another item, a default or today's date.
        15. GUARDS FIRST: every check of the original that refuses, stops or skips input (listed under FACTS OF THE ORIGINAL with its rule id or line — e.g. a duplicate receiver, the sender as its own receiver, quotas over 100 %, an unknown segment, no receivers, a status precondition) is carried over and run on the whole input BEFORE any calculation. A refusal names the rule id or line ("BR-002, L42"). Never compute on input the original refuses.
        16. ONE INPUT CONTRACT FOR EVERY CHANNEL: CSV, JSON and query input pass the SAME validator: required context fields (e.g. controlling area, fiscal year), unique keys, complete rows, strictly parsed finite numbers (refuse "2026x", "1.9" for an integer, "", NaN, Infinity — never parseInt/parseFloat/Number() alone), the upper bound of the declared type, real calendar dates (20260230 is refused); null or missing is not 0. An empty request or empty selection is refused or reported as empty — never a successful simulation.
        17. PRECISION AS DECLARED: a packed decimal (TYPE p … DECIMALS n) is computed exactly — BigInt scaled by 10^n or decimal strings, never binary floating point, and no new dependency for it. Each field keeps its places (a ratio of 6 places stays 6); round commercially (half away from zero) for negative and positive values alike, only where the original rounds.
        18. RUN BINDING: no module-level "latest result" or other mutable global state. Every result and export is bound to an immutable, collision-free run id (crypto.randomUUID(), never Date.now()) carrying the selection, the source revision and the rule revision; a stored run is never overwritten, and every export names its run.
        19. EVERY OPTION HONOURED OR REFUSED: each selection input and option of the original (filters, flags such as includeCredit, display filters) is implemented, or refused with a clear error — never accepted and ignored. Keep compute, display and export scope apart: display attributes (ALV colours, column widths, icons) are not part of the API contract.
        20. OUTPUT GUARDS KEPT: CSV follows RFC 4180 (quote fields holding a comma, quote or line break; double inner quotes) and neutralises formulas (a cell starting with =, +, -, @, tab or CR gets a leading apostrophe).
        21. NOT FOUND IS NOT EMPTY, EMPTY IS NOT ZERO: keep "record not found" apart from "found but empty", and 0 apart from "no value" (a credit limit of 0 is a limit). Date arithmetic in UTC; every amount carries its currency and precision.
        22. NO SERVER ON IMPORT: export an app factory (createApp()) and listen only in a separate entry point, so importing the module for a test never opens a port.
        23. HONEST NAMES: never name a class, function, message, log line or comment after an SAP API, OData call, event or integration the code does not perform (an in-memory store is not an "S4HanaAdapter"; no "updated via OData PATCH" without that call). An event publisher only where SAP has no standard business event for the change, never in SAP's namespace (no sap.s4.* topics or types). package.json declares exactly the dependencies the code imports.
        24. CALL CONTRACT: also write srv/engine-contract.ts (no server, no I/O on import) exporting CONTRACT = { version: 1, baseRequest: <a request every check passes, still valid with a copy of its first record appended>, fields: { '<ORIGINAL field as in FACTS, e.g. P_GJAHR, QUOTA>': '<request path, e.g. fiscalYear, receivers[].quota>' or null if internal } }, validate(request) → { ok, errors: [{ field, rule, message }], normalized } (decimals as strings at their places), simulate(request) → { ok, runId, records, errors } (records = input records in the result; a refusal names the rule id or line) and getRun(runId) and compute(field, a, op, b) (+ - * / on decimal strings for every decimal field of FACTS, internal ones too, rounded commercially to its places). They call the real validator, checks, engine and decimal code; values arrive as strings.
`;

/** Most checks the facts section lists; the rest are counted. Keeps the prompt within its budget. */
export const MAX_FACT_GUARDS = 40;
/** Most packed decimals and most selection inputs the facts section lists each. */
export const MAX_FACT_FIELDS = 30;

/** A control rule of the engine, as `materialRules` hands it over (roadmap 3.0.12). */
export interface FactRule {
  id: string;
  type: 'rule' | 'control';
  label: string;
  ranges: ReadonlyArray<{ lineStart: number; lineEnd: number }>;
}

const EFFECT_WORD: Record<Guard['effect'], string> = {
  'error-message': 'refuses with an error message',
  return: 'returns',
  exit: 'exits',
  continue: 'skips the item',
  check: 'skips or leaves when false',
  leave: 'leaves',
  stop: 'stops',
  raise: 'raises',
};

/**
 * The FACTS OF THE ORIGINAL section of the code-draft prompt (roadmap 3.0.12;
 * CO/FI/PP/SD reviews): the checks that refuse, stop or skip — with the
 * engine's rule id where a control rule stands on the line — the packed
 * decimals with places and bounds, and the selection inputs. Read from the
 * legacy source without a model; rules 15–19 say what to do with them.
 *
 * `null` for the contract when the source could not be read: the section then
 * says so instead of claiming there is nothing to keep.
 */
export function codeDraftFactsSection(contract: OriginalContract | null, rules: readonly FactRule[] = []): string {
  if (!contract) {
    return `
        FACTS OF THE ORIGINAL: the engine could not read the legacy source's checks and declarations. Read them from the source yourself and keep them (rules 15–19).
`;
  }
  const controls = rules.filter((r) => r.type === 'control');
  const ruleAt = (line: number) => controls.find((r) => r.ranges.some((x) => x.lineStart <= line && line <= x.lineEnd));
  const named = new Set<string>();
  const guardLines = contract.guards.map((g) => {
    const rule = ruleAt(g.line);
    if (rule) named.add(rule.id);
    const where = g.endingLine !== g.line ? `L${g.line}-${g.endingLine}` : `L${g.line}`;
    return `${rule ? `${rule.id} ` : ''}${where}: ${g.effect === 'check' ? 'CHECK' : 'IF'} ${g.condition} → ${EFFECT_WORD[g.effect]}${g.effect === 'check' ? '' : ` (${g.ending})`}`;
  });
  for (const r of controls) {
    if (named.has(r.id)) continue;
    const first = r.ranges[0];
    guardLines.push(`${r.id}${first ? ` L${first.lineStart}` : ''}: ${r.label.replace(/\s+/g, ' ').slice(0, 160)} → ends the flow`);
  }
  const list = (items: string[], max: number, none: string) =>
    items.length === 0
      ? `          (${none})`
      : [...items.slice(0, max).map((s) => `          ${s}`), ...(items.length > max ? [`          (and ${items.length - max} more in the source — keep them too)`] : [])].join('\n');

  const decimals = contract.decimals.map((d) =>
    `${d.name} L${d.line}: TYPE p LENGTH ${d.length} DECIMALS ${d.decimals} → ${d.decimals} places, |value| ≤ ${d.max}`);
  const inputs = contract.inputs.map((i) => {
    const parts = [
      i.kind === 'select-option' ? `select-option FOR ${i.type ?? '?'}` : `parameter${i.type ? ` TYPE ${i.type}` : ''}`,
      i.flag ? (i.flag === 'checkbox' ? 'checkbox' : 'radio button') : null,
      i.obligatory ? 'required' : null,
      i.defaultValue ? `default ${i.defaultValue}` : null,
      ...i.restrictions,
    ].filter(Boolean);
    return `${i.name} L${i.line}: ${parts.join(', ')}`;
  });
  return `
        FACTS OF THE ORIGINAL (read from the legacy source by the engine, no model — keep every one):
        Checks that refuse, stop or skip (rule 15 — keep each, before any calculation, and cite its id or line):
${list(guardLines, MAX_FACT_GUARDS, 'none found in the source')}
        Packed decimals as declared (rule 17 — exact decimal arithmetic with these places; beyond the bound is refused, rule 16):
${list(decimals, MAX_FACT_FIELDS, 'none declared in the source; DDIC-typed fields keep the places of their DDIC type')}
        Selection inputs (rules 16 and 19 — each honoured or refused; required ones are part of the input contract):
${list(inputs, MAX_FACT_FIELDS, 'none declared in the source')}
`;
}

export interface LiteralFinding {
  file: string;
  line: number;
  /** The literal as written, quotes removed. */
  literal: string;
  /** The code around it, trimmed. */
  context: string;
  /** True when the same literal is a value of the code's own demo data. */
  demoValue: boolean;
  sentence: string;
}

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/i;
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\.[cm]?[jt]sx?$|playwright\.config/i;
/** A number-shaped literal long enough to be a document, customer or vendor number. */
const DOC_LITERAL = /(['"`])(\d{6,12})\1/g;
/** Key-like field names a hard-coded value of which is business data. */
const KEY_FIELD = /\b(belnr|vbeln|ebeln|docnum|document(?:No|Number|Id)?|kunnr|lifnr|customer(?:Id|No|Number)?|vendor(?:Id|No|Number)?|rebzg|augbl|xblnr|invoice(?:Id|No|Number)?|aufnr|matnr|partner)\b/i;

/** Is the literal at [start, end) compared, matched or switched on — rather than assigned as data? */
function comparedAt(src: string, start: number, end: number): string | null {
  const before = src.slice(Math.max(0, start - 80), start);
  const after = src.slice(end, end + 40);
  if (/(===|!==|==|!=)\s*$/.test(before)) return before.match(/([\w$.\]\)]+)\s*(===|!==|==|!=)\s*$/)?.[1] ?? '';
  if (/^\s*(===|!==|==|!=)/.test(after)) return after.match(/^\s*(?:===|!==|==|!=)\s*([\w$.]+)/)?.[1] ?? '';
  if (/\bcase\s*$/.test(before)) return 'case';
  if (/\.(includes|startsWith|endsWith|indexOf|has)\s*\(\s*$/.test(before)) return before.match(/([\w$.]+)\.(?:includes|startsWith|endsWith|indexOf|has)\s*\(\s*$/)?.[1] ?? '';
  return null;
}

/** Values the code's own demo data assigns to key-like fields: `belnr: '1900000001'`. */
function demoValues(files: readonly SandboxFile[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    if (!CODE_FILE.test(f.path)) continue;
    for (const m of f.content.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(['"`])(\d{6,12})\2/g)) {
      if (KEY_FIELD.test(m[1])) out.add(m[3]);
    }
  }
  return out;
}

/**
 * Hard-coded document-number literals used in business logic. A literal is
 * flagged when it is compared, matched or switched on (not when it is assigned
 * as data), in code under test (not in a test file), and either the other side
 * is a key-like field or the literal is a value of the code's own demo data.
 */
export function hardCodedLiteralFindings(code: string | readonly SandboxFile[] | null | undefined): LiteralFinding[] {
  const files = typeof code === 'string' ? sandboxFilesFromStoredCode(code) : code ? [...code] : [];
  const demo = demoValues(files);
  const out: LiteralFinding[] = [];
  for (const f of files) {
    if (!CODE_FILE.test(f.path) || TEST_FILE.test(f.path)) continue;
    const src = f.content;
    const mask = codeMask(src);
    for (const m of src.matchAll(DOC_LITERAL)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // The opening quote is not code; the character before it must be.
      if (start > 0 && !mask[start - 1] && !/\s/.test(src[start - 1])) continue;
      if (mask[start]) continue;
      let p = start - 1;
      while (p >= 0 && /\s/.test(src[p])) p--;
      if (p >= 0 && !mask[p]) continue;
      const against = comparedAt(src, start, end);
      if (against === null) continue;
      const literal = m[2];
      const isDemo = demo.has(literal);
      if (!isDemo && !(against && KEY_FIELD.test(against))) continue;
      const lineStart = src.lastIndexOf('\n', start) + 1;
      const lineEnd = src.indexOf('\n', start);
      const context = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd).trim().slice(0, 160);
      const line = lineAt(src, start);
      out.push({
        file: f.path,
        line,
        literal,
        context,
        demoValue: isDemo,
        sentence:
          `${f.path}:${line} compares against the hard-coded value '${literal}'` +
          (isDemo ? ', a document number of the code\'s own demo data' : '') +
          // Evidence-limited (QA review of 11e3bc7d90e8): the lint reads the
          // generated code only, never the original, so it says what it found
          // and what to check — not what the original does.
          ' in business logic. Check whether it should be looked up per item.',
      });
    }
  }
  return out;
}
