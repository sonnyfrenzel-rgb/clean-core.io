/**
 * Where a business rule lives — `DESIGN.md` §4.1.
 *
 * Three values, and the point of the list is the sentence under the table in
 * §4.1: a rule property says **where** a rule stands and is never evidence.
 * "hard-coded in program" is a fact about the source, not a verdict about the
 * customer — the reveal line says the rule sits in the program, not that nobody
 * ever documented it (ADR-015).
 *
 * Its form is the tag: a 4px rectangle on `--cc-surface-muted`, muted ink, no
 * icon. Deliberately the quietest of the four vocabularies, because it is the
 * one that repeats most often.
 */

export type RulePropertyValue = 'hard-coded' | 'customizing' | 'master-data';

export interface RulePropertyEntry {
  value: RulePropertyValue;
  key: string;
  label: string;
  meaning: string;
}

const ENTRIES: RulePropertyEntry[] = [
  {
    value: 'hard-coded',
    key: 'ruleProperty.hardCoded',
    label: 'hard-coded in program',
    meaning: 'The value stands in the ABAP source, at the anchor given.',
  },
  {
    value: 'customizing',
    key: 'ruleProperty.customizing',
    label: 'customizing',
    meaning: 'The value is read from a customizing table.',
  },
  {
    value: 'master-data',
    key: 'ruleProperty.masterData',
    label: 'master data',
    meaning: 'The value is read from master data.',
  },
];

export const RULE_PROPERTY: Readonly<Record<RulePropertyValue, RulePropertyEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
    RulePropertyValue,
    RulePropertyEntry
  >,
);

export const RULE_PROPERTY_VALUES: readonly RulePropertyValue[] = Object.freeze(
  ENTRIES.map((e) => e.value),
);

export const RULE_PROPERTY_LABELS: readonly string[] = Object.freeze(ENTRIES.map((e) => e.label));

export function ruleProperty(value: RulePropertyValue): RulePropertyEntry {
  const entry = RULE_PROPERTY[value];
  if (!entry) throw new Error(`Unknown rule property: ${String(value)}`);
  return entry;
}

export function isRulePropertyValue(value: unknown): value is RulePropertyValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RULE_PROPERTY, value);
}
