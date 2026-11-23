/**
 * Engine 4.0: the statement ledger by effect class (engine review of 22.11.2026, §3 L1; ER-05;
 * docs/design/engine4.md, "Statement ledger").
 *
 * Every statement has one effect class (`statement-kinds.ts`, the `effect` column; refined per statement
 * below). A consumer — a reading of the engine — claims the classes it reads. A statement is accounted for
 * when its class is claimed, or when its class has no effect of its own (`declaration`, `structure`, and a
 * macro body, whose text runs where the macro is called). `complete` is a provable claim: no statement of an
 * unclaimed class, no `Unknown` statement, and no fallback to another reader.
 *
 * This replaces the per-reader design of 22.11.2026 (every reader calling `ledger.judge(i)`): the class is
 * data in the kind table, so completeness does not depend on each reader remembering to register.
 *
 * Pure (ADR-125): imports only within `lib/engine4/`; `tests/engine4-layer-guard.spec.ts` checks that no product
 * module imports it.
 */
import type { ReferenceTable } from './references';
import { kindInfo, type EffectClass, type StatementKind } from './statement-kinds';
import type { Statement } from './statements';

export type { EffectClass } from './statement-kinds';

export const EFFECT_CLASSES: readonly EffectClass[] = [
  'declaration', 'structure', 'control', 'compute', 'dbRead', 'dbWrite', 'transaction', 'callOut', 'ui', 'fileMemory',
  'authorization', 'dynamic', 'unknown',
];

/** Classes that need no consumer: they have no effect of their own. */
export const NEUTRAL_CLASSES: ReadonlySet<EffectClass> = new Set(['declaration', 'structure']);

/** A reading and the effect classes it reads. `unknown` cannot be claimed. */
export interface Consumer {
  id: string;
  claims: readonly EffectClass[];
}

export type LedgerState = 'claimed' | 'neutral' | 'unclaimed';

export interface LedgerEntry {
  statement: number;
  row: number;
  kind: StatementKind;
  effect: EffectClass;
  state: LedgerState;
  /** The consumers that claim the class. */
  by: string[];
}

export interface Ledger {
  entries: LedgerEntry[];
  /** Per class: statements, and those no consumer claims. */
  byClass: Record<EffectClass, { total: number; unclaimed: number }>;
  /** The unclaimed statements grouped by kind, most first: "CALL KERNEL 1, RECEIVE 3, …". */
  unclaimedKinds: Array<{ kind: StatementKind; effect: EffectClass; count: number; firstRow: number }>;
  unknown: number;
  /** Why another reader read the source instead (the parse-once fallback reason), or null. */
  fallback: string | null;
  complete: boolean;
}

const DB_WRITE_KINDS = new Set<StatementKind>(['Insert', 'Update', 'Modify', 'Delete']);

/**
 * The effect class of one statement: the kind's, refined by what L4 found on it. `INSERT`, `UPDATE`,
 * `MODIFY` and `DELETE` write the database only when the reference table names a database table there
 * (else they change an internal table: `compute`); a statement whose object name stays open
 * (`CALL FUNCTION lv` with no single value) is `dynamic`. Without a reference table there is nothing to tell the
 * two apart, so such a statement is `unknown` — no consumer can claim it — rather than a guessed `dbWrite`.
 */
export function effectOf(s: Statement, refs?: ReadonlyMap<number, ReferenceTable['references']>): EffectClass {
  if (s.context === 'macro') return 'structure';
  const base = kindInfo(s.kind).effect;
  if (!refs) return DB_WRITE_KINDS.has(s.kind) ? 'unknown' : base;
  const here = refs.get(s.index) ?? [];
  if (here.some((r) => r.resolution === 'dynamic')) return 'dynamic';
  if (DB_WRITE_KINDS.has(s.kind)) return here.some((r) => r.kind === 'table' && r.use === 'write') ? 'dbWrite' : 'compute';
  return base;
}

/** Index a reference table by statement. */
export function referencesByStatement(table: ReferenceTable): Map<number, ReferenceTable['references']> {
  const out = new Map<number, ReferenceTable['references']>();
  for (const r of table.references) (out.get(r.statement) ?? out.set(r.statement, []).get(r.statement)!).push(r);
  return out;
}

/** The ledger of a statement list under a set of consumers. */
export function ledger(
  list: readonly Statement[],
  consumers: readonly Consumer[],
  options: { references?: ReferenceTable; fallback?: string | null } = {},
): Ledger {
  const claimedBy = new Map<EffectClass, string[]>();
  for (const c of consumers) for (const k of c.claims) if (k !== 'unknown') (claimedBy.get(k) ?? claimedBy.set(k, []).get(k)!).push(c.id);
  const refs = options.references ? referencesByStatement(options.references) : undefined;
  const byClass = Object.fromEntries(EFFECT_CLASSES.map((k) => [k, { total: 0, unclaimed: 0 }])) as Ledger['byClass'];
  const entries: LedgerEntry[] = [];
  const kinds = new Map<StatementKind, { effect: EffectClass; count: number; firstRow: number }>();
  let unknown = 0;
  for (const s of list) {
    const effect = effectOf(s, refs);
    const by = claimedBy.get(effect) ?? [];
    const state: LedgerState = NEUTRAL_CLASSES.has(effect) ? 'neutral' : by.length ? 'claimed' : 'unclaimed';
    entries.push({ statement: s.index, row: s.start.row, kind: s.kind, effect, state, by });
    byClass[effect].total += 1;
    if (s.kind === 'Unknown' && s.context === 'abap') unknown += 1;
    if (state !== 'unclaimed') continue;
    byClass[effect].unclaimed += 1;
    const k = kinds.get(s.kind);
    if (k) k.count += 1;
    else kinds.set(s.kind, { effect, count: 1, firstRow: s.start.row });
  }
  const unclaimedKinds = [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.count - a.count || a.firstRow - b.firstRow);
  const fallback = options.fallback ?? null;
  return { entries, byClass, unclaimedKinds, unknown, fallback, complete: unclaimedKinds.length === 0 && unknown === 0 && fallback === null };
}

/**
 * What engine 4 reads today, by class. Only L4 reads anything yet: the reference table counts every database
 * table, authorisation object and called object; the readings that judge control, computation, the LUW, the
 * UI and files are L5/L6. An honest ledger of engine 4 is therefore incomplete on almost every program until
 * they exist — which is the point of computing it.
 */
export const ENGINE4_CONSUMERS: readonly Consumer[] = [
  { id: 'L4 references', claims: ['dbRead', 'dbWrite', 'authorization'] },
];
