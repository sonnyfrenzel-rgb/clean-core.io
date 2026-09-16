/**
 * The five states as classes — one table, read by every component here.
 *
 * Written out in full rather than assembled from a template, because Tailwind
 * scans source text: `text-cc-${state}` generates nothing at all, and the
 * element then inherits its colour. That is the same failure the 56 half-step
 * shades in `app/globals.css` were built for, one namespace over.
 *
 * `border` is the pale border of §1.1 — for surfaces whose edge is carried by
 * the text on them (filled chips, message strips). `borderStrong` is the one
 * that has to be seen on white at 3:1 (§1.1, WCAG 1.4.11) — outline and dashed
 * chips, field borders in a value state. Warning has two: `--cc-warning` is
 * dark enough for text, `--cc-warning-line` is the one that reaches 3:1 as a
 * line without going black.
 */

import type { SemanticState } from '@/lib/provenance';

export interface StateClasses {
  text: string;
  bg: string;
  border: string;
  borderStrong: string;
  /** The dot of an object status, and any other mark that carries the state. */
  mark: string;
}

export const STATE_CLASSES: Record<SemanticState, StateClasses> = {
  success: {
    text: 'text-cc-success',
    bg: 'bg-cc-success-bg',
    border: 'border-cc-success-border',
    borderStrong: 'border-cc-success',
    mark: 'bg-cc-success',
  },
  warning: {
    text: 'text-cc-warning',
    bg: 'bg-cc-warning-bg',
    border: 'border-cc-warning-border',
    borderStrong: 'border-cc-warning-line',
    mark: 'bg-cc-warning',
  },
  error: {
    text: 'text-cc-error',
    bg: 'bg-cc-error-bg',
    border: 'border-cc-error-border',
    borderStrong: 'border-cc-error',
    mark: 'bg-cc-error',
  },
  information: {
    text: 'text-cc-information',
    bg: 'bg-cc-information-bg',
    border: 'border-cc-information-border',
    borderStrong: 'border-cc-information',
    mark: 'bg-cc-information',
  },
  neutral: {
    text: 'text-cc-neutral',
    bg: 'bg-cc-neutral-bg',
    border: 'border-cc-neutral-border',
    borderStrong: 'border-cc-neutral',
    mark: 'bg-cc-neutral',
  },
};
