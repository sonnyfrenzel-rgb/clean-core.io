/**
 * Starter examples — realistic, fictional legacy ABAP available to every account.
 *
 * Registering and then having to extract custom code out of a customer system is
 * the largest step between a new account and a first result; most accounts
 * never take it. These let anyone see a complete run in minutes without touching
 * their own IP.
 *
 * The sources live in `public/starter-examples/` and are fetched on demand, so the
 * ABAP text never enters the client bundle. The engine's regression specs read
 * these same files, so what a visitor sees here is exactly what the analyzer is
 * known to handle.
 *
 * 18.10.2026 (owner decision, after an end-to-end check of every example): Z_ORDER_INTEGRITY_CHECK (nothing runs —
 * no entry point), Z_EMPLOYEE_EXPENSE_VAL (no clean-core problem in it) and Z_BUSINESS_PARTNER_SYNC (syntax errors,
 * synchronises nothing) are no longer offered. Since 3.0.18 their files are regression fixtures of the engine's specs in
 * `tests/fixtures/retired-starter-examples/` and nothing under `public/` names them.
 */

export interface StarterExample {
  /** File in `public/starter-examples/`. */
  file: string;
  /** Object name as it would appear in SE80 / ADT. */
  name: string;
  /** What the legacy object does, in one line. */
  summary: string;
  /** The Clean Core problem this object is a good demonstration of. */
  demonstrates: string;
  lines: number;
  /** Rough guide for the reader, not a promise. */
  size: 'small' | 'medium' | 'large';
}

export const STARTER_EXAMPLES: StarterExample[] = [
  {
    file: 'Z_MATERIAL_STOCK_CALC.txt',
    name: 'Z_MATERIAL_STOCK_CALC',
    summary: 'Values material stock by joining MARA, MARC and MARD directly.',
    demonstrates: 'Direct table access that has released SAP APIs available as replacements.',
    lines: 99,
    size: 'small',
  },
  {
    file: 'Z_INVOICE_EXTRACTOR.txt',
    name: 'Z_INVOICE_EXTRACTOR',
    summary: 'Reads billing documents and writes them to a CSV on the application server.',
    demonstrates: 'File system access, which has no equivalent in ABAP Cloud at all.',
    lines: 87,
    size: 'small',
  },
  {
    file: 'Z_SALES_ORDER_CREATOR.txt',
    name: 'Z_SALES_ORDER_CREATOR',
    summary: 'Creates sales orders in bulk via BAPI_SALESORDER_CREATEFROMDAT2.',
    demonstrates: 'Classic BAPI calls and their released OData successors.',
    lines: 98,
    size: 'small',
  },
  {
    file: 'Z_MM_PO_APPROVAL.abap',
    name: 'Z_MM_PO_APPROVAL',
    summary:
      'Approves emergency purchase requisitions: vendor block list, price tolerance against the info record, approval by department head or manager, and a purchase order via BAPI with a batch-input fallback.',
    demonstrates:
      'Business rules hard-coded in the program — and what cannot be determined from the code alone: a dynamic function call and two includes that are not part of the upload.',
    lines: 668,
    size: 'large',
  },
  {
    file: 'Z_SD_FREIGHT_RATE_CHECK.abap',
    name: 'Z_SD_FREIGHT_RATE_CHECK',
    summary:
      'Checks freight charges before goods issue: weighs each outbound delivery, prices it from the rate card and compares it with the quote of the external carrier system.',
    demonstrates:
      'A call to another system that makes a side-by-side extension on SAP BTP the recommended route — and the CAP package the engine builds for it.',
    lines: 407,
    size: 'medium',
  },
  {
    file: 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
    name: 'ZLEGACY_ORDER_FULFILLMENT_AUDIT',
    summary:
      'A full order-remediation report: credit checks, inventory reconciliation, batch input, RFC enrichment and update-task logging.',
    demonstrates: 'What a genuinely grown enterprise report looks like — 1,000 lines, many findings.',
    lines: 1000,
    size: 'large',
  },
];

/** Fetches a starter example's source from the static asset path. */
export async function loadStarterExample(file: string): Promise<string> {
  const res = await fetch(`/starter-examples/${file}`);
  if (!res.ok) throw new Error(`Could not load the example (${res.status}).`);
  return res.text();
}

/** What the "View code" dialog shows; `code` is null while the file loads. */
export interface ViewedCode {
  title: string;
  code: string | null;
}

/**
 * Where a finished load goes: only into the dialog still waiting for that
 * example. A dialog the reader closed (`null`) stays closed, and one they
 * switched to another example keeps that example.
 */
export function landViewedCode(current: ViewedCode | null, title: string, code: string): ViewedCode | null {
  return current && current.title === title && current.code === null ? { title, code } : current;
}
