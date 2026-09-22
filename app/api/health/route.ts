import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSigningKeypair } from '@/lib/audit-signing-keypair';
import { singleFlight } from '@/lib/single-flight';

/**
 * Liveness / readiness probe for Cloud Run health checks and uptime monitoring.
 *
 * Shallow (default): process is up + required signing/AI config present — cheap,
 *   safe to poll frequently. Returns 200 when healthy, 503 when misconfigured.
 * Deep (`?deep=1`): additionally pings Firestore. Use sparingly (costs a read).
 *
 * The response is intentionally minimal (no per-check booleans) so an
 * unauthenticated caller cannot learn which secret is missing.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * How often the deep probe may actually reach Firestore, and why this is not
 * `assertRateLimit`.
 *
 * `?deep=1` takes no token and cost one Firestore read *per call*, so anybody
 * could drive reads on this project for as long as they cared to (security
 * audit of b88c77b). The house limiter would not have closed that: it runs a
 * Firestore transaction of its own, so a refused call would cost the same read
 * it was refusing. What bounds it is a cooldown in the instance — the ping runs
 * at most once every ten seconds and every call in between is answered from the
 * last verdict, so a flood costs six reads a minute per instance instead of one
 * per request. Ten seconds is shorter than any probe interval we run
 * (`scripts/qa/smoke.mjs` polls far slower), so a real Firestore outage is still
 * reported on the next poll rather than the one after it.
 */
const DEEP_PROBE_COOLDOWN_MS = 10_000;
let lastDeepProbe: { at: number; ok: boolean } = { at: 0, ok: true };

/**
 * The probe in flight, shared by everyone who asks while it runs.
 *
 * The cooldown alone did not bound what it claimed to. `lastDeepProbe.at` is
 * written *after* the read returns, so a hundred requests arriving in the same
 * moment all read a stale timestamp, all take the else branch, and all issue
 * their own Firestore read — the cooldown bounded a serial flood and left the
 * concurrent one untouched, which is the flood that matters (QA review of
 * 7fea4f4, acceptance "the deep probe's cooldown should bound unauthenticated
 * Firestore reads": not met).
 *
 * So the first caller starts the read and everyone arriving while it is open
 * awaits the same promise. One read per cooldown window, under any concurrency.
 * Module scope is per instance, like the cooldown itself: this bounds one
 * instance, not the service, and that is all it ever claimed.
 *
 * The mechanism lives in `lib/single-flight.ts` rather than in three lines here,
 * and the reason is the test: a guard that reads those three lines out of this
 * file cannot fail for the reason it exists — a regression that keeps the
 * characters and still performs two reads passes it (QA review of 9e408888bfec,
 * 78b84b92aa49). The helper can be driven with a deferred call from a spec;
 * this handler cannot.
 */
const deepProbe = singleFlight<boolean>();

async function probeFirestore(): Promise<boolean> {
  let ok = true;
  try {
    const { db } = await getAdminDb();
    await db.collection('_health').doc('ping').get();
  } catch {
    ok = false;
  }
  lastDeepProbe = { at: Date.now(), ok };
  return ok;
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';

  const signingKeyOk = !!process.env.AUDIT_SIGNING_KEY;
  const geminiOk = !!process.env.GEMINI_API_KEY;

  // The asymmetric half of the trust chain, when there is one.
  //
  // Ed25519 is optional by design: without `AUDIT_SIGNING_PRIVATE_KEY` packs
  // carry the HMAC signature only, and that is a supported state, so an absent
  // key is not a fault. "Set but unusable" is a different thing entirely —
  // `lib/audit-signing-keypair.ts` refuses to throw on import, so a malformed
  // key, or an RSA key where an Ed25519 one belongs, degrades to HMAC-only
  // signing with one line in the log and nothing else. For a product whose
  // promise is a signature an outsider can check, that is precisely the failure
  // nobody notices. Asked here so the deep probe turns red instead.
  const asymmetricConfigured = !!process.env.AUDIT_SIGNING_PRIVATE_KEY?.trim();
  const asymmetricOk = !asymmetricConfigured || getSigningKeypair() !== null;

  let firestoreOk = true;
  if (deep) {
    if (Date.now() - lastDeepProbe.at < DEEP_PROBE_COOLDOWN_MS) {
      firestoreOk = lastDeepProbe.ok;
    } else {
      // The slot is claimed before the read is awaited, not after it — that is
      // the whole point, and it is what `singleFlight` guarantees. Everyone who
      // arrives while the read is open awaits the same promise and costs
      // nothing.
      firestoreOk = await deepProbe(probeFirestore);
    }
  }

  const healthy = signingKeyOk && geminiOk && asymmetricOk && firestoreOk;

  // The short commit the revision was built from (set by deploy.yml). The
  // repository is public, so this reveals nothing new — it lets the QA smoke
  // check tell the new revision from the one it replaced, which a version string
  // cannot when a fix ships without a version bump.
  const commit = /^[0-9a-f]{40}$/.test(process.env.COMMIT_SHA || '') ? process.env.COMMIT_SHA!.slice(0, 12) : null;

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', version: APP_VERSION, commit, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
