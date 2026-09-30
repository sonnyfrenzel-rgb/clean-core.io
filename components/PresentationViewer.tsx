import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, ExternalLink } from 'lucide-react';
import { safeHttpHref } from '@/lib/export-safety';
import { formatTextDate } from '@/lib/format';
import type { SemanticState } from '@/lib/provenance';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcTable, { type CcTableColumn } from '@/components/cc/Table';
import { STATE_CLASSES } from '@/components/cc/state';
import { cn } from '@/lib/utils';

export interface SlideData {
  title: string;
  type: 'title' | 'bullets' | 'split' | 'quote' | 'metrics' | 'matrix' | 'risk';
  subtitle?: string;
  content?: string[];
  leftContent?: string;
  rightContent?: string;
  quote?: string;
  author?: string;
  speakerNotes?: string;
  metrics?: { label: string; value: string | number; sub?: string }[];
  rows?: {
    col1: string;
    col2: string;
    col3?: string;
    col4?: string;
    status?: 'success' | 'warning' | 'danger' | 'info' | string;
    url?: string;
  }[];
}

export interface PresentationData {
  title: string;
  date: string;
  author: string;
  slides: SlideData[];
}

const renderFormattedText = (text: string | undefined) => {
  if (!text) return null;

  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    // Split by markdown bold (**text**), italic (*text*), and code (`text`) syntax
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

    const renderedLine = parts.map((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={partIdx} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={partIdx} className="italic">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={partIdx} className="px-1 rounded bg-cc-surface-muted border border-cc-line font-cc-mono text-[0.9em] text-cc-ink">{part.slice(1, -1)}</code>;
      }
      return part;
    });

    return (
      <React.Fragment key={lineIdx}>
        {lineIdx > 0 && <br />}
        {renderedLine}
      </React.Fragment>
    );
  });
};

/** A row's `status` as one of the five states of §1.1 — an unknown value is neutral. */
function rowState(status: string | undefined): SemanticState {
  if (status === 'success') return 'success';
  if (status === 'warning') return 'warning';
  if (status === 'danger') return 'error';
  if (status === 'info') return 'information';
  return 'neutral';
}

/** The state of a row as a mark and its words — the dot never stands alone (§1.1). */
function RowStatus({ status, children }: { status?: string; children: React.ReactNode }) {
  const state = rowState(status);
  return (
    <span data-slide-row-status={state} className={cn('inline-flex items-center gap-2 cc-text-meta', STATE_CLASSES[state].text)}>
      <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATE_CLASSES[state].mark)} />
      <span>{children}</span>
    </span>
  );
}

/** One heading form for every slide type: the slide is content in the page, not a poster. */
const SLIDE_HEADING = 'cc-text-title text-cc-ink mb-2 pb-2 border-b border-cc-line self-start';
const SLIDE_SUBTITLE = 'cc-text-label text-cc-ink-muted mb-4';
const SLIDE_ENTER = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';
const LINK = 'inline-flex items-center gap-1 cc-text-meta text-cc-brand-strong underline underline-offset-2 hover:text-cc-brand-deep';

const MATRIX_COLUMNS: readonly CcTableColumn[] = [
  { key: 'construct', label: 'Construct' },
  { key: 'occurrences', label: 'Occurrences' },
  { key: 'recommendation', label: 'Recommendation' },
  { key: 'level', label: 'Level' },
  { key: 'spec', label: 'Spec', numeric: true },
];

const RISK_COLUMNS: readonly CcTableColumn[] = [
  { key: 'risk', label: 'Identified Risk' },
  { key: 'owner', label: 'Owner' },
  { key: 'mitigation', label: 'Mitigation Strategy' },
  { key: 'gate', label: 'Quality Gate / Condition' },
];

