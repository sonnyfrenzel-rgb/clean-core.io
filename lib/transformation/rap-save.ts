/**
 * The RAP implementation type of a writing program follows the original (scaffold version 18, roadmap 3.0.18 item 14).
 *
 * Until scaffold version 17 every writing program became `managed implementation … persistent table`: the framework
 * writes the records to the package's own table and nothing else. That fits a program that writes its own Z table and
 * nothing more. It does not fit:
 *   - a program that writes through a BAPI, a standard business object (`MODIFY ENTITIES OF I_…`) or into a standard
 *     SAP table (`UPDATE EBAN`): SAP's data is SAP's to save, so the business object is `managed with unmanaged save`
 *     — no persistent table, a saver class whose `save_modified` is where the access layer writes;
 *   - a program that writes its own Z table and, besides it, a change document or an update function module
 *     (`CALL FUNCTION … IN UPDATE TASK`): `managed with additional save` — the framework saves the records, the
 *     saver's `save_modified` does the rest in the same save phase.
 * Only where the engine reads the reason in the statements; otherwise the type stays `managed`. TRACE.md names the
 * reason (`@cc-save` in the behavior definition, `rapSaveIn`).
 *
 * Pure: statements and the call graph's writes in, the decision out. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { CallGraphReport } from '../abap/call-graph';

export type RapSaveKind = 'managed' | 'unmanaged-save' | 'additional-save';

export interface RapSave {
  kind: RapSaveKind;
  /** What the engine read, each with its line: `BAPI_PO_CREATE1 (L420)`, `UPDATE EBAN (L246)`. Empty for `managed`. */
  reasons: string[];
  /** The SAP objects behind the reasons, upper case — the access layer's methods for them carry the writes. */
  objects: string[];
}

/** A BAPI that reads or only steers the transaction is no write. */
const READING_BAPI = /^BAPI_TRANSACTION_|_(?:GET\w*|GETDETAIL\w*|GETLIST|LIST\w*|READ\w*|EXISTENCECHECK|DISPLAY\w*|CHECK\w*)$/;
const CHANGE_DOCUMENT = /^(?:CHANGEDOCUMENT_\w+|\w+_WRITE_DOCUMENT)$/;
const customer = (table: string) => /^[ZY]/i.test(table) || /^\/\w+\//.test(table);

export function rapSaveOf(facts: { statements: readonly AbapStatement[]; graph: Pick<CallGraphReport, 'databaseWrites'> }): RapSave {
  const unmanaged: Array<{ what: string; object: string }> = [];
  const additional: Array<{ what: string; object: string }> = [];
  for (const st of facts.statements) {
    const fm = /^CALL\s+FUNCTION\s+'([\w/]+)'/i.exec(st.text);
    if (fm) {
      const name = fm[1].toUpperCase();
      if (/^BAPI_/.test(name) && !READING_BAPI.test(name)) unmanaged.push({ what: `${name} (L${st.lineStart})`, object: name });
      else if (CHANGE_DOCUMENT.test(name)) additional.push({ what: `change document ${name} (L${st.lineStart})`, object: name });
      else if (/\bIN\s+UPDATE\s+TASK\b/i.test(st.text)) additional.push({ what: `${name} IN UPDATE TASK (L${st.lineStart})`, object: name });
      continue;
    }
    const bo = /^MODIFY\s+ENTITIES\s+OF\s+([\w/]+)/i.exec(st.text);
    if (bo && !customer(bo[1])) unmanaged.push({ what: `MODIFY ENTITIES OF ${bo[1].toUpperCase()} (L${st.lineStart})`, object: bo[1].toUpperCase() });
  }
  for (const w of facts.graph.databaseWrites) {
    if (!customer(w.table)) unmanaged.push({ what: `${w.keyword} ${w.table} (L${w.lineStart})`, object: w.table });
  }
  const pick = unmanaged.length > 0 ? { kind: 'unmanaged-save' as const, list: unmanaged } : additional.length > 0 ? { kind: 'additional-save' as const, list: additional } : null;
  if (!pick) return { kind: 'managed', reasons: [], objects: [] };
  // One reason per statement form, its lines together: `UPDATE EBAN (L246, L455)`.
  const byLabel = new Map<string, number[]>();
  for (const x of pick.list) {
    const m = /^(.*) \(L(\d+)\)$/.exec(x.what)!;
    byLabel.set(m[1], [...(byLabel.get(m[1]) ?? []), Number(m[2])]);
  }
  const reasons = [...byLabel].map(([label, lines]) => `${label} (L${[...new Set(lines)].sort((a, b) => a - b).join(', L')})`);
  return { kind: pick.kind, reasons, objects: [...new Set(pick.list.map((x) => x.object))] };
}

