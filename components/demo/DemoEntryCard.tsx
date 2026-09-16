import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
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
 */
export default function DemoEntryCard() {
  return (
    <Link
      href={DEMO_ROUTE}
      data-testid="demo-entry"
      className="group mb-4 flex flex-col gap-3 rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-3 min-w-0">
        <PlayCircle className="mt-0.5 h-6 w-6 shrink-0 text-blue-700" aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-700">
              {DEMO_TAG}
            </span>
            <span data-testid="demo-entry-title" className="truncate text-base font-black text-blue-950">
              {DEMO_PROJECT_TITLE}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-blue-900">
            {DEMO_LIST_TAGLINE} — {DEMO_SUBJECT}. Click through all seven stages without touching your five free
            analyses; nothing you do in it is saved.
          </p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-black uppercase tracking-widest text-blue-800">
        Open the demo <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
