'use client';

import React, { useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcTabs from '@/components/cc/Tabs';
import { CcTag } from '@/components/cc/Tag';
import type { NoProcessElementReason } from '@/lib/abap/business-rule-set';
import type { ProcessHandbook } from '@/lib/process-handbook';
import { cn } from '@/lib/utils';
import { InputsOutputs, LineAnchor } from './HandbookStage';

/**
 * The drawer under the Documentation stage's canvas — proposal B.
 *
 * The handbook as a row of chapters, the program's inputs and outputs, the
 * rules the code holds outside the drawn process, and the exports. The export
 * buttons themselves are the page's (they know the project); this file only
 * gives them their place, so a download stays one implementation.
 */

type DrawerTab = 'chapters' | 'io' | 'outside' | 'export';

const OUTSIDE_WORDS: Record<NoProcessElementReason, string> = {
  'declaration-only': 'declaration only',
  unreached: 'not reached',
  'technical-helper': 'technical helper',
  'not-in-skeleton': 'outside the process',
};

export interface HandbookDrawerProps {
  handbook: ProcessHandbook | null;
  reading: boolean;
  selectedChapter: string | null;
  onSelect: (elementId: string) => void;
  /** The export buttons of the chapters header — PDF, Confluence, BPMN 2.0. */
  exportActions: React.ReactNode;
  /** What stands under them, visible without a click: the caveats. */
  exportNotes: React.ReactNode;
  /** The Export tab — every format with what it holds. */
  exportPanel: React.ReactNode;
}

export default function HandbookDrawer({
  handbook,
  reading,
  selectedChapter,
  onSelect,
  exportActions,
  exportNotes,
  exportPanel,
}: HandbookDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>('chapters');
  const chapters = handbook?.chapters ?? [];

  return (
    <section
      data-handbook-drawer=""
      aria-label="Handbook"
      className="mt-6 rounded-cc-card border border-cc-line bg-cc-surface px-4 pt-2 pb-4 shadow-cc md:px-6 md:pb-6"
    >
      <CcTabs<DrawerTab>
        label="Handbook"
        value={tab}
        onChange={setTab}
        density="cozy"
        tabs={[
          {
            value: 'chapters',
            label: 'Chapters',
            count: chapters.length,
            content: (
              <div className="pt-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="m-0 cc-text-h3 text-cc-ink">
                    Handbook · {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
                  </h2>
                  <div className="flex flex-wrap items-start gap-2">{exportActions}</div>
                </div>
                <div className="mb-3 flex flex-col gap-1">{exportNotes}</div>
                {chapters.length === 0 ? (
                  <p className="m-0 cc-text-cell text-cc-ink-muted">
                    {reading ? 'Reading the chapters out of the code…' : 'There are no chapters until the process has been read from a signed analysis.'}
                  </p>
                ) : (
                  <ol
                    data-handbook-chapters=""
                    className="cc-doc-chapters m-0 flex list-none gap-3 overflow-x-auto p-0 pb-2"
                  >
                    {chapters.map((chapter) => {
                      const on = chapter.id === selectedChapter;
                      return (
                        <li
                          key={chapter.id}
                          data-handbook-chapter={chapter.id}
                          className={cn(
                            'relative flex w-56 shrink-0 flex-col gap-2 rounded-cc-card border bg-cc-surface p-3',
                            on ? 'border-cc-focus ring-2 ring-cc-information-border' : 'border-cc-line',
                          )}
                        >
                          <h3 className="m-0 flex items-baseline gap-2 cc-text-h3 text-cc-ink">
                            <span className="font-cc-mono text-[12px] text-cc-ink-muted">{String(chapter.number).padStart(2, '0')}</span>
                            <button
                              type="button"
                              onClick={() => onSelect(chapter.id)}
                              aria-current={on ? 'step' : undefined}
                              className={cn(
                                'text-left after:absolute after:inset-0 after:rounded-cc-card hover:underline',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus focus-visible:outline-solid',
                              )}
                            >
                              {chapter.title}
                            </button>
                          </h3>
                          <p className="m-0 line-clamp-3 cc-text-meta font-medium text-cc-ink-muted">
                            {chapter.summary || 'Runs without reading or writing a table by name.'}
                          </p>
                          <div className="mt-auto flex flex-wrap gap-1">
                            {chapter.rules.length ? <CcTag>{chapter.rules.length} {chapter.rules.length === 1 ? 'rule' : 'rules'}</CcTag> : null}
                            {chapter.exceptions.length ? <CcTag>{chapter.exceptions.length} exc.</CcTag> : null}
                            {chapter.writes.length ? <CcTag>writes</CcTag> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ),
          },
          {
            value: 'io',
            label: 'Inputs and outputs',
            content: handbook ? (
              <div className="-mt-4"><InputsOutputs handbook={handbook} /></div>
            ) : (
              <p className="m-0 pt-2 cc-text-cell text-cc-ink-muted">Read from the signed source once the process is read.</p>
            ),
          },
          {
            value: 'outside',
            label: 'Rules outside the process',
            count: handbook?.rulesOutside.length ?? 0,
            content: (
              <div className="pt-2">
                <p className="m-0 mb-2 cc-text-cell text-cc-ink-muted">
                  Values and conditions the code holds that take effect at no step of the drawn process.
                </p>
                {(handbook?.rulesOutside.length ?? 0) === 0 ? (
                  <p className="m-0 cc-text-cell text-cc-ink-muted">None — every rule the code holds decides at a step.</p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {handbook!.rulesOutside.map((rule) => (
                      <li
                        key={rule.id}
                        data-handbook-rule-outside={rule.id}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-t border-cc-line py-2 first:border-t-0"
                      >
                        <CcAnchor label={`Business rule ${rule.id}`}>{rule.id}</CcAnchor>
                        <span className="min-w-0 cc-text-cell text-cc-ink">
                          {rule.text}
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-cc-ink-muted">
                            <CcTag>{OUTSIDE_WORDS[rule.reason]}</CcTag>
                            {rule.detail}
                          </span>
                        </span>
                        <LineAnchor anchor={rule.anchor} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          },
          {
            value: 'export',
            label: 'Export',
            content: <div className="pt-2">{exportPanel}</div>,
          },
        ]}
      />
    </section>
  );
}
