export interface DiffOptions {
  /** Field names that are dates → normalize ''/'00000000' as initial. */
  dateFields?: string[];
  /** Ignore row order (set semantics). */
  unordered?: boolean;
}

export interface DiffReport {
  equal: boolean;
  onlyInAbap: number;
  onlyInTarget: number;
  rowCountAbap: number;
  rowCountTarget: number;
  sampleMismatch?: unknown;
}

function initialize(v: unknown, key: string, dateFields: string[]): unknown {
  const isDate = dateFields.map((f) => f.toUpperCase()).includes(key.toUpperCase());
  if (v === null || v === undefined) {
    return isDate ? '00000000' : '';
  }
  if (typeof v === 'number' && Number.isNaN(v)) return 0;
  if (isDate) {
    const s = String(v).trim().replace(/[-:]/g, ''); // normalize date format (e.g., 2026-06-17 -> 20260617)
    if (s === '' || s === '0' || s === '00000000') return '00000000';
    return s;
  }
  return v;
}

function normalizeRow(row: Record<string, unknown>, dateFields: string[]): string {
  const norm: Record<string, unknown> = {};
  for (const k of Object.keys(row).sort()) {
    const upperKey = k.toUpperCase();
    norm[upperKey] = initialize(row[k], upperKey, dateFields);
  }
  return JSON.stringify(norm);
}

/** Compare two result sets with ABAP-equivalent normalization (null→initial, date normalization, key-sorted, set-based). */
export function diffResultSets(
  abapRows: Record<string, unknown>[],
  targetRows: Record<string, unknown>[],
  opts: DiffOptions = {},
): DiffReport {
  const dateFields = opts.dateFields || [];
  const a = new Map<string, number>();
  const b = new Map<string, number>();

  for (const r of abapRows) {
    const k = normalizeRow(r, dateFields);
    a.set(k, (a.get(k) || 0) + 1);
  }
  for (const r of targetRows) {
    const k = normalizeRow(r, dateFields);
    b.set(k, (b.get(k) || 0) + 1);
  }

  let onlyA = 0;
  let onlyB = 0;
  let sample: unknown;

  for (const [k, n] of a) {
    const m = b.get(k) || 0;
    if (n > m) {
      onlyA += n - m;
      if (!sample) sample = JSON.parse(k);
    }
  }
  for (const [k, n] of b) {
    const m = a.get(k) || 0;
    if (n > m) {
      onlyB += n - m;
      if (!sample) sample = JSON.parse(k);
    }
  }

  return {
    equal: onlyA === 0 && onlyB === 0,
    onlyInAbap: onlyA,
    onlyInTarget: onlyB,
    rowCountAbap: abapRows.length,
    rowCountTarget: targetRows.length,
    sampleMismatch: sample,
  };
}
