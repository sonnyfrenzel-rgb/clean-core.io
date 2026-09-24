import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  assertMfaSatisfied,
  assertAccountActive,
  getAdminDb,
  loadGeminiApiKey,
  QuotaError,
  updateExistingProfile,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { MODEL_STAGES, isModelStage, modelStagesOf, type ModelStage } from '@/lib/model-stages';

/**
 * The per-stage model switch, and whether there is a key to switch on.
 *
 * Roadmap 1.2: *"Modellstufen einzeln zuschaltbar"*. Two questions a screen has
 * to answer before it offers to generate anything, and neither can be answered
 * in the browser:
 *
 *   - `stages` — which of the five model stages this account has switched on.
 *     Stored on `users/{uid}.modelStages`, written **only here** through the
 *     Admin SDK. `firestore.rules` limits a client's own writes to
 *     `userClientUpdateKeys()`, which this field is deliberately not in, so the
 *     switch cannot be forged from a browser and no rules change was needed to
 *     introduce it. The document is readable by its owner, so a screen that has
 *     the profile already does not have to ask again.
 *   - `keyAvailable` — whether a Gemini key exists at all for this account:
 *     the account's own (BYOK) or the community key in the server environment.
 *     The browser cannot see either, and without this a screen would offer a
 *     button that can only fail. The key itself never leaves the server; only
 *     the boolean and which of the two it is.
 *
 * `loadGeminiApiKey` is the same lookup `/api/gemini` performs, on purpose: a
 * cheaper proxy (`users.byokConfigured`) can say yes while the stored secret is
 * gone, and a screen that promises what the proxy refuses is the defect this
 * step exists to remove.
 */

export const dynamic = 'force-dynamic';

interface StageAnswer {
  stages: Record<ModelStage, boolean>;
  keyAvailable: boolean;
  /** Where a key would come from. `null` when there is none. */
  keySource: 'byok' | 'community' | null;
}

async function answerFor(uid: string): Promise<StageAnswer> {
  const { db } = await getAdminDb();
  const snap = await db.collection('users').doc(uid).get();
  const stages = modelStagesOf(snap.exists ? (snap.data() as { modelStages?: Record<string, boolean> }) : null);

  const byokKey = await loadGeminiApiKey(uid);
  const keySource: StageAnswer['keySource'] = byokKey
    ? 'byok'
    : process.env.GEMINI_API_KEY
      ? 'community'
      : null;

  return { stages, keyAvailable: keySource !== null, keySource };
}

export async function GET(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    await assertMfaSatisfied(req, decodedToken);
    // The hard-suspend check the POST below also makes. It was missing here, so
    // a suspended account still learned whether a key is available and which of
    // the five stages are switched on — and `answerFor` decrypts that account's
    // own BYOK key to find out (security audit of b88c77b). Not
    // `requireCurrentTerms`: § 10.3 lets somebody carry on under the Terms they
    // accepted, and the write is where that is decided.
    await assertAccountActive(decodedToken.uid);
    return NextResponse.json(await answerFor(decodedToken.uid));
  } catch (err: unknown) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error('model-stages read failed', { route: 'api/model-stages', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the model settings.' }, { status: 500 });
  }
}

/**
 * POST /api/model-stages
 *
 * Body: `{ stages: { design: false, testing: true, … } }` — only the named
 * stages move. An unknown key is a 400 rather than a silent no-op: a settings
 * screen that misspells a stage would otherwise report success and change
 * nothing, which is the kind of failure nobody finds for months.
 */
export async function POST(req: NextRequest) {
  let uid = '';
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    uid = decodedToken.uid;

    await assertMfaSatisfied(req, decodedToken);
    await assertAccountActive(uid, {
      requireCurrentTerms: true,
      isAdminClaim: decodedToken.admin === true,
    });
    await assertRateLimit(`model_stages:${uid}:${getClientIp(req)}`, 60, 60 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const requested = (body as { stages?: unknown }).stages;
    if (!requested || typeof requested !== 'object' || Array.isArray(requested)) {
      return NextResponse.json(
        { error: `Missing required field: stages. Expected an object keyed by ${MODEL_STAGES.join(', ')}.` },
        { status: 400 },
      );
    }

    const update: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(requested as Record<string, unknown>)) {
      if (!isModelStage(key)) {
        return NextResponse.json({ error: `Unknown model stage: ${key}.` }, { status: 400 });
      }
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `The switch for ${key} must be true or false.` }, { status: 400 });
      }
      update[key] = value;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No stage was named.' }, { status: 400 });
    }

    const { db, FieldValue } = await getAdminDb();
    // `update` with one field path per stage: the same merge as before into
    // `modelStages`, but an account erased in the meantime is not recreated
    // (QA full review of a12774cd2b7f).
    const fields: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const [stage, on] of Object.entries(update)) fields[`modelStages.${stage}`] = on;
    await updateExistingProfile(uid, fields, { db });

    return NextResponse.json({ ok: true, ...(await answerFor(uid)) });
  } catch (err: unknown) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error('model-stages write failed', { route: 'api/model-stages', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not save the model settings.' }, { status: 500 });
  }
}
