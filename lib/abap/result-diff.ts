export interface DiffOptions {
  /** Field names that are dates → normalize ''/'00000000' as initial. */
  dateFields?: string[];
  /** Ignore row order (set semantics). */
  unordered?: boolean;
  /**
   * Field names that are numeric → normalize null as 0, ABAP's initial value
   * for a number. A field whose every non-null value in both sets is a number
   * is treated as numeric without being named here.
   */
  numericFields?: string[];
}

export interface DiffReport {
  equal: boolean;
  onlyInAbap: number;
  onlyInTarget: number;
  rowCountAbap: number;
  rowCountTarget: number;
  sampleMismatch?: unknown;
}

function initialize(v: unknown, key: string, dateFields: string[], numericFields: ReadonlySet<string>): unknown {
  const isDate = dateFields.map((f) => f.toUpperCase()).includes(key.toUpperCase());
  if (v === null || v === undefined) {
    // A target outer join returns null where ABAP holds the initial value of
    // the field's type: 0 for a number, not '' (QA full review of v2.20.0,
    // 97b03a5d60dd).
    if (numericFields.has(key.toUpperCase())) return 0;
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

/** Fields named numeric, plus every field whose non-null values are all numbers in both sets. */
function numericFieldsOf(rows: Record<string, unknown>[], named: string[]): Set<string> {
  const numeric = new Set(named.map((f) => f.toUpperCase()));
  const sawNumber = new Set<string>();
  const sawOther = new Set<string>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) continue;
      (typeof v === 'number' ? sawNumber : sawOther).add(k.toUpperCase());
    }
  }
  for (const k of sawNumber) if (!sawOther.has(k)) numeric.add(k);
  return numeric;
}

function normalizeRow(row: Record<string, unknown>, dateFields: string[], numericFields: ReadonlySet<string>): string {
  const norm: Record<string, unknown> = {};
  // Two keys that differ only in case fold onto one; both values are kept, in
  // key order, instead of the later one silently replacing the earlier — which
  // made two rows that differed only in the dropped field compare equal.
  // Every field holds the list of its values, so a collision is a list of two
  // and can never be mistaken for a field whose own value looks like a marker.
  for (const k of Object.keys(row).sort()) {
    const upperKey = k.toUpperCase();
    const value = initialize(row[k], upperKey, dateFields, numericFields);
    if (!(upperKey in norm)) norm[upperKey] = [value];
    else (norm[upperKey] as unknown[]).push(value);
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
  const numericFields = numericFieldsOf([...abapRows, ...targetRows], opts.numericFields || []);

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
    // Counted per side at every position that differs, not only from the
    // length difference: [{id:1}] against [{id:2}] is one row on each side that
    // the other lacks, and reported zero and zero (QA full review of v2.20.0,
    // 042abeab9b3f).
    let onlyA = 0;
    let onlyB = 0;
    const len = Math.max(abapRows.length, targetRows.length);
    for (let i = 0; i < len; i++) {
      const ka = i < abapRows.length ? normalizeRow(abapRows[i], dateFields, numericFields) : null;
      const kb = i < targetRows.length ? normalizeRow(targetRows[i], dateFields, numericFields) : null;
      if (ka !== kb) {
        mismatches++;
        if (ka !== null) onlyA++;
        if (kb !== null) onlyB++;
        if (firstMismatch === undefined) firstMismatch = JSON.parse(ka ?? kb ?? 'null');
      }
    }
    return {
      equal: mismatches === 0,
      onlyInAbap: onlyA,
      onlyInTarget: onlyB,
      rowCountAbap: abapRows.length,
      rowCountTarget: targetRows.length,
      sampleMismatch: firstMismatch,
    };
  }

  const a = new Map<string, number>();
  const b = new Map<string, number>();

  for (const r of abapRows) {
    const k = normalizeRow(r, dateFields, numericFields);
    a.set(k, (a.get(k) || 0) + 1);
  }
  for (const r of targetRows) {
    const k = normalizeRow(r, dateFields, numericFields);
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
