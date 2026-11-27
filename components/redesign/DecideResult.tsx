'use client';

import React from 'react';
import { Info } from 'lucide-react';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { CardBinding } from '@/lib/decision-card';
import type { DecisionTimelineEntry } from '@/lib/project-decision';
import { withoutSourcePaths } from '@/lib/decision-manager';

/**
 * The Decide page once the decision is recorded (ADR-145 S5; mock-up screen 3): the answer card says what was decided,
 * by whom and on which run, with the one next action; four facets; one strip saying what stays reachable; the way to
 * withdraw it; and, folded, the record's technical basis and its timeline. An end is an end: a decision that builds
 * nothing says "Done" and leaves Design optional. Drawn from its props; the project page hands the actions.
 */
export default function DecideResult({
  answer,
  why,
  action,
  actionNote,
  facets,
  strip,
  links,
  outdated,
  bindings,
  timeline,
}: {
  answer: string;
  why: React.ReactNode;
  action: React.ReactNode;
  actionNote: React.ReactNode;
  facets: FacetProps[];
  strip: React.ReactNode;
  links: React.ReactNode;
  /** Why the record is out of date, or `null`. */
  outdated: string | null;
  bindings: readonly CardBinding[];
  timeline: readonly DecisionTimelineEntry[];
}) {
  return (
    <div data-decide-result="" className="flex flex-col gap-4">
      <AnswerCard
        id="decide-answer"
        question="What happens to this program?"
        chips={<FamilyChip kind="yours" note="your account" />}
        answer={answer}
        condition={why}
        action={action}
        actionNote={actionNote}
        facets={facets}
      />
      {outdated ? (
        <div data-decide-outdated="" role="status" className="flex items-start gap-2 rounded-cc-row border border-cc-warning-border bg-cc-warning-bg px-3 py-2 cc-text-cell text-cc-ink">
          <Info size={16} aria-hidden={true} className="mt-1 shrink-0 text-cc-warning" />
          <span>{outdated}</span>
        </div>
      ) : null}
      <div data-decide-strip="" className="flex items-start gap-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 cc-text-cell text-cc-ink">
        <Info size={16} aria-hidden={true} className="mt-1 shrink-0 text-cc-information" />
        <span>{strip}</span>
      </div>
      {links ? <p data-decide-links="" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 cc-text-cell">{links}</p> : null}
      <div data-decide-record-fold="" className="rounded-cc-card border border-cc-line bg-cc-surface px-5 py-2 shadow-cc max-[720px]:px-4">
        <CcDisclosure title="The record: what it binds, and its timeline" count={bindings.length + timeline.length} level={3} density="compact">
          <ul data-decide-bindings="" className="m-0 list-none space-y-2 p-0">
            {bindings.map((b) => (
              <li key={b.key} data-decide-binding={b.key} className="cc-text-meta">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-cc-ink-muted">{b.label}</span>
                  <span className="font-semibold text-cc-ink" title={b.value ?? undefined}>
                    {b.value === null ? 'Not determined' : b.shown}
                  </span>
                  <CcProvenanceChip value={b.provenance} />
                </span>
                {b.value === null && b.reason ? <span className="mt-1 block text-cc-ink-muted">{withoutSourcePaths(b.reason)}</span> : null}
              </li>
            ))}
          </ul>
          {timeline.length > 0 ? (
            <ol data-decide-timeline="" className="m-0 mt-3 list-none space-y-1 border-t border-cc-line p-0 pt-2">
              {timeline.map((e, i) => (
                <li key={`${e.at}-${e.kind}-${i}`} className="cc-text-meta font-medium text-cc-ink">
                  <code className="text-cc-ink-muted">{e.at.slice(0, 10)}</code> {e.sentence}
                  {e.account ? <span className="text-cc-ink-muted"> · {e.account}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </CcDisclosure>
      </div>
    </div>
  );
}
