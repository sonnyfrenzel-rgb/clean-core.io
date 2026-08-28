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

  // `unordered` was declared in DiffOptions and never read: every comparison was
  // a multiset comparison, so `[A, B]` against `[B, A]` came back `equal: true`
  // even when the caller had explicitly asked for ordered semantics. An option
  // that exists and is ignored is worse than one that does not exist, because
  // callers write it and believe it.
  //
  // The default stays set-based — that is what the docstring above has always
  // promised, and an ABAP SELECT without ORDER BY has no guaranteed row order to
  // compare against anyway. What changes is that `unordered: false` now means
  // what it says.
  const unordered = opts.unordered ?? true;

  if (!unordered) {
    let firstMismatch: unknown;
    let mismatches = 0;
    const len = Math.max(abapRows.length, targetRows.length);
    for (let i = 0; i < len; i++) {
      const ka = i < abapRows.length ? normalizeRow(abapRows[i], dateFields) : null;
      const kb = i < targetRows.length ? normalizeRow(targetRows[i], dateFields) : null;
      if (ka !== kb) {
        mismatches++;
        if (firstMismatch === undefined) firstMismatch = JSON.parse(ka ?? kb ?? 'null');
      }
    }
    return {
      equal: mismatches === 0,
      onlyInAbap: Math.max(0, abapRows.length - targetRows.length),
      onlyInTarget: Math.max(0, targetRows.length - abapRows.length),
      rowCountAbap: abapRows.length,
      rowCountTarget: targetRows.length,
      sampleMismatch: firstMismatch,
    };
  }

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
