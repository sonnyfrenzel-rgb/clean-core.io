import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { CcTag } from '@/components/cc/Tag';
import {
  DEMO_LIST_TAGLINE,
  DEMO_PROJECT_TITLE,
  DEMO_ROUTE,
  DEMO_SUBJECT,
  DEMO_TAG,
} from '@/lib/demo-marks';

/**
 * The demo's entry in "My workspace" — roadmap step 0.10.
 *
 * It sits above the project list rather than inside it, because it is not one of
 * the reader's projects: it belongs to no account, it cannot be renamed, copied
 * or deleted, and the list below is a Firestore query that will never return it.
 * The tag and the "Demo ·" title are the two marks that keep the two apart at a
 * glance (`DESIGN.md` §6.1.2) — an account that starts the same example itself
 * gets a project called `Z_MM_PO_APPROVAL`, with no prefix.
 *
 * Deliberately not an invitation to start something: the invitation lives inside
 * the demo, one per screen. This is a door.
 *
 * Block D (D.22b): a card of the workspace (§1.4) — tokens, 12 px radius, the
 * bare `CcTag` for "Demo" — and a link without a surface of its own (§1.5): the
 * card carries the surface, the link only its outline and the focus ring.
 */
export default function DemoEntryCard() {
  return (
    <div className="cc mb-4 rounded-cc-card bg-cc-surface shadow-cc">
      <Link
        href={DEMO_ROUTE}
        data-testid="demo-entry"
        className="group flex flex-col gap-3 rounded-cc-card border border-cc-information-border p-4 no-underline transition-colors hover:border-cc-information sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <PlayCircle size={24} className="mt-1 shrink-0 text-cc-information" aria-hidden={true} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CcTag>{DEMO_TAG}</CcTag>
              <span data-testid="demo-entry-title" className="truncate cc-text-h2 text-cc-ink">
                {DEMO_PROJECT_TITLE}
              </span>
            </div>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
              {DEMO_LIST_TAGLINE} — {DEMO_SUBJECT}. Click through all seven stages without touching your five free
              analyses; nothing you do in it is saved.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 cc-text-identifier text-cc-ink">
          Open the demo{' '}
          <ArrowRight size={14} className="motion-safe:transition-transform group-hover:translate-x-0.5" aria-hidden={true} />
        </span>
      </Link>
    </div>
  );
}
