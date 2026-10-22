import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { mfaRefusal, verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { contractOfProject, MAX_CONTRACT_SOURCE_BYTES } from '@/lib/contract-build';
import { generationDirection, generationBinding, offTrackRefusal } from '@/lib/generation-direction';
import type { InputManifest } from '@/lib/input-manifest';
import { sha256Hex } from '@/lib/artefact-digest';
import { checkGeneratedPackage, generationInputsOf, generationRevision, generationStateOf } from '@/lib/generation-revision';
import { platformContextOf } from '@/lib/transformation-context-build';
import type { DocumentReference, Timestamp, Transaction } from 'firebase-admin/firestore';
import { isFirestoreId } from '@/lib/firestore-id';
import { generationRecordOf, traceMatchesRecord } from '@/lib/transformation/generation-record';
import { readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { projectTooLargeMessage, PROJECT_TOO_LARGE_CODE } from '@/lib/firestore-doc-size';
import { planArtefactWrite, withStoredArtefacts, writeArtefactParts } from '@/lib/project-artefact-store';
import { getAuditSigningKey } from '@/lib/audit-signing-key';
import { verifyModelReceiptIssuer } from '@/lib/model-receipt';
import { aiModelRecordOf } from '@/lib/ai-marking';
import { TEST_SUITE_MODEL_FIELD } from '@/lib/project-artefact-writes';
import { APP_VERSION } from '@/lib/version';

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
 *          from what the page loaded earlier. Since 3.0.12 the inputs carry the
 *          PLATFORM KNOWLEDGE block (`lib/transformation-context-build.ts`) and
 *          `generation` is answered only to `?for=generation`: the IT rail and
 *          the Design stage read this route for the contract alone and do not
 *          pay for the rule reading. `?for=context` (3.0.13) answers only
 *          `{ contextDigest }`: the digest of that block as it would be built
 *          now, for the stale reading of the Transformation phase.
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

/**
 * The same bound `/api/projects/{id}/findings` sets, for the same reason — and
 * the one the sign-off check (`recommendationOfProject`) stops at, so both read
 * the recommendation from the same place or both fall back.
 */
const MAX_SOURCE_BYTES = MAX_CONTRACT_SOURCE_BYTES;

/** The bound `firestore.rules` sets on a browser-written `generatedCode`, kept for the server's write. */
const MAX_PACKAGE_CHARS = 1_000_000;
// A package of MAX_PACKAGE_CHARS UTF-16 units is at most three times that in
// UTF-8, plus the suite beside it; nothing larger is read.
const STORE_BODY_LIMITS = { maxBytes: 8 * 1024 * 1024, timeoutMs: 20_000 };

/** The field the binding is written to. Server-only: never in the rules allowlist. */
const GENERATION_BINDING_FIELD = 'generationBinding';

function manifestOfRun(run: Record<string, unknown> | null): InputManifest | null {
  const manifest = run?.inputManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as Partial<InputManifest>;
  return typeof m.hash === 'string' && Array.isArray(m.inputs) ? (manifest as InputManifest) : null;
}

async function loadProjectAndRun(projectId: string, uid: string, withArtefacts: boolean) {
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists || !mayReadProject(snap.data(), uid)) return null;
  // Roadmap 3.0.14, item 9: the stored package lives beside the project; the
  // generation token covers it as it covered the inline field. The contract
  // alone does not read it, so only a generation pays for the read.
  const stored = snap.data() as Record<string, unknown>;
  const data = withArtefacts ? await withStoredArtefacts(db, snap.ref, stored) : stored;
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

async function authorise(req: NextRequest, bucket = 'project-contract'): Promise<Authorised> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  // The contract is derived from the customer's own code. A token from before
  // the second factor reads neither, here as in Firestore.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaRefusal(mfaErr);
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
    await assertRateLimit(`${bucket}:${decodedToken.uid}`, 240, 60 * 60 * 1000);
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
    const purpose = req.nextUrl.searchParams.get('for');
    // The context read (3.0.13) has a budget of its own: it runs on every stage load of a project with a
    // stored generation, and must never use up the budget a generation needs.
    const auth = await authorise(req, purpose === 'context' ? 'project-context' : 'project-contract');
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    // Checked before the id forms any document path.
    if (!isFirestoreId(projectId)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });

    const loaded = await loadProjectAndRun(projectId, auth.uid, purpose === 'generation');
    // One answer for "not there" and "not yours".
    if (!loaded) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const { db, data, run } = loaded;

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
    // Roadmap 3.0.13, item 3: the digest of the PLATFORM KNOWLEDGE block as it
    // would be built now — the same block, built the same way, as the POST
    // digests into the binding (`contextDigest`). `lib/workflow-steps.ts` reads
    // the Transformation phase as stale when the two differ: a rule decision,
    // the decision record or an accepted requirement changed after the
    // generation. Only the digest leaves the server, never the block.
    if (purpose === 'context') {
      if (!decision.ok) return NextResponse.json({ contextDigest: null });
      const platform = await platformContextOf(db, projectId, data, built, decision.isAbapCloud);
      return NextResponse.json({ contextDigest: sha256Hex(platform.stamp.text) });
    }
    // Roadmap 3.0.11: only a generation that may run gets a token — and since
    // 3.0.12 only a generation asks for one: the block is built for it alone.
    if (!decision.ok || purpose !== 'generation') {
      return NextResponse.json({ contract: built.contract, decision, generation: null });
    }
    const platform = await platformContextOf(db, projectId, data, built, decision.isAbapCloud);
    // The project with its run's narrative — the analysis lives in the run
    // (`generationStateOf`) — and the PLATFORM KNOWLEDGE block with the
    // revisions it was read from. The POST compares against the same state.
    const state = generationStateOf(data, run, platform.stamp);
    return NextResponse.json({
      contract: built.contract,
      decision,
      generation: { token: generationRevision(state, built.contract.fingerprint), inputs: generationInputsOf(state) },
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
 * replaced overwrote the newer design's stand. Now all four fields land in one
 * transaction, or none does.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await authorise(req);
    if (!auth.ok) return auth.response;
    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    // Checked before the id forms any document path.
    if (!isFirestoreId(projectId)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });

    const loaded = await loadProjectAndRun(projectId, auth.uid, true);
    if (!loaded) return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    const { db, data, run, readAt } = loaded;
    // Reading is a share; recording what was generated is not.
    if (data.userId !== auth.uid) {
      // An invited reader gets the stranger's answer, word for word, as on every
      // other write under app/api/projects (tests/project-access-matrix.spec.ts):
      // a reader reads, and a distinct 403 would be a second way to say so.
      return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    }

    let parsedBody: unknown = {};
    try {
      parsedBody = await readBoundedJson(new Response(req.body, { headers: req.headers }), STORE_BODY_LIMITS);
    } catch (bodyErr) {
      if (bodyErr instanceof ResponseLimitError) {
        return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
      }
    }
    const body = (parsedBody && typeof parsedBody === 'object' ? parsedBody : {}) as {
      generatedCode?: unknown;
      testSuite?: unknown;
      expectedContractFingerprint?: unknown;
      generationToken?: unknown;
      /** Roadmap 3.0.12, step E: how the package was made — engine-led or the single call (`generation-record.ts`). */
      generation?: unknown;
      /** Roadmap 3.0.17 (AI Act Art. 50(2)): the receipt of the generation's last model call, as `/api/gemini` issued it. */
      modelReceipt?: unknown;
    };
    const record = generationRecordOf(body.generation);
    if (record && 'error' in record) {
      return NextResponse.json({ error: record.error, code: 'bad-generation-record' }, { status: 400 });
    }
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
    // for its predecessor.
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

    // The same bound the GET applies before it derives the contract.
    const storedSource = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (Buffer.byteLength(storedSource, 'utf8') > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        {
          error: `This source is larger than the ${MAX_SOURCE_BYTES} bytes this contract is derived from in one request.`,
          code: 'too-large',
        },
        { status: 413 },
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
    // first changes only the stand. Nor do the owner's rule answers or the
    // decision record move it (3.0.12). The token covers all of them.
    const platform = await platformContextOf(db, projectId, data, built, decision.isAbapCloud);
    if (generationRevision(generationStateOf(data, run, platform.stamp), built.contract.fingerprint) !== generationToken) {
      return NextResponse.json(
        {
          error:
            'The project changed after this generation started: the source, the analysis, the solution design, a business rule decision, the decision record, an accepted requirement or the stored code is no longer what the model was given. Generate again from the current state.',
          code: 'generation-stale',
        },
        { status: 409 },
      );
    }

    const checked = checkGeneratedPackage(code, body.testSuite, decision.isAbapCloud, record?.path ?? 'single-call');
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, code: 'package-incomplete' }, { status: 400 });
    }
    if (record) {
      const mismatch = traceMatchesRecord(JSON.parse(code) as Array<{ path: string; content: string }>, record);
      if (mismatch) return NextResponse.json({ error: mismatch, code: 'package-incomplete' }, { status: 400 });
    }
    // Roadmap 3.0.12 (DSAG ABAP guide B5): abaplint on an ABAP Cloud package, run here under ABAP Cloud syntax and
    // recorded as passed, failed or not run — the page cannot report this check for itself.
    const lint = decision.isAbapCloud ? await import('@/lib/transformation/abaplint-check') : null;
    const abaplint = lint ? lint.abaplintPackageCheck(JSON.parse(code) as Array<{ path: string; content: string }>) : null;
    // Roadmap 3.0.13 (A1): an engine-led Node package is type-checked here with its own tsconfig.json — the page
    // cannot report this check for itself. Type errors make the record `not-runnable`, whatever the page said.
    const nodeEngine = !decision.isAbapCloud && record?.path === 'engine-led' && record.engine;
    const typed = nodeEngine ? (await import('@/lib/test-sandbox/type-check')).typeCheckCandidate(JSON.parse(code) as Array<{ path: string; content: string }>) : null;
    const words = nodeEngine ? await import('@/lib/transformation/check-words') : null;
    const typeCheck = typed && words ? words.typeCheckRecordOf(typed) : null;
    // Roadmap 3.0.13 (CAP shell): `cds compile` of the package's model and service, where SAP's compiler is installed —
    // not on the production server (SAP Developer License, `lib/transformation/cds-compile.ts`): there the record keeps
    // why, the reader is told that SAP CAP is theirs to install and how to check it, and the CAP capabilities read
    // "to be checked in your environment" (owner decision 14.10.2026).
    const cdsCompile =
      nodeEngine && words ? words.cdsCompileRecordOf((await import('@/lib/transformation/cds-compile')).cdsCompileCandidate(JSON.parse(code) as Array<{ path: string; content: string }>)) : null;

    // Roadmap 3.0.17 (AI Act Art. 50(2)): which model wrote the package, from a
    // receipt this deployment issued to this account under the transformation
    // stage — never from what the page says. No receipt, or one that does not
    // verify, leaves `model: null`: the package is still marked as model-written,
    // with "provider and model not recorded". Never a refusal of the store.
    const signingKey = getAuditSigningKey();
    const receiptVerdict = signingKey
      ? verifyModelReceiptIssuer(body.modelReceipt, { uid: auth.uid, key: signingKey, stage: 'transformation' })
      : null;
    const model = receiptVerdict?.ok ? aiModelRecordOf(receiptVerdict.receipt, APP_VERSION) : null;

    // Roadmap 3.0.12, step E (design §12.2): the binding names how the package
    // was made and the PLATFORM KNOWLEDGE block it was made from — its digest is
    // the server's, from the block this request just rebuilt; the rest is the
    // page's report of a model-written package and stays `proposed`.
    const binding = {
      ...generationBinding(built.contract, { codeSha256: sha256Hex(code) }),
      model,
      ...(record
        ? {
            path: record.path,
            contextDigest: sha256Hex(platform.stamp.text),
            fallbackReason: record.fallbackReason,
            engine:
              record.engine && lint && abaplint
                ? lint.withAbaplint(record.engine, abaplint)
                : record.engine && words && typed
                  ? words.withTypeCheck(record.engine, typeCheck, typed.ran ? null : typed.reason)
                  : record.engine,
            scaffoldVersion: record.engine?.scaffoldVersion ?? null,
            scaffoldDigest: record.engine?.scaffoldDigest ?? null,
            basis: record.basis,
            elapsedMs: record.elapsedMs,
          }
        : {}),
      ...(abaplint ? { abaplint } : {}),
      ...(typeCheck ? { typeCheck } : {}),
      ...(cdsCompile ? { cdsCompile } : {}),
    };
    const fields = {
      generatedCode: code,
      testSuite: checked.testSuite,
      status: 'transformed',
      [GENERATION_BINDING_FIELD]: binding,
      // Roadmap 3.0.17: the suite is now the package's own, so the Testing stage's record of who wrote its suite goes.
      [TEST_SUITE_MODEL_FIELD]: null,
    };
    // Every comparison above was made on the project as it was loaded. The four
    // fields are written only if the project has not been written since —
    // otherwise another analysis could have moved it between the comparison and
    // the write, and of two interleaved generations
    // that both passed the token check the later would silently win.
    const projectRef: DocumentReference = db.collection('projects').doc(projectId);
    //
    // Every field has a bound of its own, but they all
    // share one document and Firestore refuses one over 1 MiB. The merged
    // document is estimated from the transaction's own snapshot; a stand that
    // would outgrow it is refused by name, with nothing written, instead of
    // failing in the commit as a generic 500.
    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      if (!fresh.exists || !readAt || !fresh.updateTime || !fresh.updateTime.isEqual(readAt)) return 'moved' as const;
      // Roadmap 3.0.14, item 9: the package goes into documents of its own, in
      // this transaction, so the update-time precondition above holds for them
      // too; the project document gets the index and the other three fields,
      // and the size guard measures what stays on it.
      const planned = await planArtefactWrite(projectRef, fresh.data(), fields, 'merge');
      if (!planned.ok) return planned.check;
      tx.set(projectRef, planned.plan.projectFields, { merge: true });
      writeArtefactParts(tx, planned.plan);
      return 'written' as const;
    });
    if (typeof outcome === 'object') {
      logger.warn('generation store refused: the project would outgrow its document', {
        route: 'api/projects/contract',
        projectId,
        bytes: outcome.bytes,
        budget: outcome.budget,
      });
      return NextResponse.json(
        {
          error: projectTooLargeMessage(outcome, 'this generated package', true),
          code: PROJECT_TOO_LARGE_CODE,
          bytes: outcome.bytes,
          budget: outcome.budget,
          largest: outcome.largest,
        },
        { status: 413 },
      );
    }
    if (outcome === 'moved') {
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
