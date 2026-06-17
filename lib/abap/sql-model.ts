import type { SourceRef } from './class-model';

export type JoinType = 'inner' | 'left-outer' | 'right-outer' | 'cross';

export interface SqlTableRef { name: string; alias?: string; }

export interface JoinClause {
  type: JoinType;
  table: SqlTableRef;
  on: string;            // raw ON condition
}

export interface SelectField {
  raw: string;
  alias?: string;
  aggregate?: 'SUM' | 'MIN' | 'MAX' | 'AVG' | 'COUNT';
}

export type SqlQuirkType =
  | 'implicit-client'
  | 'client-specified'
  | 'for-all-entries'
  | 'into-corresponding'
  | 'outer-join-null'
  | 'buffering-bypass'
  | 'aggregate-null';

export interface SqlQuirk {
  type: SqlQuirkType;
  detail: string;
  /** True if the quirk can change the result set vs a naive translation. */
  affectsResult: boolean;
}

export interface SelectModel {
  source: SourceRef;
  starSelect: boolean;
  fields: SelectField[];
  from: SqlTableRef;
  joins: JoinClause[];
  into: { kind: 'table' | 'workarea' | 'corresponding'; target: string };
  forAllEntries?: { driver: string };
  where?: string;
  groupBy: string[];
  orderBy: string[];
  upToRows?: number;
  distinct: boolean;
  clientSpecified: boolean;
  bypassingBuffer: boolean;
  quirks: SqlQuirk[];
}

/** Number of base tables involved (FROM + joins). */
export function tableCount(m: SelectModel): number {
  return 1 + m.joins.length;
}
