'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { saveAs } from '@/lib/fileSaver';
import { levelCountsOf, type PortfolioView, type ProgramRef } from '@/lib/portfolio/aggregate';
import { portfolioCsv, portfolioWorkbook } from '@/lib/portfolio/export';
import {
  wt,
  PORTFOLIO_EXPORT_NOTE,
  portfolioBucketLabel,
  portfolioCoverage,
  portfolioNotDeterminedLabel,
  portfolioObjectUses,
  portfolioObjectsAssigned,
  portfolioProgramCount,
  portfolioRecurringLine,
} from '@/lib/workspace-messages';
import { scoreBand } from '@/lib/clean-core-score';

/**
 * The aggregated view on screen — roadmap 3.0.21 (2) and (3).
 *
 * Read-only: every figure is a count with the programs behind it, and every
 * program opens its project where the reader may open it (`openable`). Not
 * determined has its own card and is never folded into a figure. No average,
 * no portfolio score (`lib/portfolio/aggregate.ts`).
 *
 * The print is one page for a steering meeting: the figures and the coverage,
 * without the program lists, the controls or the app's chrome
 * (`data-portfolio-print`, `print:` variants).
 */

function ProgramLinks({ programs, openable }: { programs: ProgramRef[]; openable: ReadonlySet<string> }) {
  if (programs.length === 0) return null;
  return (
    <div className="print:hidden">
      <CcDisclosure title={wt('portfolio.showPrograms')} count={programs.length} density="compact">
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0" data-portfolio-programs="">
          {programs.map((p) => (
            <li key={p.projectId} className="text-[12px] font-medium">
              {openable.has(p.projectId) ? (
                <Link href={`/project/${p.projectId}`} className="font-cc-mono text-cc-brand-strong underline underline-offset-2">
                  {p.name}
                </Link>
              ) : (
                <span className="font-cc-mono text-cc-ink">{p.name}</span>
              )}
            </li>
          ))}
        </ul>
      </CcDisclosure>
    </div>
  );
}

function FigureRow({
  label,
  count,
  of,
  programs,
  openable,
  figure,
  lead,
}: {
  label: React.ReactNode;
  count: number;
  of: number;
  programs: ProgramRef[];
  openable: ReadonlySet<string>;
  figure: string;
  lead?: React.ReactNode;
}) {
  const width = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <li data-portfolio-figure={figure} data-count={count} className="flex min-w-0 flex-col gap-1 border-b border-cc-line py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {lead}
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-cc-ink">{label}</span>
        <span className="shrink-0 text-[15px] font-extrabold text-cc-ink">{count.toLocaleString('en')}</span>
      </div>
      <div aria-hidden={true} className="h-1.5 w-full rounded-full bg-cc-surface-muted">
        <div className="h-1.5 rounded-full bg-cc-ink-muted" style={{ width: `${width}%` }} />
      </div>
      <ProgramLinks programs={programs} openable={openable} />
    </li>
  );
}

