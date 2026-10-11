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
 * Pure, no network, no model.
 */

import { sandboxFilesFromStoredCode, type SandboxFile } from './test-sandbox/files';
import { codeMask, lineAt } from './ts-source-scan';

/** The rules section of the Node.js code-draft prompt (numbered on from the stage's own list). */
export const CODE_DRAFT_BUSINESS_RULES = `
        11. CRITICAL — NO HARD-CODED DATA IN BUSINESS LOGIC: never compare against, look up or branch on a literal document number, customer number, company code value or any other value of the demo/sample data (for example: items.find(i => i.belnr === '1900000001') is forbidden). Demo data may only live in a clearly named mock/sample-data function and is never referenced by the logic.
        12. REFERENCE LOOKUPS USE THE FULL KEY AND THE IDENTITY: when an item refers to another document (invoice reference, clearing document, predecessor), look it up per item with the complete key the original uses (company code, document number, fiscal year, line item — and the customer or vendor it must belong to, and its account type), and keep the original's behaviour when the reference is missing or belongs to someone else.
        13. ONE SELECTION FOR EVERY ENDPOINT: every endpoint that answers for the same selection (a list, its totals, its export or file, an audit record) MUST read the selection through ONE shared, validated selection function and pass the same selection object on. No endpoint may drop, rename or re-default a filter that another endpoint of the same selection applies.
        14. KEEP POSTED VALUES, DO NOT INVENT MISSING ONES: keep the item's own posted values (amounts, payment terms, baseline date, due date). Where the original leaves a value unknown (for example, no baseline date → due date unknown), the target leaves it unknown too and reports it — never fill it from another item, a default or today's date.
`;

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
          ' in business logic. The original looks such values up per item; a fixed value makes every item depend on one demo record.',
      });
    }
  }
  return out;
}
