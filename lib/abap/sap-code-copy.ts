import { maskComments, readStatements, type AbapStatement } from './statement-reader';
import crLatest from './generated/cloudification-repo.latest.json';
import crClassifications from './generated/cloudification-repo.classifications-sap.json';

/**
 * Possible copies of SAP code — roadmap 3.0.12, from the review of the DSAG
 * ABAP guideline (owner decision 13.10.2026).
 *
 * DSAG ABAP guideline: clean-core/what-is-clean-core.md § “NIEMALS SAP CODE KOPIEREN”
 *
 * A copy of SAP code carries SAP's logic without SAP's maintenance: SAP's
 * corrections and upgrades no longer reach it, and it keeps calling whatever
 * internals the original called. The engine cannot prove a copy — it never
 * sees SAP's source — so this is a heuristic that raises a **review task**,
 * never a verdict, on two signals:
 *
 *   1. **The name.** A customer object (`Z…`/`Y…`) whose name is an SAP
 *      object's name behind the customer prefix: `ZSAPMV45A`, `Z_SAPLV45A`
 *      (SAP's module pool and function group main programs are named `SAPM…`
 *      and `SAPL…`), or `ZCL_SALV_TABLE`, `Z_BAPI_…`, where the rest is a
 *      class, interface or function module SAP's own files list. Tables and
 *      CDS views are left out on purpose: `ZMARA` as a table or `ZI_PRODUCT`
 *      as a view is a naming convention, not a copied program.
 *   2. **The header.** A comment in the first lines of the source that says
 *      "Kopie von", "kopiert von/aus", "copy of" or "copied from" — unless the
 *      object it names is itself a customer object, because a copy of one's own
 *      code is not what the guideline is about.
 *
 * What the guideline recommends instead is not adopted wholesale: it names
 * user exits, BAdIs and enhancement points as the way to change SAP behaviour,
 * and this engine grades enhancement points level D (`evidence-model.ts`,
 * section 3). The task therefore points at released APIs and released
 * extension points, then BAdIs.
 *
 * Pure apart from SAP's two synced files; no model.
 */

export interface SapCodeCopySignal {
  /** Where the signal stands: the statement that names the object, or the comment line. */
  lineStart: number;
  /** The customer object, as the source or the file name writes it, upper-cased. */
  name: string;
  /** The SAP object the name or the comment points at, where one is named. */
  sapName?: string;
  via: 'name' | 'header-comment';
  /** The comment text, for `header-comment`. */
  comment?: string;
}

type Entries = Record<string, { tadir?: string }>;
const RELEASE = (crLatest as { entries?: Entries }).entries ?? {};
const CLASSIFICATION = (crClassifications as { entries?: Entries }).entries ?? {};
const CODE_OBJECT_TYPES = new Set(['FUNC', 'CLAS', 'INTF']);

/** Is this a class, interface or function module one of SAP's two files lists? */
function isListedSapCodeObject(name: string): boolean {
  const tadir = RELEASE[name]?.tadir ?? CLASSIFICATION[name]?.tadir;
  return tadir !== undefined && CODE_OBJECT_TYPES.has(tadir);
}

/** The SAP name a customer name repeats, or null. */
export function sapNameBehindCustomerPrefix(name: string): string | null {
  const upper = name.toUpperCase();
  if (!/^[ZY]/.test(upper)) return null;
  for (const rest of [upper.slice(1), upper.replace(/^[ZY]_/, '')]) {
    if (rest.length < 5 || /^[ZY]/.test(rest)) continue;
    if (/^SAP[ML][A-Z0-9_]{2,}$/.test(rest)) return rest;
    if (isListedSapCodeObject(rest)) return rest;
  }
  return null;
}

/** The names a source declares for itself: program, function group, function module, class, interface, include. */
function declaredNames(statements: AbapStatement[]): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  for (const s of statements) {
    const m =
      /^(?:REPORT|PROGRAM|FUNCTION-POOL)\s+([\w/]+)/i.exec(s.text)
      ?? /^FUNCTION\s+([\w/]+)\s*$/i.exec(s.text)
      ?? /^CLASS\s+([\w/]+)\s+DEFINITION\b(?![\s\S]*\b(?:DEFERRED|LOAD)\b)/i.exec(s.text)
      ?? /^INTERFACE\s+([\w/]+)\s*(?:PUBLIC)?\s*$/i.exec(s.text)
      ?? /^INCLUDE\s+(?!TYPE\b|STRUCTURE\b)([\w/]+)/i.exec(s.text);
    if (m) out.push({ name: m[1].toUpperCase(), line: s.lineStart });
  }
  return out;
}

/** How far into the source a comment still counts as the header. */
const HEADER_LINES = 25;
const COPY_PHRASE = /\b(?:kopie\s+(?:von|aus)|kopiert\s+(?:von|aus)|copy\s+of|copied\s+from)\b[\s:]*(?:(?:the|dem|der|des)\s+)?(?:sap[\s-]+)?(?:standard[\s-]+)?(?:(?:report|program|programm|function\s+module|funktionsbaustein|class|klasse|include|transaction|transaktion)\s+)?['"]?([A-Za-z0-9_/]{4,})?/i;

/** The comment text of each line: the characters `maskComments` blanked. */
function commentText(raw: string, masked: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) out += masked[i] === ' ' && raw[i] !== ' ' ? raw[i] : ' ';
  return out.trim();
}

export function readSapCodeCopySignals(source: string, fileName?: string, statements: AbapStatement[] = readStatements(source)): SapCodeCopySignal[] {
  const signals: SapCodeCopySignal[] = [];
  const seen = new Set<string>();

  const candidates = declaredNames(statements);
  const base = (fileName ?? '').split(/[\\/]/).pop()?.replace(/\.[^.]*$/, '').toUpperCase();
  if (base && /^[ZY][\w]*$/.test(base)) candidates.push({ name: base, line: 1 });
  for (const candidate of candidates) {
    if (seen.has(candidate.name)) continue;
    const sapName = sapNameBehindCustomerPrefix(candidate.name);
    if (!sapName) continue;
    seen.add(candidate.name);
    signals.push({ lineStart: candidate.line, name: candidate.name, sapName, via: 'name' });
  }

  // Only the header is read for the comment, so only the header is masked.
  const rawLines = source.split('\n').slice(0, HEADER_LINES);
  const maskedLines = maskComments(rawLines.join('\n')).split('\n');
  const programName = candidates[0]?.name ?? base ?? '';
  for (let i = 0; i < Math.min(HEADER_LINES, rawLines.length); i++) {
    const comment = commentText(rawLines[i].replace(/\r$/, ''), (maskedLines[i] ?? '').replace(/\r$/, ''));
    if (!comment) continue;
    const m = COPY_PHRASE.exec(comment);
    if (!m) continue;
    // A name counts when it is written the way object names are: upper case,
    // with a letter in it. "copy of the table" names nothing.
    const named = m[1] && /[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase() ? m[1] : undefined;
    // A copy of the customer's own object is not a copy of SAP code.
    if (named && /^[ZY]/.test(named)) continue;
    // Without a name the phrase has to say whose code it was.
    if (!named && !/\b(?:sap|standard)\b/i.test(m[0])) continue;
    // The name already said it: one task per copied object, not two.
    if (named && signals.some((s) => s.sapName === named)) break;
    signals.push({
      lineStart: i + 1,
      name: programName,
      ...(named ? { sapName: named } : {}),
      via: 'header-comment',
      comment: comment.replace(/^[*"\s]+/, '').slice(0, 160),
    });
    break;
  }
  return signals;
}