/** The tag of the reason in the behavior definition, read back by the trace (`rapSaveIn`). */
export const RAP_SAVE_TAG = '@cc-save';

/** The behavior definition's header line for the kind. */
export function rapSaveHeader(kind: RapSaveKind, pool: string): string {
  if (kind === 'unmanaged-save') return `managed with unmanaged save implementation in class ${pool} unique;`;
  if (kind === 'additional-save') return `managed with additional save implementation in class ${pool} unique;`;
  return `managed implementation in class ${pool} unique;`;
}

/** The comment line of the behavior definition that names the reason. */
export function rapSaveTagLine(save: RapSave): string {
  return `// ${RAP_SAVE_TAG} ${rapSaveWords(save)}`;
}

/**
 * The plain statement that the saver is not wired (owner decision 18.10.2026): STATUS.md, TRACE.md and the file's
 * manifest note say it, and nothing in the package claims that a change is persisted.
 */
export const RAP_SAVE_NOT_WIRED = 'save_modified names the access-layer methods but does not call them yet; changes are not persisted until it is wired';

/** The marker of the saver's open step (`@cc-open SAVE:`), by which the delivery reads that the saver is not wired. */
export const RAP_SAVE_OPEN = '@cc-open SAVE:';

/** True when an ABAP source holds a saver whose save_modified is not wired yet. */
export const rapSaverUnwired = (content: string) => /^\s*METHOD\s+save_modified\s*\./im.test(content) && content.includes(RAP_SAVE_OPEN);

export function rapSaveWords(save: RapSave): string {
  if (save.kind === 'unmanaged-save') return `managed with unmanaged save — the original writes SAP's data through ${save.reasons.join(', ')}: no persistent table, and the saver writes nothing yet (${RAP_SAVE_NOT_WIRED})`;
  if (save.kind === 'additional-save') return `managed with additional save — the original writes its own table and, besides it, ${save.reasons.join(', ')}: the saver writes nothing yet (${RAP_SAVE_NOT_WIRED})`;
  return 'managed — the original writes only its own tables';
}

/** The `@cc-save` line of a behavior definition, for TRACE.md; null when there is none. */
export function rapSaveIn(content: string): string | null {
  const m = new RegExp(`^\\s*//\\s*${RAP_SAVE_TAG} (.+)$`, 'm').exec(content);
  return m ? m[1].trim() : null;
}

/** The tag where a caller of the logic hands it no input although the logic takes the original's input tables (QM-03, FI-F09). */
export const RAP_NO_INPUT_TAG = '@cc-no-input';

/** The input tables a package's callers leave empty (`@cc-no-input` lines of its classes), for TRACE.md and STATUS.md. */
export function rapNoInputIn(files: ReadonlyArray<{ path: string; content: string }>): string[] {
  const out = new Set<string>();
  const re = new RegExp(`"\\s*${RAP_NO_INPUT_TAG} ([^:]+):`, 'g');
  for (const f of files) {
    if (!f.path.endsWith('.abap')) continue;
    for (const m of f.content.matchAll(re)) for (const t of m[1].split(',')) out.add(t.trim());
  }
  return [...out];
}

/** The plain sentence about a package whose callers hand the logic no input. */
export const rapNoInputWords = (tables: readonly string[]) =>
  `A business library: the service (its query or action) and the job call the logic class without data until an adapter is written — the logic takes the original's input tables (${tables.join(', ')}) as is_input, and nothing in this package fills them. Connecting the access layer's SAP calls does not change that; an adapter that reads these tables and hands them in as is_input does.`;
