import React from 'react';
import { PHASES } from '@/lib/workflow-steps';
import { wt } from '@/lib/workspace-messages';

/**
 * The six tools of Re-design, in the Re-design card of a new account's first
 * view (ADR-123, mock-up direction A). Since 3.3.0 there is no "optional" group
 * any more: Analyse and Re-design are two equal products, and this is the
 * second one's path — solid, three by two, the same on every width.
 *
 * The names and their order are `PHASES` of `lib/workflow-steps.ts` — the tool
 * bar's own — and are never written here. Only the one-line purpose per tool
 * is copy (`home.path.<key>`). A picture of the path, not a control: no link,
 * no state, the same for every account. Analyze is not in it; it is the other
 * product, and its card says what it gives (`home.path.analyze`).
 */
export default function ToolPathStrip() {
  const redesign = PHASES.slice(1);
  return (
    <section aria-labelledby="home-path-title" data-home-path="">
      <h3 id="home-path-title" className="sr-only">
        {wt('home.redesign.toolsTitle')}
      </h3>
      <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0">
        {redesign.map((phase) => (
          <li
            key={phase.key}
            data-home-path-step={phase.key}
            className="min-w-0 rounded-cc-row border border-cc-line bg-cc-surface p-2"
          >
            <b className="block truncate text-[12px] leading-snug font-bold text-cc-ink">{phase.label}</b>
            <span className="block text-[12px] leading-[1.35] font-medium text-cc-ink-muted">{wt(`home.path.${phase.key}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