export const PresentationViewer = ({ data }: { data: PresentationData }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  if (!data || !data.slides || data.slides.length === 0) {
    return <div className="p-8 text-center cc-text-body text-cc-ink-muted">No presentation data available.</div>;
  }

  const slide = data.slides[currentSlide];
  const total = data.slides.length;
  const previous = currentSlide > 0 ? data.slides[currentSlide - 1] : null;
  const following = currentSlide < total - 1 ? data.slides[currentSlide + 1] : null;

  const nextSlide = () => setCurrentSlide((prev) => Math.min(prev + 1, total - 1));
  const prevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));

  return (
    <div data-presentation-viewer="" className="flex flex-col w-full max-w-5xl mx-auto bg-cc-surface rounded-cc-card shadow-cc overflow-hidden border border-cc-line">
      {/* Slide Content Area */}
      <div className="relative aspect-auto min-h-[300px] sm:aspect-video bg-cc-surface p-6 sm:p-8 md:p-12 flex flex-col justify-center">
        {/* Slide Number */}
        <div aria-live="polite" className="absolute top-4 right-4 sm:top-6 sm:right-8 cc-text-meta text-cc-ink-muted tabular-nums">
          <span className="sr-only">Slide </span>{currentSlide + 1} / {total}
        </div>

        {/* Company/Project Branding */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-8 cc-text-label text-cc-ink-muted truncate max-w-[60%]">
          {data.title}
        </div>

        {/* Slide Layouts */}
        {slide.type === 'title' && (
          <div className={cn('text-center mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className="cc-text-title text-cc-ink mb-4">{slide.title}</h2>
            {slide.subtitle && <p className="cc-text-h2 text-cc-ink-muted">{slide.subtitle}</p>}
            <div className="mt-8 cc-text-meta text-cc-ink-muted">
              {data.author} • {formatTextDate(new Date())}
            </div>
          </div>
        )}

        {slide.type === 'bullets' && (
          <div className={cn('h-full flex flex-col mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className={cn(SLIDE_HEADING, 'mb-6')}>{slide.title}</h2>
            <ul className="space-y-4 flex-grow">
              {slide.content?.map((point, idx) => (
                <li key={idx} className="flex items-start gap-3 cc-text-body text-cc-ink">
                  <span aria-hidden className="w-2 h-2 rounded-full bg-cc-ink-muted mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">{renderFormattedText(point)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.type === 'split' && (
          <div className={cn('h-full flex flex-col mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className={cn(SLIDE_HEADING, 'mb-6')}>{slide.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 flex-grow items-center">
              <div className="bg-cc-surface-muted p-6 sm:p-8 rounded-cc-card border border-cc-line h-full flex items-center cc-text-body text-cc-ink">
                <div className="w-full">{renderFormattedText(slide.leftContent)}</div>
              </div>
              <div className="bg-cc-surface p-6 sm:p-8 rounded-cc-card border border-cc-field-border h-full flex items-center cc-text-body text-cc-ink">
                <div className="w-full">{renderFormattedText(slide.rightContent)}</div>
              </div>
            </div>
          </div>
        )}

        {slide.type === 'quote' && (
          <div className={cn('h-full flex flex-col items-center justify-center text-center px-4 sm:px-8 md:px-12 mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className="cc-text-label text-cc-ink-muted mb-6">{slide.title}</h2>
            <blockquote className="cc-text-title text-cc-ink mb-6">
              &quot;{slide.quote}&quot;
            </blockquote>
            {slide.author && <cite className="cc-text-body text-cc-ink-muted not-italic">— {slide.author}</cite>}
          </div>
        )}

        {slide.type === 'metrics' && (
          <div className={cn('h-full flex flex-col mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className={SLIDE_HEADING}>
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className={SLIDE_SUBTITLE}>{slide.subtitle}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {slide.metrics?.map((metric, idx) => (
                <div key={idx} className="bg-cc-surface-muted p-4 rounded-cc-card border border-cc-line flex flex-col justify-center text-center">
                  <span className="cc-text-figure text-cc-ink mb-1">
                    {metric.value}
                  </span>
                  <span className="cc-text-label text-cc-ink-muted">
                    {metric.label}
                  </span>
                  {metric.sub && (
                    <span className="cc-text-meta font-medium text-cc-ink-muted mt-1 leading-tight">
                      {metric.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {slide.content && slide.content.length > 0 && (
              <ul className="space-y-2 mt-2 flex-grow">
                {slide.content.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2 cc-text-body text-cc-ink">
                    <span aria-hidden className="w-2 h-2 rounded-full bg-cc-ink-muted mt-2 flex-shrink-0" />
                    <span className="leading-relaxed">{renderFormattedText(point)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {slide.type === 'matrix' && (
          <div className={cn('h-full flex flex-col mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className={SLIDE_HEADING}>
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className={SLIDE_SUBTITLE}>{slide.subtitle}</p>
            )}

            <div className="rounded-cc-card border border-cc-line bg-cc-surface flex-grow">
              <CcTable
                caption={slide.title}
                columns={MATRIX_COLUMNS}
                rows={(slide.rows ?? []).map((row, idx) => ({
                  key: String(idx),
                  cells: {
                    construct: <span className="font-semibold">{renderFormattedText(row.col1)}</span>,
                    occurrences: <span className="text-cc-ink-muted">{row.col2}</span>,
                    recommendation: <span className="text-cc-ink-muted leading-relaxed">{renderFormattedText(row.col3)}</span>,
                    level: <RowStatus status={row.status}>{row.col4}</RowStatus>,
                    // `row.url` is model-supplied. It goes on an anchor only as
                    // an http(s) URL - React renders a `javascript:` href with
                    // nothing more than a development warning (security audit
                    // of b88c77b, SEC-2026-152). Anything else is shown as no
                    // link rather than a link that runs.
                    spec: safeHttpHref(row.url) ? (
                      <a
                        href={safeHttpHref(row.url)}
                        target="_blank"
                        rel="noreferrer"
                        className={LINK}
                      >
                        Doc <ExternalLink size={12} aria-hidden />
                      </a>
                    ) : (
                      <span className="text-cc-ink-muted" title={row.url ? 'The document link the model supplied is not an http(s) address and was not rendered.' : undefined}>—</span>
                    ),
                  },
                }))}
              />
            </div>
          </div>
        )}

        {slide.type === 'risk' && (
          <div className={cn('h-full flex flex-col mt-8 sm:mt-0', SLIDE_ENTER)}>
            <h2 className={SLIDE_HEADING}>
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className={SLIDE_SUBTITLE}>{slide.subtitle}</p>
            )}

            <div className="rounded-cc-card border border-cc-line bg-cc-surface flex-grow">
              <CcTable
                caption={slide.title}
                columns={RISK_COLUMNS}
                rows={(slide.rows ?? []).map((row, idx) => ({
                  key: String(idx),
                  cells: {
                    risk: (
                      <span className="inline-flex items-start gap-2 font-semibold">
                        {/* As before: success and warning keep their state, anything else reads as an error. */}
                        <span
                          aria-hidden
                          className={cn(
                            'w-2 h-2 mt-1 rounded-full flex-shrink-0',
                            STATE_CLASSES[row.status === 'success' || row.status === 'warning' ? rowState(row.status) : 'error'].mark,
                          )}
                        />
                        <span>{renderFormattedText(row.col1)}</span>
                      </span>
                    ),
                    owner: <span className="text-cc-ink-muted">{row.col2}</span>,
                    mitigation: <span className="text-cc-ink-muted leading-relaxed">{renderFormattedText(row.col3)}</span>,
                    gate: <span className="font-semibold">{renderFormattedText(row.col4)}</span>,
                  },
                }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls & Speaker Notes */}
      <div className="border-t border-cc-line bg-cc-surface-muted p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <CcButton
            density="cozy"
            onClick={() => setShowNotes(!showNotes)}
            aria-pressed={showNotes}
            icon={<FileText size={16} aria-hidden />}
          >
            Speaker Notes
          </CcButton>

          {/* UX-033: each slide switch says where it goes. UX-068: 44 px targets and the visible focus of §1.6. */}
          <div className="flex items-center gap-4 w-full sm:w-auto justify-center">
            <CcIconButton
              density="cozy"
              onClick={prevSlide}
              disabled={!previous}
              label={previous ? `Previous slide: ${previous.title}` : 'Previous slide'}
              title={previous ? `Previous slide: ${previous.title}` : undefined}
            >
              <ChevronLeft size={20} aria-hidden />
            </CcIconButton>
            <CcIconButton
              density="cozy"
              onClick={nextSlide}
              disabled={!following}
              label={following ? `Next slide: ${following.title}` : 'Next slide'}
              title={following ? `Next slide: ${following.title}` : undefined}
            >
              <ChevronRight size={20} aria-hidden />
            </CcIconButton>
          </div>
        </div>

        {/* Speaker Notes Panel */}
        {showNotes && (
          <div className="p-4 sm:p-6 bg-cc-surface rounded-cc-card border border-cc-line">
            <h4 className="cc-text-label text-cc-ink-muted mb-2">Speaker Notes</h4>
            <p className="cc-text-body text-cc-ink leading-relaxed">
              {renderFormattedText(slide.speakerNotes || "No speaker notes for this slide.")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
