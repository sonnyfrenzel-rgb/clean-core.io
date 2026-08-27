/**
 * Starter examples — realistic, fictional legacy ABAP available to every account.
 *
 * Registering and then having to extract custom code out of a customer system is
 * the largest step between a new account and a first result; most accounts
 * never take it. These let anyone see a complete run in minutes without touching
 * their own IP.
 *
 * The sources live in `public/starter-examples/` and are fetched on demand, so the
 * ABAP text never enters the client bundle. They are the same files the engine is
 * regression-tested against (`abap-test-files/`), so what a visitor sees here is
 * exactly what the analyzer is known to handle.
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
  size: 'small' | 'large';
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
    file: 'Z_ORDER_INTEGRITY_CHECK.txt',
    name: 'Z_ORDER_INTEGRITY_CHECK',
    summary: 'Audits sales orders against invoices using an abstract class hierarchy.',
    demonstrates: 'ABAP OO inheritance and awkward SQL joins — the harder end of the range.',
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
    file: 'Z_BUSINESS_PARTNER_SYNC.txt',
    name: 'Z_BUSINESS_PARTNER_SYNC',
    summary: 'Synchronises business partner data through a classic ALV grid.',
    demonstrates: 'Presentation logic welded to data access.',
    lines: 113,
    size: 'small',
  },
  {
    file: 'Z_EMPLOYEE_EXPENSE_VAL.txt',
    name: 'Z_EMPLOYEE_EXPENSE_VAL',
    summary: 'Validates travel expenses against hard-coded policy limits.',
    demonstrates: 'Business rules buried in code instead of configuration.',
    lines: 105,
    size: 'small',
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
