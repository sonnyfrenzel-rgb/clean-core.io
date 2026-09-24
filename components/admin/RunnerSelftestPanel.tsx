'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * The runner self-test, one click — roadmap 8.9.
 *
 * `POST /api/admin/runner-selftest` sends the fixed probe suite of
 * `lib/runner-selftest.ts` to the isolated runners and says whether the
 * boundary held. It is guarded by `assertAdminStepUp`, like every other admin
 * action on this console, and it is called the same way they call theirs: the
 * current ID token, nothing else. There is no in-place re-authentication here
 * because there is none anywhere on the console: a refused step-up is answered
 * with the one recovery the product already has for it — sign out, sign in
 * again with the authenticator code (settings page, approve-tenant page) — and
 * then run it again within five minutes.
 *
 * The one rule this panel exists to keep: `incomplete` is not a pass. It is
 * drawn as a warning with the reason beside it, never in the colour or the
 * words of `held`.
 */

type Status = 'held' | 'not-held' | 'incomplete';

interface NetworkPart {
  ok: boolean;
  held: boolean;
  reason: string | null;
  detail: unknown;
}

interface SelftestResponse {
  held: boolean;
  status: Status;
  incomplete: string | null;
  file?: string;
  sandbox: {
    held: boolean;
    probes: { probe: string; held: boolean }[];
    reason: string | null;
    revision: string | null;
  };
  network: { mock: NetworkPart; live: NetworkPart | null };
  notProbed?: string;
}

type Failure = {
  headline: string;
  message: string;
  next: 'sign-in-again' | 'enable-mfa' | 'retry' | 'none';
};

type Outcome =
  | { kind: 'result'; data: SelftestResponse; at: Date }
  | { kind: 'failure'; failure: Failure; at: Date };

const STATUS_WORDS: Record<Status, { state: 'success' | 'error' | 'warning'; headline: string; lead: string }> = {
  held: {
    state: 'success',
    headline: 'Held.',
    lead: 'Every probe in the sandbox and on both runners failed to reach its target.',
  },
  'not-held': {
    state: 'error',
    headline: 'Not held.',
    lead: 'At least one probe reached its target, or a runner did not answer in a way that proves anything. Treat the boundary as open until this is explained.',
  },
  incomplete: {
    state: 'warning',
    headline: 'Incomplete — this is not a pass.',
    lead: 'Part of the test could not run, so nothing is proven about that part.',
  },
};

function describeFailure(status: number, error: string | undefined): Failure {
  const message = error || `The server answered HTTP ${status}.`;
  if (status === 403 && /enable mfa/i.test(message)) {
    return {
      headline: 'Two-factor authentication is not set up on this account.',
      message: `${message} Open Settings, enable the authenticator, then sign out, sign in again with the code and run the test within five minutes.`,
      next: 'enable-mfa',
    };
  }
  if (status === 403 && /admin privileges/i.test(message)) {
    return {
      headline: 'This account is not an administrator.',
      message: `${message} Sign in with the administrator account.`,
      next: 'sign-in-again',
    };
  }
  if (status === 403 || status === 401) {
    return {
      headline: 'A fresh sign-in is needed.',
      message: `${message} The test needs a sign-in with your authenticator code from the last five minutes: sign out, sign in again, and run it right away.`,
      next: 'sign-in-again',
    };
  }
  if (status === 409) {
    return { headline: 'Nothing to test on this deployment.', message, next: 'none' };
  }
  if (status >= 500) {
    return {
      headline: 'The test could not be completed.',
      message: `${message} Nothing was proven either way. Try again; if it repeats, read the Cloud Run log of this service for "runner selftest failed".`,
      next: 'retry',
    };
  }
  return { headline: 'The test was refused.', message, next: 'retry' };
}

/** A runner's own `probes` list, as far as it is readable. */
function runnerProbes(detail: unknown): { target: string; reached: unknown }[] | null {
  const probes = detail && typeof detail === 'object' ? (detail as { probes?: unknown }).probes : undefined;
  if (!Array.isArray(probes)) return null;
  return probes.map((p) => ({
    target: p && typeof p === 'object' && typeof (p as { target?: unknown }).target === 'string'
      ? (p as { target: string }).target
      : '(no target named)',
    reached: p && typeof p === 'object' ? (p as { reached?: unknown }).reached : undefined,
  }));
}