export default function PortfolioOverview({
  view,
  openable,
  truncated,
  title,
}: {
  view: PortfolioView;
  openable: readonly string[];
  truncated: boolean;
  /** The name the exports and the print carry. */
  title: string;
}) {
  const canOpen = new Set(openable);
  const [exportError, setExportError] = useState('');
  const coverage = portfolioCoverage(view.coverage);
  const analysed = view.coverage.analysed;
  const fileBase = `portfolio-${title.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'overview'}`;

  const exportCsv = async () => {
    setExportError('');
    try {
      await saveAs(new Blob([portfolioCsv(view)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };
  const exportXlsx = async () => {
    setExportError('');
    try {
      const mod = await import('exceljs');
      const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as unknown as Parameters<typeof portfolioWorkbook>[0];
      const buffer = await portfolioWorkbook(ExcelJS, view, title);
      await saveAs(
        new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${fileBase}.xlsx`,
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-portfolio-overview="" data-portfolio-print="">
      <div className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc print:border-0 print:p-0 print:shadow-none">
        <h2 className="m-0 hidden text-[18px] font-extrabold text-cc-ink print:block">
          {wt('portfolio.printHeading')} · {title}
        </h2>
        <p data-portfolio-coverage="" className="m-0 text-[15px] font-bold text-cc-ink">
          {coverage}
        </p>
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
          <CcProvenanceChip value="reconstructed" />
          <span data-portfolio-note="">{PORTFOLIO_EXPORT_NOTE}</span>
        </p>
        {truncated ? (
          <CcMessageStrip state="warning">{wt('portfolio.viewTruncated')}</CcMessageStrip>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('portfolio.exportTitle')}</span>
          <CcButton density="compact" icon={<Download size={14} aria-hidden={true} />} onClick={() => void exportCsv()} data-portfolio-export="csv">
            {wt('portfolio.exportCsv')}
          </CcButton>
          <CcButton density="compact" icon={<FileSpreadsheet size={14} aria-hidden={true} />} onClick={() => void exportXlsx()} data-portfolio-export="xlsx">
            {wt('portfolio.exportXlsx')}
          </CcButton>
          <CcButton density="compact" icon={<Printer size={14} aria-hidden={true} />} onClick={() => window.print()} data-portfolio-export="print">
            {wt('portfolio.print')}
          </CcButton>
        </div>
        {exportError ? (
          <CcMessageStrip state="error" announce>
            {exportError}
          </CcMessageStrip>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-2">
        <CcCard title={wt('portfolio.bandsTitle')} level={2} meta={portfolioProgramCount(analysed)}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.bandsLead')}</p>
          <ul className="m-0 list-none p-0" data-portfolio-bands="">
            {[...view.bands].reverse().map((b) => (
              <FigureRow
                key={b.key}
                figure={`band-${b.key}`}
                label={`${b.range} · ${b.label}`}
                count={b.programs.length}
                of={analysed}
                programs={b.programs}
                openable={canOpen}
              />
            ))}
          </ul>
        </CcCard>

        <CcCard title={wt('portfolio.levelsTitle')} level={2} meta={portfolioObjectUses(view.levelUses, analysed)}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.levelsLead')}</p>
          <ul className="m-0 list-none p-0" data-portfolio-levels="">
            {view.levels.map((l) => (
              <FigureRow
                key={l.grade}
                figure={`level-${l.grade}`}
                lead={<CcCleanCoreLevel value={l.grade} />}
                label={l.grade === 'Unknown' ? wt('portfolio.levelUnknown') : `${wt('portfolio.levelWord')} ${l.grade}`}
                count={l.uses}
                of={view.levelUses}
                programs={l.programs}
                openable={canOpen}
              />
            ))}
          </ul>
        </CcCard>

        <CcCard title={wt('portfolio.bucketsTitle')} level={2} meta={portfolioObjectsAssigned(view.bucketObjects, analysed)}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.bucketsLead')}</p>
          <ul className="m-0 list-none p-0" data-portfolio-buckets="">
            {view.buckets.map((b) => (
              <FigureRow
                key={b.bucket}
                figure={`bucket-${b.bucket}`}
                label={portfolioBucketLabel(b.bucket)}
                count={b.objects}
                of={view.bucketObjects}
                programs={b.programs}
                openable={canOpen}
              />
            ))}
          </ul>
        </CcCard>

        <CcCard title={wt('portfolio.notDeterminedTitle')} level={2} meta={<CcProvenanceChip value="not-determined" />}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.notDeterminedLead')}</p>
          {view.notDetermined.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('portfolio.nothingOpen')}</p>
          ) : (
            <ul className="m-0 list-none p-0" data-portfolio-not-determined="">
              {view.notDetermined.map((f) => (
                <FigureRow
                  key={f.key}
                  figure={`nd-${f.key}`}
                  label={portfolioNotDeterminedLabel(f.key)}
                  count={f.programs.length}
                  of={view.coverage.projects}
                  programs={f.programs}
                  openable={canOpen}
                />
              ))}
            </ul>
          )}
        </CcCard>

        <CcCard title={wt('portfolio.recurringTitle')} level={2} count={view.recurring.length}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.recurringLead')}</p>
          {view.recurring.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('portfolio.noneRecur')}</p>
          ) : (
            <ul className="m-0 list-none p-0" data-portfolio-recurring="">
              {view.recurring.map((r) => (
                <FigureRow
                  key={r.object}
                  figure={`object-${r.object}`}
                  label={portfolioRecurringLine(r.object, r.use, r.programs.length)}
                  count={r.programs.length}
                  of={analysed}
                  programs={r.programs}
                  openable={canOpen}
                />
              ))}
            </ul>
          )}
        </CcCard>

        <CcCard title={wt('portfolio.kindsTitle')} level={2} count={view.kinds.length}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('portfolio.kindsLead')}</p>
          {view.kinds.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('portfolio.noKinds')}</p>
          ) : (
            <ul className="m-0 list-none p-0" data-portfolio-kinds="">
              {view.kinds.slice(0, 20).map((k) => (
                <FigureRow
                  key={k.kind}
                  figure={`kind-${k.kind}`}
                  label={k.label}
                  count={k.programs.length}
                  of={analysed}
                  programs={k.programs}
                  openable={canOpen}
                />
              ))}
            </ul>
          )}
        </CcCard>
      </div>

      <div className="print:hidden">
        <CcCard title={wt('portfolio.programsTitle')} level={2} count={view.programs.length}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px]" data-portfolio-table="">
              <thead>
                <tr className="border-b border-cc-line text-cc-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">{wt('portfolio.colProgram')}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">{wt('portfolio.colScore')}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">{wt('portfolio.colBand')}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">{wt('portfolio.colLevels')}</th>
                  <th scope="col" className="py-2 font-semibold">{wt('portfolio.colIncludes')}</th>
                </tr>
              </thead>
              <tbody>
                {view.programs.map((p) => {
                  const levels = levelCountsOf(p);
                  return (
                    <tr key={p.projectId} className="border-b border-cc-line" data-portfolio-row={p.projectId}>
                      <td className="py-2 pr-3 font-cc-mono">
                        {canOpen.has(p.projectId) ? (
                          <Link href={`/project/${p.projectId}`} className="text-cc-brand-strong underline underline-offset-2">
                            {p.name}
                          </Link>
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-cc-ink">{typeof p.score === 'number' ? p.score : wt('portfolio.notAnalysed')}</td>
                      <td className="py-2 pr-3 text-cc-ink">{typeof p.score === 'number' ? scoreBand(p.score).label : ''}</td>
                      <td className="py-2 pr-3 text-cc-ink">
                        {p.analysed ? `${levels.A} · ${levels.B} · ${levels.C} · ${levels.D} · ${levels.Unknown}` : ''}
                      </td>
                      <td className="py-2 font-cc-mono text-cc-ink">{p.includesNotRead.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CcCard>
      </div>
    </div>
  );
}
