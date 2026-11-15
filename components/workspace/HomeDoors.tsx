'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, PlayCircle } from 'lucide-react';
import { DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import { wt } from '@/lib/workspace-messages';

/**
 * The demo and the examples as two doors below the list (AB-14b, mockup `doorDemo`, `doorExamples`).
 *
 * The demo used to be the first row of the table, a project of nobody's with a status it had not earned; the examples
 * stood as a whole gallery under the list. Both stay one click away and say what they are: the demo runs nothing and
 * saves nothing; an example runs free the first time (`starterExampleIsFree`). "See the examples" opens today's start
 * of a new analysis, which opens on its examples.
 */
export default function HomeDoors() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-home-doors="">
      <Door
        icon={<PlayCircle size={18} aria-hidden={true} />}
        title={wt('homeList.doorDemoTitle')}
        body={wt('homeList.doorDemoBody')}
        href={DEMO_WORKSPACE_ROUTE}
        action={wt('homeList.doorDemoAction')}
        marker="demo"
      />
      <Door
        icon={<FileText size={18} aria-hidden={true} />}
        title={wt('homeList.doorExamplesTitle')}
        body={wt('homeList.doorExamplesBody')}
        href="/admin/new-project"
        action={wt('homeList.doorExamplesAction')}
        marker="examples"
      />
    </div>
  );
}

function Door({
  icon,
  title,
  body,
  href,
  action,
  marker,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  action: string;
  marker: string;
}) {
  return (
    <section
      data-home-door={marker}
      aria-label={title}
      className="flex flex-wrap items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cc-surface-muted text-cc-ink">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[14px] font-bold text-cc-ink">{title}</h2>
        <p className="mt-0.5 mb-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{body}</p>
      </div>
      <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-semibold text-cc-ink underline underline-offset-2">
        {action}
        <ArrowRight size={14} aria-hidden={true} />
      </Link>
    </section>
  );
}
