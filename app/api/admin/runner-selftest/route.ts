import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, assertAdminStepUp } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';
import { callIsolatedRunner, readRunnerConfig } from '@/lib/test-runner-client';
import { fetchMetadataIdToken } from '@/lib/google-id-token';
import {
  RUNNER_SELFTEST_SUITE,
  RUNNER_SELFTEST_FILE,
  evaluateSelftest,
  evaluateNetworkProbe,
  combineSelftest,
} from '@/lib/runner-selftest';

/**
 * The authorized negative test of the isolated runners — roadmap 8.9.
 *
 * Administrators only, with a fresh step-up: this route makes the app send a
 * fixed probe suite (`lib/runner-selftest.ts`) to the mock runner and asks both
 * runners for their fixed network probe. It takes no code, no host and no path
 * from the caller — only which runners to ask — so it cannot be used to run
 * anything but the test.
 *
 * The runners accept traffic only from the app (`ingress=internal`,
 * `run.invoker`), which is why the test travels through the app rather than
 * from the operator's machine: the path it measures is the path generated code
 * takes. The live runner is asked for its network probe only; a sandbox run on
 * it needs a capability minted for a connected tenant, and it runs the same
 * image and the same sandbox as the mock runner, which the suite covers.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NETWORK_TIMEOUT_MS = 30_000;

async function networkProbe(url: string): Promise<{ ok: boolean; held: boolean; reason: string | null; detail: unknown }> {
  try {
    const token = await fetchMetadataIdToken(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    const res = await fetch(`${url}/selftest-network`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, held: false, reason: `HTTP ${res.status}`, detail: `HTTP ${res.status}` };
    const body: unknown = await res.json();
    const verdict = evaluateNetworkProbe(body);
    return { ok: true, held: verdict.held, reason: verdict.reason, detail: body };
  } catch (err: unknown) {
    const detail = errMessage(err).slice(0, 200);
    return { ok: false, held: false, reason: detail, detail };
  }
}

export async function POST(req: NextRequest) {
  try {
    const decodedAdmin = await verifyAdminRequest(req);
    if (!decodedAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 403 });
    }
    try {
      await assertAdminStepUp(req, decodedAdmin);
    } catch (stepUpErr: unknown) {
      const q = stepUpErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Recent administrator step-up verification required.' },
        { status: q?.status || 403 },
      );
    }

    const cfg = readRunnerConfig();
    if (!cfg.runnerUrl) {
      return NextResponse.json(
        { error: 'The isolated test runner is not configured on this deployment (RUNNER_URL), so there is nothing to test.' },
        { status: 409 },
      );
    }

    const sandbox = await callIsolatedRunner(
      new URL(cfg.runnerUrl).origin,
      { files: [], suiteCode: RUNNER_SELFTEST_SUITE, patterns: [], mode: 'mock' },
      { idToken: (audience) => fetchMetadataIdToken(audience) },
    );
    const sandboxVerdict = sandbox.ok
      ? evaluateSelftest(sandbox.report)
      : { held: false, probes: [], reason: `The runner did not answer: ${sandbox.reason}` };

    const mockNetwork = await networkProbe(new URL(cfg.runnerUrl).origin);
    const liveNetwork = cfg.runnerLiveUrl ? await networkProbe(new URL(cfg.runnerLiveUrl).origin) : null;

    const { status, held } = combineSelftest({ sandbox: sandboxVerdict, mockNetwork, liveNetwork });
    logger.info('runner selftest', {
      route: 'api/admin/runner-selftest',
      status,
      sandbox: sandboxVerdict.held,
      mockNetwork: mockNetwork.held,
      liveNetwork: liveNetwork ? liveNetwork.held : 'not-configured',
    });
    return NextResponse.json({
      held,
      status,
      incomplete:
        status === 'incomplete'
          ? 'The live runner is not configured on this deployment (RUNNER_LIVE_URL), so its network probe was not run. Without it the test is not a pass.'
          : null,
      file: RUNNER_SELFTEST_FILE,
      // Self-reported by the runner (K_REVISION); the app has no independent value to compare it with.
      sandbox: { ...sandboxVerdict, revision: sandbox.ok ? sandbox.report.revision : null },
      network: { mock: mockNetwork, live: liveNetwork },
      notProbed:
        'The metadata address: every Cloud Run container reaches its own metadata server. The protection there is that the runner service account has no roles — check it with gcloud (SECURITY.md §7).',
    });
  } catch (err: unknown) {
    logger.error('runner selftest failed', { route: 'api/admin/runner-selftest', error: errMessage(err) });
    return NextResponse.json({ error: 'The runner selftest could not be completed.' }, { status: 500 });
  }
}