function runnerRevision(detail: unknown): string | null {
  const r = detail && typeof detail === 'object' ? (detail as { revision?: unknown }).revision : undefined;
  return typeof r === 'string' && r ? r : null;
}

function ReachedCell({ reached }: { reached: unknown }) {
  if (reached === false) return <span className="text-cc-success">reached: false</span>;
  if (reached === true) return <span className="text-cc-error font-semibold">reached: true</span>;
  return <span className="text-cc-error font-semibold">reached: not stated</span>;
}

function Revision({ value }: { value: string | null }) {
  return (
    <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted" data-selftest-revision="">
      Runner revision:{' '}
      <code className="font-cc-mono text-cc-ink">{value ?? 'not reported'}</code>{' '}
      (self-reported by the runner; the app has no independent value to compare it with)
    </p>
  );
}

function NetworkBlock({ name, part }: { name: string; part: NetworkPart | null }) {
  if (!part) {
    return (
      <div data-selftest-network={name} data-selftest-part-held="not-run">
        <h4 className="m-0 text-[13px] font-bold text-cc-ink">{name} runner — network probe</h4>
        <p className="m-0 mt-1 text-[13px] font-medium text-cc-warning">
          Not run: this runner is not configured on this deployment.
        </p>
      </div>
    );
  }
  const probes = runnerProbes(part.detail);
  return (
    <div data-selftest-network={name} data-selftest-part-held={part.held ? 'held' : 'not-held'}>
      <h4 className="m-0 text-[13px] font-bold text-cc-ink">
        {name} runner — network probe:{' '}
        <span className={part.held ? 'text-cc-success' : 'text-cc-error'}>{part.held ? 'held' : 'not held'}</span>
      </h4>
      {!part.ok && (
        <p className="m-0 mt-1 text-[13px] font-medium text-cc-error">
          The runner did not answer ({part.reason || 'no reason given'}). Check that the runner service is up; an
          unanswered probe proves nothing.
        </p>
      )}
      {part.ok && part.reason && <p className="m-0 mt-1 text-[13px] font-medium text-cc-error">{part.reason}</p>}
      {probes && (
        <ul className="m-0 mt-1 list-none p-0 text-[13px] font-medium text-cc-ink">
          {probes.map((p, i) => (
            <li key={`${p.target}-${i}`} data-selftest-probe={p.target} className="flex flex-wrap gap-x-2">
              <span>{p.target}</span>
              <ReachedCell reached={p.reached} />
            </li>
          ))}
        </ul>
      )}
      {part.ok && <Revision value={runnerRevision(part.detail)} />}
    </div>
  );
}

