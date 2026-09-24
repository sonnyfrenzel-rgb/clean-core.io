import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import crypto from 'crypto';
import JSZip from 'jszip';
import { verifyRequestAuth, getAdminDb, assertAccountActive, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { verifyRunIntegrity } from '@/lib/run-signature';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { signEd25519, getSigningKeypair } from '@/lib/audit-signing-keypair';
import { assertRateLimit } from '@/lib/rate-limit';
import { APP_VERSION } from '@/lib/version';
import { signOffKey } from '@/lib/artefact-digest';
import { getMergedCatalogVersion } from '@/lib/abap/catalog-service';
import {
  INPUT_IDS,
  inputLabel,
  invalidatingInputs,
  referenceDigest,
  unverifiedInputs,
} from '@/lib/input-manifest';
import { USER_ATTESTED_FILE, type AttestedFile } from '@/lib/audit-pack';
import { attestationsOf, auditPackCovers, buildAuditPackContents } from '@/lib/audit-pack-build';
import { canonicalAuditManifest, MANIFEST_VERSION_ED25519, MANIFEST_VERSION_HMAC } from '@/lib/audit-pack-canonical';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * POST /api/audit-pack/create  (v1.20 §5 — server-authoritative audit pack)
 *
 * Loads the active run server-side, generates ALL evidence files from that
 * immutable run, hashes and signs the manifest with AUDIT_SIGNING_KEY, assembles
 * the ZIP, and streams it back. The client never supplies file content or hashes
 * for signing, so a valid signature attests to server-generated content — closing
 * the client-forged-hash gap of the older /api/export/sign flow.
 *
 * The canonical manifest format is byte-identical to /api/export/sign so packs
 * remain verifiable by the existing verify-pack endpoint/UI.
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Server-side MFA gate. Without it, a user with mfaEnabled could mint a
    // signed run or a signed audit pack from a valid ID token alone, because
    // the client obtains that token BEFORE the TOTP prompt — the prompt is a
    // modal, not an authentication step. A stolen token was therefore enough
    // to write into the very chain that is supposed to prove provenance.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: any) {
      return NextResponse.json(
        { error: mfaErr?.message || 'Multi-factor authentication required.' },
        { status: mfaErr?.status || 403 },
      );
    }

    await assertRateLimit(`audit-pack-create:${decodedToken.uid}`, 10, 60_000);

    const body = await req.json().catch(() => ({}));
    const { projectId } = body;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing required parameter: projectId.' }, { status: 400 });
    }
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();

    // Ownership
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const projectData = projectDoc.data() || {};
    const isAdmin = decodedToken.admin === true;

    // Owner only. The administrator claim does not open this door.
    //
    // It used to: `decodedToken.admin === true` stood in for ownership, so an
    // administrator who had a project id — from a support mail, a screenshot, a
    // bug report — could post it here and get back the ZIP with the project's
    // ABAP, its evidence and its decision record in it. The only other gate on
    // the way is `assertMfaSatisfied`, which lets any token through for an
    // account whose profile does not say `mfaEnabled` (`mfaSatisfied` in
    // lib/mfa-gate.ts returns null for such an account), so an administrator
    // who never enrolled a second factor needed nothing but a plain ID token.
    //
    // The same permission was taken off DELETE /api/projects/{projectId} on
    // 17.09.2026 for the same reason, and `firestore.rules` took the operator's
    // read of a project away on 16.09.2026 — reading somebody else's evidence
    // through an export route was the last way around that rule. Nothing loses
    // a function: the only caller is the owner's own delivery stage. A support
    // export, if it is ever wanted, is a separate operation with its own
    // authorisation, its own step-up and its own journal entry — not every
    // holder of the claim, silently.
    const isOwner = projectData.userId === decodedToken.uid;
    if (!isOwner) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    // F-02: account-state gate — pending/suspended/stale-Terms accounts cannot mint signed audit packs.
    try {
      await assertAccountActive(decodedToken.uid, { requireApproved: true, requireCurrentTerms: true, isAdminClaim: isAdmin });
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      throw gateErr;
    }

    // Active run gate (server decides the run — client cannot request a stale/foreign run)
    const runId = projectData.activeRunId;
    if (!runId) {
      return NextResponse.json(
        { error: 'No active analysis run. Please run the analysis first.' },
        { status: 422 },
      );
    }
    const runDoc = await db.collection('projects').doc(projectId).collection('runs').doc(runId).get();
    if (!runDoc.exists) {
      return NextResponse.json({ error: 'Active run not found.' }, { status: 404 });
    }
    const runData = runDoc.data() || {};
    if (!runData.runHash) {
      return NextResponse.json(
        { error: 'Run document is incomplete (missing runHash). Please re-run the analysis.' },
        { status: 422 },
      );
    }

    // The run's own signature is checked before anything is signed on top of it.
    // Confirming that `runHash` merely exists was the whole of the previous
    // check, so a run altered after the fact came back out as a validly signed
    // pack attesting to the altered content — the signature laundering the
    // change rather than catching it.
    {
      const key = getAuditSigningKey();
      if (!key) {
        console.error(MISSING_SIGNING_KEY_LOG);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
      }
      const integrity = verifyRunIntegrity(runData, key);
      if (!integrity.valid) {
        logger.error('audit-pack refused: run integrity check failed', {
          route: 'api/audit-pack/create',
          projectId,
          runId,
          reason: integrity.reason,
        });
        return NextResponse.json(
          {
            error:
              'This run no longer matches its own signature and cannot be exported. Re-run the analysis to produce a fresh, verifiable run.',
          },
          { status: 409 },
        );
      }
    }

    // A controlled handover of the current source only (roadmap E01-F01-US02).
    //
    // Decided here, from the run, the project's source and the server-written
    // source-change record — not from `status` or anything else the client can
    // set. The page disables its button on the same conditions; this is the
    // part a direct API call cannot step around.
    {
      const blockers: { code: string; message: string }[] = [];

      // 1. The source on the project must be the source the run analysed. The
      // analyze page never writes one without the other; a direct write could.
      const analysed: string | undefined = runData.inputFingerprint?.sha256;
      if (analysed && typeof projectData.legacyCode === 'string') {
        const current = crypto.createHash('sha256').update(projectData.legacyCode, 'utf8').digest('hex');
        if (current !== analysed) {
          blockers.push({
            code: 'source-changed',
            message: 'The source on this project is not the one the signed run analysed. Re-run the analysis.',
          });
        }
      }

      // 1b. Roadmap 0.6 — the manifest comparison, server side.
      //
      // The check above compares one input, the source, and only when both ends
      // happen to be readable: an unreadable fingerprint meant no comparison and
      // no blocker, which is the freshness heuristic in its purest form. The run
      // records all six inputs since roadmap 0.5, and every one of them is
      // rebuilt here from what is live *now*. An input that differs, one that
      // cannot be read and one the run never recorded are three reasons and one
      // verdict: the pack is refused. Engine build and narrative model are
      // `derivation`-class and are reported, not blocking — the evidence was not
      // computed from them, and a release would otherwise invalidate every
      // project on the platform.
      const recordedManifest = runData.inputManifest;
      if (recordedManifest) {
        const live: Record<string, string | null> = {
          [INPUT_IDS.source]:
            typeof projectData.legacyCode === 'string' && projectData.legacyCode.trim()
              ? crypto.createHash('sha256').update(projectData.legacyCode, 'utf8').digest('hex')
              : null,
          [INPUT_IDS.deployment]:
            typeof projectData.s4Deployment === 'string' && projectData.s4Deployment
              ? crypto.createHash('sha256').update(projectData.s4Deployment, 'utf8').digest('hex')
              : null,
          [INPUT_IDS.catalog]: referenceDigest(INPUT_IDS.catalog, getMergedCatalogVersion()),
          [INPUT_IDS.ruleset]:
            typeof runData.rulesetVersion === 'string'
              ? referenceDigest(INPUT_IDS.ruleset, runData.rulesetVersion)
              : null,
        };
        const unverified = invalidatingInputs(unverifiedInputs(recordedManifest, live));
        if (unverified.length > 0) {
          blockers.push({
            code: 'inputs-unverified',
            message: `The signed run's inputs cannot all be shown to still match: ${unverified
              .map((u) => `${inputLabel(u.id)} (${u.reason})`)
              .join(', ')}. Re-run the analysis so the pack is bound to the inputs it was computed from.`,
          });
        }
      }

      // 2. The pack carries the architect's sign-off in its decision record. A
      // sign-off given for a previous source is an approval of different code.
      if (projectData.approvedByArchitect === true) {
        const given = signOffKey(projectData.architectSignOffAt);
        const record = projectData.auditMetadata?.sourceChange;
        let stale = Boolean(record?.signOff && given === record.signOff);

        // Projects whose source changed before the record existed: find when the
        // current source was first analysed — the start of the latest unbroken
        // run of it — and ask whether the sign-off came after that.
        if (!record && !stale) {
          type RunRow = { createdAt?: unknown; inputFingerprint?: { sha256?: unknown } };
          type DatedRun = { createdAt: string; inputFingerprint: { sha256: string } };
          const runsSnap = await db.collection('projects').doc(projectId).collection('runs').get();
          const runs = (runsSnap.docs as { data: () => RunRow }[])
            .map((d) => d.data())
            .filter((r): r is DatedRun => typeof r.createdAt === 'string' && typeof r.inputFingerprint?.sha256 === 'string')
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          if (new Set(runs.map((r) => r.inputFingerprint.sha256)).size > 1 && analysed) {
            let since: string | undefined;
            for (let i = runs.length - 1; i >= 0 && runs[i].inputFingerprint.sha256 === analysed; i--) {
              since = runs[i].createdAt;
            }
            const givenMs =
              typeof projectData.architectSignOffAt === 'string'
                ? Date.parse(projectData.architectSignOffAt)
                : typeof projectData.architectSignOffAt?.toMillis === 'function'
                  ? projectData.architectSignOffAt.toMillis()
                  : NaN;
            // Unreadable counts as stale: the guard is conservative by design,
            // and re-confirming writes a readable timestamp.
            stale = !since || !Number.isFinite(givenMs) || givenMs < Date.parse(since);
          }
        }

        if (stale) {
          blockers.push({
            code: 'sign-off-stale',
            message: 'The architecture sign-off was given for a previous source. Confirm the target architecture again in stage 2.',
          });
        }
      }

      if (blockers.length > 0) {
        logger.warn('audit-pack refused: built for a previous source', {
          route: 'api/audit-pack/create',
          projectId,
          runId,
          blockers: blockers.map((b) => b.code),
        });
        return NextResponse.json(
          { error: blockers.map((b) => b.message).join(' '), blockers: blockers.map((b) => b.code) },
          { status: 409 },
        );
      }
    }

    // 1. Server-side file generation.
    //
    // Evidence comes from the run, never from the project. The generators used
    // to be handed `{ ...projectData, ...runData }`; `worklist` and
    // `extensibilityRoute` were plugged first (both in the client-writable
    // allowlist in firestore.rules — the owner could delete a finding and have
    // the pack sign the edited version), and the rest of the project document
    // — target architecture, sign-off, approver, override reason, name —
    // followed the same road into signed files until roadmap 0.12. The signed
    // input is now a named list in lib/audit-pack-build.ts; the owner's own
    // statements go into one attested file that the manifest lists and the
    // signature does not cover.
    const { signed: fileContents, attested: attestedContents } = buildAuditPackContents({
      projectId,
      runId,
      run: { ...runData, worklist: runData.worklist ?? [] },
      auditMetadata: projectData.auditMetadata,
      attested: attestationsOf(projectData),
    });

    // Roadmap 8.5 — the handover chain's coverage, from the same signed input.
    // It goes into the canonical string, so the pack's statement about what its
    // own signature covers is itself signed: an unbound covers[] could be moved
    // from `attested` to `signed` by anyone holding the archive, and the pack
    // would then read as though the platform had vouched for the account
    // holder's own sign-off.
    const covers = auditPackCovers({
      projectId,
      runId,
      run: { ...runData, worklist: runData.worklist ?? [] },
      auditMetadata: projectData.auditMetadata,
      attested: attestationsOf(projectData),
    });

    // 2. Hash server-side — every file the archive carries, signed or attested.
    // The attested file's digest says which self-declaration was sealed, not
    // that it is true; it used to be left out, and the omission let anyone
    // holding a pack rewrite the sign-off while every verifier still called the
    // pack authentic (QA full review of a19945ef01dc).
    const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const enc = new TextEncoder();
    const files = Object.entries(fileContents).map(([path, content]) => ({
      path, sha256: sha(content), bytes: enc.encode(content).byteLength,
    }));
    const attested: AttestedFile[] = Object.entries(attestedContents).map(([path, content]) => ({
      path, provenance: 'user-attested', sha256: sha(content),
    }));

    // 3. Canonical manifest + signature. One implementation, shared with the
    // verifier (lib/audit-pack-canonical.ts). The issuance metadata is decided
    // before the hash rather than after it: `generatedAt` was printed by both
    // verifiers as part of a successful result while nothing bound it, so a
    // genuine pack could be given any issue date and still verify.
    const runHash: string = runData.runHash;
    const engineVersion: string = runData.analyzerVersion || APP_VERSION;
    const sapApiCatalogVersion: string = runData.sapApiCatalogVersion || '';
    const generatedAt = new Date().toISOString();
    const version = getSigningKeypair() ? MANIFEST_VERSION_ED25519 : MANIFEST_VERSION_HMAC;
    const canonicalManifest = canonicalAuditManifest({
      files, attested, covers, projectId, runId, runHash, engineVersion, sapApiCatalogVersion, version, generatedAt,
    });
    const manifestHash = sha(canonicalManifest);

    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    const signature = crypto.createHmac('sha256', signingKey).update(manifestHash).digest('hex');

    // The asymmetric signature, when a key is configured. It covers exactly the
    // same string as the HMAC, so a verifier checks one value with either method
    // and the two can never disagree about what was signed. Absent key means
    // absent field — never a null or an empty string that a verifier might read
    // as "signed with nothing".
    const ed25519 = signEd25519(manifestHash);

    const manifest = {
      version,
      runId,
      projectId,
      generatedAt,
      engineVersion,
      sapApiCatalogVersion,
      files,
      attested,
      covers,
      manifestHash,
      signed: true,
      signature,
      ...(ed25519
        ? {
            signatureEd25519: ed25519.signature,
            signingKeyId: ed25519.keyId,
            signingKeyUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io').replace(/\/$/, '')}/.well-known/clean-core-io-signing.json`,
          }
        : {}),
      runHash,
    };

    // 4. Assemble ZIP server-side
    const zip = new JSZip();
    for (const [path, content] of Object.entries(fileContents)) zip.file(path, content);
    for (const [path, content] of Object.entries(attestedContents)) zip.file(path, content);
    if (!(USER_ATTESTED_FILE in attestedContents)) throw new Error('The attested file was not generated.');
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const buf = await zip.generateAsync({ type: 'nodebuffer' });

    // 5. Record export timestamp.
    // Written nested, not as a dotted path: `set` does not interpret dotted
    // field names (only `update` does), so the previous form created a literal
    // top-level field called "auditMetadata.auditPackExportedAt" and the real
    // one was never set. Nested + merge is safe here because Firestore merges
    // map fields recursively — sibling auditMetadata keys survive.
    await db.collection('projects').doc(projectId).set(
      { auditMetadata: { auditPackExportedAt: generatedAt } },
      { merge: true },
    );

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="clean-core-audit-pack.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    // QuotaError carries `.status`; `.statusCode` alone never matched, so quota
    // exhaustion surfaced as a 500 instead of a 429.
    if (error?.status === 429 || error?.statusCode === 429) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    logger.error('audit-pack/create failed', { route: 'api/audit-pack/create', error: errMessage(error) });
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
