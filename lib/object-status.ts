/**
 * How far something has got — `DESIGN.md` §2.3 and §4.1.
 *
 * The distinction this file exists to protect (ADR-023): an **object status**
 * says how far a thing is, a **provenance chip** (`lib/provenance.ts`) says
 * where a statement came from. They are never mixed, and they never look alike
 * — an object status is text with a state dot and no outline, a provenance chip
 * is a pill with an icon.
 *
 * *signed* and *stale* are deliberately absent. Both are provenance, and both
 * were object statuses in the old status line, which is how "stale" ended up
 * next to "failed" in the same red.
 */

import type { SemanticState } from './provenance';

export type ObjectStatusValue =
  | 'not-started'
  | 'partial'
  | 'draft'
  | 'open'
  | 'confirmed'
  | 'mock-only'
  | 'handed-over'
  | 'done'
  | 'blocked-by-sap'
  | 'failed';

export interface ObjectStatusEntry {
  value: ObjectStatusValue;
  key: string;
  label: string;
  state: SemanticState;
  /**
   * An empty dot rather than a filled one. "Not started" and "open" are the
   * absence of work, and a filled dot reads as a result.
   */
  hollow?: boolean;
}

const ENTRIES: ObjectStatusEntry[] = [
  { value: 'not-started', key: 'objectStatus.notStarted', label: 'not started', state: 'neutral', hollow: true },
  { value: 'partial', key: 'objectStatus.partial', label: 'partial', state: 'warning' },
  { value: 'draft', key: 'objectStatus.draft', label: 'draft', state: 'warning' },
  { value: 'open', key: 'objectStatus.open', label: 'open', state: 'neutral', hollow: true },
  { value: 'confirmed', key: 'objectStatus.confirmed', label: 'confirmed', state: 'information' },
  { value: 'mock-only', key: 'objectStatus.mockOnly', label: 'mock only', state: 'warning' },
  { value: 'handed-over', key: 'objectStatus.handedOver', label: 'handed over', state: 'information' },
  { value: 'done', key: 'objectStatus.done', label: 'done', state: 'success' },
  { value: 'blocked-by-sap', key: 'objectStatus.blockedBySap', label: 'blocked by SAP', state: 'error' },
  { value: 'failed', key: 'objectStatus.failed', label: 'failed', state: 'error' },
];

export const OBJECT_STATUS: Readonly<Record<ObjectStatusValue, ObjectStatusEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
    ObjectStatusValue,
    ObjectStatusEntry
  >,
);

export const OBJECT_STATUS_VALUES: readonly ObjectStatusValue[] = Object.freeze(
  ENTRIES.map((e) => e.value),
);

export const OBJECT_STATUS_LABELS: readonly string[] = Object.freeze(ENTRIES.map((e) => e.label));

export function objectStatus(value: ObjectStatusValue): ObjectStatusEntry {
  const entry = OBJECT_STATUS[value];
  if (!entry) throw new Error(`Unknown object status: ${String(value)}`);
  return entry;
}

export function isObjectStatusValue(value: unknown): value is ObjectStatusValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OBJECT_STATUS, value);
}
