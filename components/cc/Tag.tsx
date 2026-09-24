'use client';

import React from 'react';
import { ruleProperty, type RulePropertyValue } from '@/lib/rule-property';

/**
 * The tag — `DESIGN.md` §4.1.
 *
 * A 4px rectangle on the muted surface, muted ink, no icon, no state colour.
 * Deliberately the quietest of the five vocabularies, because it is the one
 * that repeats most: every business rule in a list carries one.
 *
 * `CcRulePropertyTag` is the fixed-list version and is what screens use. The
 * bare `CcTag` exists for labels that are not a vocabulary at all — "Demo" on a
 * project row — and carries no meaning beyond its text, which is why it takes
 * one and the other does not.
 */
const CLASSES =
  'inline-block rounded-[4px] border border-cc-line bg-cc-surface-muted px-1.5 align-middle text-[11px] font-medium leading-[18px] text-cc-ink-muted whitespace-nowrap';

export function CcTag({ children }: { children: React.ReactNode }) {
  return (
    <span data-cc-tag="" className={CLASSES}>
      {children}
    </span>
  );
}

export function CcRulePropertyTag({ value }: { value: RulePropertyValue }) {
  const entry = ruleProperty(value);
  return (
    <span data-cc-tag="rule-property" data-cc-value={entry.value} title={entry.meaning} className={CLASSES}>
      {entry.label}
    </span>
  );
}

export default CcTag;
