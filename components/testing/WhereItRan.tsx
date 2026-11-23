import React from 'react';
import Link from 'next/link';
import { FlaskConical, Lock, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLACE_WORDS, type TestPlace } from '@/lib/testing-answer';

/**
 * The three places a test can run, side by side with the active one marked (ADR-131 (4), mock-up S3, S5): here —
 * Clean-Core.io's isolated runner against SAP mocks; your SAP system — imported or confirmed (ADR-075); your tenant from
 * here — locked, its connection check in Settings (S9). Named the same everywhere, so "passed" never stands without
 * where.
 */
export default function WhereItRan({
  abap,
  status,
  tenantLocked,
}: {
  abap: boolean;
  /** What the active place holds: "22 passed", "Nothing recorded yet". */
  status: React.ReactNode;
  tenantLocked: boolean;
}) {
  const places: Array<{ key: TestPlace; on: boolean; icon: React.ReactNode; text: string; state: React.ReactNode }> = [
    {
      key: 'here',
      on: !abap,
      icon: <FlaskConical size={16} aria-hidden={true} />,
      text: abap
        ? 'Runs JavaScript and TypeScript against SAP mocks. It cannot run an ABAP Unit class, so nothing of this route runs here.'
        : 'Runs the suite against SAP mocks, in a sandbox with no network. A pass says the logic does what the test expects, not that it works in your system.',
      state: abap ? 'Not for this route' : status,
    },
    {
      key: 'your-system',
      on: abap,
      icon: <Server size={16} aria-hidden={true} />,
      text: abap
        ? 'Where ABAP Unit runs: your development or test system. You bring the result back: the result file, or your confirmation.'
        : 'Not run there. To test against your system, take the suite into your own CAP project and run it there.',
      state: abap ? status : 'Not run there',
    },
    {
      key: 'tenant',
      on: false,
      icon: <Lock size={16} aria-hidden={true} />,
      text: tenantLocked
        ? 'Locked: running tests on a connected tenant opens only when the isolated live runner has passed its review.'
        : 'Running tests on a connected tenant.',
      state: tenantLocked ? 'Locked' : null,
    },
  ];
  return (
    <ul data-test-places="" className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-[900px]:grid-cols-1">
      {places.map((p) => (
        <li
          key={p.key}
          data-test-place={p.key}
          data-test-place-active={p.on ? '' : undefined}
          className={cn(
            'flex min-w-0 flex-col gap-2 rounded-cc-row border px-4 py-3',
            p.on ? 'border-cc-ink bg-cc-surface' : 'border-cc-line bg-cc-surface-muted',
          )}
        >
          <span className={cn('flex items-center gap-2 cc-text-cell font-semibold', p.on ? 'text-cc-ink' : 'text-cc-ink-muted')}>
            {p.icon}
            {PLACE_WORDS[p.key]}
          </span>
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            {p.text}
            {p.key === 'tenant' ? (
              <>
                {' '}The connection check is in{' '}
                <Link href="/settings#sap-test-system" className="font-semibold text-cc-information hover:underline">
                  Settings, Your SAP test system
                </Link>
                .
              </>
            ) : null}
          </p>
          {p.state ? <span className="mt-auto cc-text-meta font-semibold text-cc-ink">{p.state}</span> : null}
        </li>
      ))}
    </ul>
  );
}
