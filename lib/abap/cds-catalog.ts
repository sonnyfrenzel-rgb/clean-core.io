import type { SelectModel } from './sql-model';
import { tableCount } from './sql-model';

export interface CdsCatalogEntry {
  tables: string[];        // base tables this released view models (normalized, upper)
  view: string;            // released CDS view name
  note?: string;
}

// Seed — VERIFY against the SAP API Business Hub / released-objects list before use.
export const CDS_CATALOG: CdsCatalogEntry[] = [
  { tables: ['VBAK', 'VBAP'], view: 'I_SalesOrderItem', note: 'Sales order header+item' },
  { tables: ['LIKP', 'LIPS'], view: 'I_DeliveryDocumentItem', note: 'Outbound delivery header+item' },
  { tables: ['EKKO', 'EKPO'], view: 'I_PurchaseOrderItem', note: 'Purchase order header+item' },
  { tables: ['VBRK', 'VBRP'], view: 'I_BillingDocumentItem', note: 'Billing document header+item' },
  { tables: ['BKPF', 'BSEG'], view: 'I_OperationalAcctgDocmtItem', note: 'Accounting document header+item' },
  { tables: ['MARA', 'MAKT'], view: 'I_ProductText', note: 'Product + description' },
];

export interface CdsMatch { view: string; confidence: number; exact: boolean; note?: string; }

/** Match a SELECT's table set against the catalog. Exact set ⇒ high confidence; superset of catalog ⇒ partial. */
export function matchCdsView(model: SelectModel): CdsMatch | null {
  if (tableCount(model) < 2) return null;
  const set = new Set<string>([model.from.name, ...model.joins.map((j) => j.table.name)]);
  let best: CdsMatch | null = null;
  for (const e of CDS_CATALOG) {
    const catalog = new Set(e.tables);
    const covered = [...catalog].every((t) => set.has(t));
    if (!covered) continue;
    const exact = catalog.size === set.size;
    const confidence = exact ? 0.95 : 0.6;
    if (!best || confidence > best.confidence) {
      best = { view: e.view, confidence, exact, note: e.note };
    }
  }
  return best;
}
