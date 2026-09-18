'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { PersonalDataHint } from '@/lib/personal-data-hints';

/**
 * The hint about personal data, and the tick that has to be made before the
 * upload goes on.
 *
 * **The rule this panel is built around: it never claims to have found personal
 * data.** The Terms of Service and the Privacy Policy both say that not
 * uploading other people's data is *"a rule we ask you to keep, not a control
 * we exercise"*, and `tests/terms-duties-guard.spec.ts` fails the build on any
 * sentence that turns it into a claim of control. A panel here that said "we
 * detected personal data" would make both documents false in the same moment it
 * rendered. So every line below is written the other way round: these are
 * *shapes that often indicate* personal data, the product cannot tell whether
 * any of them really is, and it will miss what it has no pattern for. The
 * person reading decides.
 *
 * **Nothing is blocked.** The upload is never refused and nothing is removed.
 * What is asked for is one deliberate act — a checkbox the person has to reach
 * for — so that the decision is theirs and is made while the text is still in
 * their own browser.
 *
 * It is an inline panel rather than a dialog on purpose. A modal would be the
 * third blocking overlay on the upload screen, and the focus trap it would need
 * is exactly the failure the UX register already has findings about. Inline
 * needs no trap: real controls, a real label, a visible focus ring, and Tab
 * walks through it the way it walks through the page.
 */

export const PERSONAL_DATA_HINT_TITLE = 'Some lines look like they may hold personal data';

export const PERSONAL_DATA_HINT_UNREAD_TITLE = 'Nothing has looked inside this file';

export const PERSONAL_DATA_HINT_LEAD =
  'This is a hint, not a check. Clean-Core.io knows a handful of shapes that often indicate personal data — ' +
  'an address, an IBAN, a phone number, an ABAP field that names a person by definition. It cannot tell ' +
  'whether any of them really is personal data, and it has no pattern for most of the ways personal data can ' +
  'be written down, so it will miss things. Read the lines below and decide for yourself.';

export const PERSONAL_DATA_HINT_RULE =
  'The Terms ask you not to upload personal data of third parties. Whether this source keeps that rule is ' +
  'your call — nothing here decides it for you, and nothing is removed or refused.';

export const PERSONAL_DATA_ACK_LINES =
  'I have checked these lines myself and want to upload this anyway.';

export const PERSONAL_DATA_ACK_FILE =
  'I have checked this file myself and want to upload it anyway.';

/** Beyond this the list stops being something a person reads and becomes noise. */
const MAX_LISTED = 25;

export default function PersonalDataHints({
  hints,
  acknowledged,
  ackStale = false,
  onAcknowledge,
  id,
  unreadableNote = null,
}: {
  hints: PersonalDataHint[];
  acknowledged: boolean;
  /**
   * The tick was made for a different set of lines than the ones now shown,
   * so it has been taken back — and the box says so, instead of a checkbox
   * that is silently empty again (UX review of b88c77b, b160d0d08a81).
   */
  ackStale?: boolean;
  onAcknowledge: (next: boolean) => void;
  /** Unique per instance: two of these can stand on one page. */
  id: string;
  /**
   * Why the text could not be read at all — a spreadsheet, say. Said out loud
   * rather than passed over in silence, because "no hints" and "nothing looked"
   * are very different things to show somebody.
   */
  unreadableNote?: string | null;
}) {
  if (hints.length === 0 && !unreadableNote) return null;

  const listed = hints.slice(0, MAX_LISTED);
  const titleId = `${id}-title`;
  const checkboxId = `${id}-ack`;

  return (
    <section
      data-personal-data-hints={id}
      aria-labelledby={titleId}
      className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-2">
            <h3 id={titleId} className="text-base font-bold text-amber-900 tracking-tight">
              {hints.length > 0 ? PERSONAL_DATA_HINT_TITLE : PERSONAL_DATA_HINT_UNREAD_TITLE}
            </h3>
            <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
              {hints.length > 0 ? PERSONAL_DATA_HINT_LEAD : unreadableNote}
            </p>
          </div>

          {listed.length > 0 && (
            <ul data-personal-data-hint-list className="space-y-2">
              {listed.map((hint, index) => (
                <li
                  key={`${hint.kind}-${hint.line}-${index}`}
                  data-personal-data-hint={hint.kind}
                  className="rounded-2xl border border-amber-200 bg-white px-4 py-3"
                >
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-700">
                      Line {hint.line}
                    </span>
                    <code
                      data-personal-data-excerpt
                      className="font-mono text-[11px] text-gray-900 break-all"
                    >
                      {hint.excerpt}
                    </code>
                  </p>
                  <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{hint.why}</p>
                </li>
              ))}
            </ul>
          )}

          {hints.length > listed.length && (
            <p data-personal-data-hint-more className="text-xs font-semibold text-amber-800">
              …and {hints.length - listed.length} more lines of the same kinds. Open the source and read
              them there.
            </p>
          )}

          <p className="text-xs text-amber-900 leading-relaxed">
            {PERSONAL_DATA_HINT_RULE}{' '}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              data-personal-data-terms-link
              className="font-semibold underline decoration-amber-400 underline-offset-2 hover:decoration-amber-700"
            >
              Read the Terms
            </Link>
          </p>

          <label
            htmlFor={checkboxId}
            className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-white p-4 cursor-pointer hover:bg-amber-50"
          >
            <input
              id={checkboxId}
              data-personal-data-ack
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-amber-600 focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
            />
            <span className="text-xs sm:text-sm font-semibold text-gray-900 leading-relaxed">
              {hints.length > 0 ? PERSONAL_DATA_ACK_LINES : PERSONAL_DATA_ACK_FILE}
            </span>
          </label>
          {ackStale && (
            <p data-personal-data-ack-stale className="mt-2 text-xs font-semibold text-amber-900">
              The source changed after you ticked this, so the tick was taken back. Read the lines above again, then tick it again.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