export default function RunnerSelftestPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const user = getAuth()?.currentUser;
      if (!user) {
        setOutcome({
          kind: 'failure',
          failure: { headline: 'Not signed in.', message: 'Sign in again to run the test.', next: 'sign-in-again' },
          at: new Date(),
        });
        return;
      }
      const token = await user.getIdToken();
      let res: Response;
      try {
        res = await fetch('/api/admin/runner-selftest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: '{}',
        });
      } catch {
        setOutcome({
          kind: 'failure',
          failure: {
            headline: 'The app did not answer.',
            message: 'The request never got a response — the connection dropped or the service is not reachable. Nothing was proven. Check your connection and try again.',
            next: 'retry',
          },
          at: new Date(),
        });
        return;
      }
      const data = (await res.json().catch(() => null)) as (SelftestResponse & { error?: string }) | null;
      if (!res.ok) {
        setOutcome({ kind: 'failure', failure: describeFailure(res.status, data?.error), at: new Date() });
        return;
      }
      if (!data || (data.status !== 'held' && data.status !== 'not-held' && data.status !== 'incomplete')) {
        setOutcome({
          kind: 'failure',
          failure: {
            headline: 'The answer could not be read.',
            message: 'The server answered without a recognisable status. Nothing was proven. Try again.',
            next: 'retry',
          },
          at: new Date(),
        });
        return;
      }
      setOutcome({ kind: 'result', data, at: new Date() });
    } catch (err) {
      setOutcome({
        kind: 'failure',
        failure: {
          headline: 'The test could not be started.',
          message: err instanceof Error ? err.message : 'Unknown error.',
          next: 'retry',
        },
        at: new Date(),
      });
    } finally {
      setBusy(false);
    }
  };

  const signInAgain = async () => {
    await signOut(getAuth());
    router.push('/?auth=signin');
  };

  const timestamp = outcome ? outcome.at.toLocaleString() : '';

  return (
    <div className="cc" data-runner-selftest="">
      <CcCard
        title="Runner self-test"
        actions={
          <CcButton
            variant="primary"
            onClick={run}
            disabled={busy}
            aria-busy={busy}
            data-runner-selftest-run=""
          >
            {busy ? 'Running…' : 'Run self-test'}
          </CcButton>
        }
      >
        <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          The negative test of the isolated test runners: a fixed probe suite tries to read files and secrets and to
          open connections from inside the sandbox, and each runner tries a few fixed network destinations. It passes
          only if every attempt fails. It needs a sign-in with your authenticator code from the last five minutes.
          It takes up to a minute.
        </p>

        <div aria-live="polite" aria-atomic="false" className="mt-3 space-y-3" data-runner-selftest-output="">
          {busy && (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted" role="status">
              Running the self-test on the runners…
            </p>
          )}

          {outcome?.kind === 'failure' && (
            <div data-selftest-failure={outcome.failure.next}>
              <CcMessageStrip
                state="error"
                headline={outcome.failure.headline}
                announce
                actions={
                  outcome.failure.next === 'sign-in-again' ? (
                    <CcButton variant="secondary" onClick={signInAgain}>
                      Sign out and sign in again
                    </CcButton>
                  ) : outcome.failure.next === 'enable-mfa' ? (
                    <CcButton variant="secondary" onClick={() => router.push('/settings')}>
                      Open settings
                    </CcButton>
                  ) : outcome.failure.next === 'retry' ? (
                    <CcButton variant="secondary" onClick={run} disabled={busy}>
                      Try again
                    </CcButton>
                  ) : undefined
                }
              >
                {outcome.failure.message}
              </CcMessageStrip>
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">Attempted {timestamp}</p>
            </div>
          )}

          {outcome?.kind === 'result' && (
            <div className="space-y-3" data-selftest-status={outcome.data.status}>
              <CcMessageStrip
                state={STATUS_WORDS[outcome.data.status].state}
                headline={STATUS_WORDS[outcome.data.status].headline}
                announce
              >
                {STATUS_WORDS[outcome.data.status].lead}
                {outcome.data.status === 'incomplete' && outcome.data.incomplete ? (
                  <span data-selftest-incomplete-reason=""> {outcome.data.incomplete}</span>
                ) : null}
              </CcMessageStrip>
              <p className="m-0 text-[12px] font-medium text-cc-ink-muted" data-selftest-timestamp="">
                Result received {timestamp}
              </p>

              <div data-selftest-sandbox="" data-selftest-part-held={outcome.data.sandbox.held ? 'held' : 'not-held'}>
                <h4 className="m-0 text-[13px] font-bold text-cc-ink">
                  Sandbox (mock runner):{' '}
                  <span className={outcome.data.sandbox.held ? 'text-cc-success' : 'text-cc-error'}>
                    {outcome.data.sandbox.held ? 'held' : 'not held'}
                  </span>
                </h4>
                {outcome.data.sandbox.reason && (
                  <p className="m-0 mt-1 text-[13px] font-medium text-cc-error">{outcome.data.sandbox.reason}</p>
                )}
                {outcome.data.sandbox.probes.length > 0 && (
                  <ul className="m-0 mt-1 list-none p-0 text-[13px] font-medium text-cc-ink">
                    {outcome.data.sandbox.probes.map((p) => (
                      <li key={p.probe} data-selftest-probe={p.probe} className="flex flex-wrap gap-x-2">
                        <span>{p.probe}</span>
                        {p.held ? (
                          <span className="text-cc-success">reached: false</span>
                        ) : (
                          <span className="text-cc-error font-semibold">reached: true or not proven</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <Revision value={outcome.data.sandbox.revision} />
              </div>

              <NetworkBlock name="Mock" part={outcome.data.network.mock} />
              <NetworkBlock name="Live" part={outcome.data.network.live} />

              {outcome.data.notProbed && (
                <p className="m-0 text-[12px] font-medium text-cc-ink-muted">Not probed: {outcome.data.notProbed}</p>
              )}
            </div>
          )}
        </div>
      </CcCard>
    </div>
  );
}
