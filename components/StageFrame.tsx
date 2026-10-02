import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The frame of a workflow stage. There is exactly one (ADR-063).
 *
 * Owner, 02.10.2026: "wenn ich von analyze zu design schalte ist der ganze
 * bildschirm nach links gerückt, alle screens müssen je nach formfaktor sich
 * gleich anfühlen". Each stage used to choose its own container — Analyze
 * `max-w-5xl mx-auto` until it had results, Transformation and Delivery
 * `max-w-7xl mx-auto` (Delivery with a padding of its own on phones), Testing,
 * Economics and Documentation none, and the shell gave Design and
 * Documentation a wider column than the rest. So the way back, the tools bar,
 * the title and the content began at a different x on every tool.
 *
 * Now the shell (`app/(app)/layout.tsx`) gives every stage the object page's
 * column, and every stage — in the product and in the demo — renders its whole
 * page inside this frame: full width of that column, no width or margin of its
 * own. A block that reads better narrower (a form, a paragraph) keeps its own
 * `max-w-*`, left-aligned to the frame — never `mx-auto`, which would put its
 * left edge somewhere else again. A canvas uses the frame's full width.
 *
 * `className` is for what is not geometry (an entrance animation, the `.cc`
 * scope, a minimum height); `tests/stage-frame.spec.ts` measures the rendered
 * frame on all fourteen pages at five widths and fails on any difference.
 */
export default function StageFrame({
  stage,
  className,
  children,
  ...rest
}: {
  stage: string;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div {...rest} data-stage-frame={stage} className={cn('w-full min-w-0', className)}>
      {children}
    </div>
  );
}
