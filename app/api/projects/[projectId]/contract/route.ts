import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { contractOfProject } from '@/lib/contract-build';
import { generationDirection, generationBinding, offTrackRefusal } from '@/lib/generation-direction';
import type { InputManifest } from '@/lib/input-manifest';
import { sha256Hex } from '@/lib/artefact-digest';

/**
 * The architecture contract of one project, and what may be generated against
 * it — roadmap 8.3.
 *
 * `GET`  → `{ contract, decision }`. The Transformation stage asks this before
 *          it writes a prompt: `decision.track` is `contract.route.chosen`, so
 *          a declared deviation is *applied*, and a blocked contract comes back
 *          as a refusal with the contract's own sentence.
 * `POST` → records which contract a generated stand was computed against.
 *
 * **Why a route rather than a call in the browser.** `buildAbapEvidence`
 * reaches the merged SAP catalog, 4.3 MB of generated JSON — the rule
 * `lib/first-look.ts`, `/api/abcd-classify` and `/api/projects/{id}/findings`
 * all keep. `lib/contract-build.ts` says the second half: the contract needs
 * `evidence.coverage`, which the stored run does not carry, so a contract
 * assembled in the browser from the run document would claim a coverage it
 * never measured.
 *
 * **Why the POST does not take the binding from the caller.** It takes the
 * digest of the generated files and nothing else. The contract is rebuilt here
 * and the *server's* fingerprint is what is written, so a browser cannot record
 * a stand against a contract that was never derived — the whole point of the
 * step is that the generation is bound to the contract rather than to what the
 * page says about it. `generationBinding` is written with the Admin SDK into a
 * field that is **not** on the client-writable allowlist of `firestore.rules`.
 *
 * **The generated code is not evidence.** The binding carries
 * `provenance: 'proposed'`; what is bound is the contract and its inputs, never
 * the model's output.
 */
export const runtime = 'nodejs';

/** The same bound `/api/projects/{id}/findings` sets, for the same reason. */
const MAX_SOURCE_BYTES = 400_000;

/** The field the binding is written to. Server-only: never in the rules allowlist. */
const GENERATION_BINDING_FIELD = 'generationBinding';

function manifestOfRun(run: Record<string, unknown> | null): InputManifest | null {
  const manifest = run?.inputManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as Partial<InputManifest>;
  return typeof m.hash === 'string' && Array.isArray(m.inputs) ? (manifest as InputManifest) : null;
}

async function loadProjectAndRun(projectId: string, uid: string) {
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists || !mayReadProject(snap.data(), uid)) return null;
  const data = snap.data() as Record<string, unknown>;
  let run: Record<string, unknown> | null = null;
  if (typeof data.activeRunId === 'string' && data.activeRunId) {
    const runSnap = await db.collection('projects').doc(projectId).collection('runs').doc(data.activeRunId).get();
    run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
  }
  return { db, data, run };
}

type Authorised = { ok: true; uid: string } | { ok: false; response: NextResponse };

async function authorise(req: NextRequest): Promise<Authorised> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  // The contract is derived from the customer's own code. A token from before
  // the second factor reads neither, here as in Firestore.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      ),
    };
  }
  return { ok: true, uid: decodedToken.uid };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await authorise(req);
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });

    const loaded = await loadProjectAndRun(projectId, auth.uid);
    // One answer for "not there" and "not yours".
    if (!loaded) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const { data, run } = loaded;

    const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        {
          error: `This source is larger than the ${MAX_SOURCE_BYTES} bytes this contract is derived from in one request.`,
          code: 'too-large',
        },
        { status: 413 },
      );
    }

    const built = contractOfProject(data, manifestOfRun(run));
    if (!built.ok && built.code === 'no-source') {
      // Nothing staged is not an empty contract: it is a project with no
      // source, and the caller is told that rather than shown a clean one.
      return NextResponse.json(
        { error: 'No source is staged on this project, so no contract could be derived.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (!built.ok) {
      return NextResponse.json({ contract: null, decision: offTrackRefusal(built.decided || 'that decision') });
    }
    return NextResponse.json({ contract: built.contract, decision: generationDirection(built.contract) });
  } catch (err: unknown) {
    logger.error('project contract read failed', {
      route: 'api/projects/contract',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not derive the contract of this project.' }, { status: 500 });
  }
}

/**
 * Record which contract a generated stand was computed against.
 *
 * Body: `{ generatedCode: string }` — the stored package, whose digest is what
 * the binding names. Nothing else is read from the caller.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await authorise(req);
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });

    const loaded = await loadProjectAndRun(projectId, auth.uid);
    if (!loaded) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const { db, data, run } = loaded;
    // Reading is a share; recording what was generated is not.
    if (data.userId !== auth.uid) {
      // An invited reader gets the stranger's answer, word for word, as on every
      // other write under app/api/projects (tests/project-access-matrix.spec.ts):
      // a reader reads, and a distinct 403 would be a second way to say so.
      return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { generatedCode?: unknown };
    const code = typeof body.generatedCode === 'string' ? body.generatedCode : '';
    if (!code.trim()) {
      return NextResponse.json(
        { error: 'No generated package was named, so there is nothing to bind.', code: 'no-code' },
        { status: 400 },
      );
    }

    const built = contractOfProject(data, manifestOfRun(run));
    if (!built.ok) {
      return NextResponse.json(
        {
          error:
            built.code === 'no-source'
              ? 'No source is staged on this project, so no contract could be derived to bind against.'
              : 'This project is decided for a target this stage does not generate, so nothing is bound.',
          code: built.code,
        },
        { status: 409 },
      );
    }
    const decision = generationDirection(built.contract);
    if (!decision.ok) {
      // A refusal that can still be recorded is not a refusal — the reason
      // `contractManifestInput()` throws on a blocked contract.
      return NextResponse.json({ error: decision.sentence, code: decision.code }, { status: 409 });
    }

    const binding = generationBinding(built.contract, { codeSha256: sha256Hex(code) });
    await db.collection('projects').doc(projectId).set({ [GENERATION_BINDING_FIELD]: binding }, { merge: true });
    return NextResponse.json({ binding });
  } catch (err: unknown) {
    logger.error('generation binding write failed', {
      route: 'api/projects/contract',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not record the contract this generation followed.' }, { status: 500 });
  }
}
