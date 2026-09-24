import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { contractOfProject } from '@/lib/contract-build';
import { generationDirection, generationBinding, offTrackRefusal } from '@/lib/generation-direction';
import type { InputManifest } from '@/lib/input-manifest';
import { sha256Hex } from '@/lib/artefact-digest';
import { checkGeneratedPackage, generationInputsOf, generationRevision } from '@/lib/generation-revision';
import type { DocumentReference, Timestamp, Transaction } from 'firebase-admin/firestore';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * The architecture contract of one project, and what may be generated against
 * it — roadmap 8.3.
 *
 * `GET`  → `{ contract, decision, generation }`. The Transformation stage asks
 *          this before it writes a prompt: `decision.track` is
 *          `contract.route.chosen`, so a declared deviation is *applied*, and a
 *          blocked contract comes back as a refusal with the contract's own
 *          sentence. `generation` (roadmap 3.0.11) is the pre-generation token
 *          and the very inputs it covers — the prompt is built from these, not
 *          from what the page loaded earlier.
 * `POST` → stores a generated stand: code, test suite, status and the binding
 *          to the contract it was computed against, in one transaction, only if
 *          the project is still where the token says it was.
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

/** The bound `firestore.rules` sets on a browser-written `generatedCode`, kept for the server's write. */
const MAX_PACKAGE_CHARS = 1_000_000;

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
  // When the project was last written, as this read saw it: the POST writes its
  // binding only if the project is still at this point (compare-and-swap).
  const readAt: Timestamp | undefined = snap.updateTime;
  return { db, data, run, readAt };
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
  // Both methods rebuild the contract, which runs the catalog-backed engine over
  // the source: one budget per account, asked before any project is read.
  try {
    await assertRateLimit(`project-contract:${decodedToken.uid}`, 240, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
    };
  }
  // A suspended account neither reads nor records a contract, as in Firestore.
  const inactive = await refuseInactiveAccount(decodedToken.uid);
  if (inactive) return { ok: false, response: inactive };
  return { ok: true, uid: decodedToken.uid };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await authorise(req);
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });

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
    const decision = generationDirection(built.contract);
    return NextResponse.json({
      contract: built.contract,
      decision,
      // Roadmap 3.0.11: only a generation that may run gets a token.
      generation: decision.ok
        ? { token: generationRevision(data, built.contract.fingerprint), inputs: generationInputsOf(data) }
        : null,
    });
  } catch (err: unknown) {
    logger.error('project contract read failed', {
      route: 'api/projects/contract',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not derive the contract of this project.' }, { status: 500 });
  }
}

/**
 * Store a generated stand — roadmap 8.3, made server-authoritative by 3.0.11.
 *
 * Body: `{ generatedCode, testSuite, expectedContractFingerprint, generationToken }`.
 * `generatedCode` is the stored package (a JSON file list); the binding names
 * its digest. The contract, the binding and the check of the package are the
 * server's; the caller names only what it generated and the state it generated
 * from.
 *
 * Before 3.0.11 this wrote the binding alone and the page wrote code, suite and
 * status afterwards, unconditionally. Two tabs interleaving stored one tab's code
 * under the other's binding, and code built from a design that had since been
 * replaced overwrote the newer design's stand (QA full review of 81810c8026e0,
 * `e649177b3894`, `c42de15e9c75`). Now all four fields land in one transaction,
 * or none does.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await authorise(req);
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });

    const loaded = await loadProjectAndRun(projectId, auth.uid);
    if (!loaded) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const { db, data, run, readAt } = loaded;
    // Reading is a share; recording what was generated is not.
    if (data.userId !== auth.uid) {
      // An invited reader gets the stranger's answer, word for word, as on every
      // other write under app/api/projects (tests/project-access-matrix.spec.ts):
      // a reader reads, and a distinct 403 would be a second way to say so.
      return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      generatedCode?: unknown;
      testSuite?: unknown;
      expectedContractFingerprint?: unknown;
      generationToken?: unknown;
    };
    const code = typeof body.generatedCode === 'string' ? body.generatedCode : '';
    if (!code.trim()) {
      return NextResponse.json(
        { error: 'No generated package was named, so there is nothing to store.', code: 'no-code' },
        { status: 400 },
      );
    }
    if (code.length >= MAX_PACKAGE_CHARS) {
      return NextResponse.json(
        {
          error: `The generated package is larger than the ${MAX_PACKAGE_CHARS} characters a project stores.`,
          code: 'too-large',
        },
        { status: 413 },
      );
    }
    // The contract the stand was generated from, as the page read it before the
    // model call. The binding is the server's rebuild, so it is written only if
    // that rebuild is still the contract the page generated against: a contract
    // that moved while the model ran would otherwise be bound to code computed
    // for its predecessor (QA review of 4b4586aff273).
    const expectedFingerprint =
      typeof body.expectedContractFingerprint === 'string' ? body.expectedContractFingerprint : '';
    if (!expectedFingerprint) {
      return NextResponse.json(
        {
          error: 'The contract this package was generated against was not named, so it cannot be stored.',
          code: 'no-contract-named',
        },
        { status: 400 },
      );
    }
    // And the state of the project the prompt was built from (3.0.11).
    const generationToken = typeof body.generationToken === 'string' ? body.generationToken : '';
    if (!generationToken) {
      return NextResponse.json(
        {
          error: 'The state this package was generated from was not named, so it cannot be stored.',
          code: 'no-generation-token',
        },
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
    if (built.contract.fingerprint !== expectedFingerprint) {
      return NextResponse.json(
        {
          error: `This package was generated against contract ${expectedFingerprint.slice(0, 12)}, and the contract of this project is now ${built.contract.fingerprint.slice(0, 12)}. Generate again against the current contract.`,
          code: 'contract-moved',
        },
        { status: 409 },
      );
    }
    // The contract can stand still while the design, the analysis or the stored
    // stand moves: the design is not part of it, and a second tab that stored
    // first changes only the stand. The token covers all of them.
    if (generationRevision(data, built.contract.fingerprint) !== generationToken) {
      return NextResponse.json(
        {
          error:
            'The project changed after this generation started: the source, the analysis, the solution design or the stored code is no longer what the model was given. Generate again from the current state.',
          code: 'generation-stale',
        },
        { status: 409 },
      );
    }

    const checked = checkGeneratedPackage(code, body.testSuite, decision.isAbapCloud);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, code: 'package-incomplete' }, { status: 400 });
    }

    const binding = generationBinding(built.contract, { codeSha256: sha256Hex(code) });
    const fields = {
      generatedCode: code,
      testSuite: checked.testSuite,
      status: 'transformed',
      [GENERATION_BINDING_FIELD]: binding,
    };
    // Every comparison above was made on the project as it was loaded. The four
    // fields are written only if the project has not been written since —
    // otherwise another analysis could have moved it between the comparison and
    // the write (QA review of 8adfa0e6db63), and of two interleaved generations
    // that both passed the token check the later would silently win.
    const projectRef: DocumentReference = db.collection('projects').doc(projectId);
    const written = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      if (!fresh.exists || !readAt || !fresh.updateTime || !fresh.updateTime.isEqual(readAt)) return false;
      tx.set(projectRef, fields, { merge: true });
      return true;
    });
    if (!written) {
      return NextResponse.json(
        {
          error:
            'The project changed while this package was being stored, so the state it was checked against may no longer be the one on the project. Generate again from the current state.',
          code: 'project-moved',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ binding, fields });
  } catch (err: unknown) {
    logger.error('generation store failed', {
      route: 'api/projects/contract',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not store this generation.' }, { status: 500 });
  }
}
