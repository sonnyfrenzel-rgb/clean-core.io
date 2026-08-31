import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import crypto from 'crypto';
import JSZip from 'jszip';
import { verifyRequestAuth, getAdminDb, assertAccountActive, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { verifyRunIntegrity } from '@/lib/run-signature';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { assertRateLimit } from '@/lib/rate-limit';
import { APP_VERSION } from '@/lib/version';
import type { Project } from '@/lib/types';
import {
  generateExecutiveSummary,
  generateExecutiveSummaryDoc,
  generateDecisionRecord,
  generateArchitectureDecisionRecord,
  generateFindingsCsv,
  generateModelCard,
  generateKnownLimitations,
  generateProvenanceManifest,
} from '@/lib/audit-pack';

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

    const { db } = await getAdminDb();

    // Ownership
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const projectData = projectDoc.data() || {};
    const isAdmin = decodedToken.admin === true;
    const isOwner = projectData.userId === decodedToken.uid;
    if (!isOwner && !isAdmin) {
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

    // Hydrate a Project view (mirrors lib/project-loader) for the pure generators.
    const project = {
      id: projectId,
      ...projectData,
      ...runData,
      // Evidence comes from the run, never from the project.
      //
      // Both of these are in the client-writable update allowlist in
      // firestore.rules, and both were read from the project in preference to
      // the run. So the owner could delete an inconvenient finding, or mark it
      // fully mapped, or change the recommended route, and the pack would sign
      // the edited version and present it as bound to the immutable run. If the
      // interactive worklist is ever worth exporting, it belongs in a separate,
      // clearly user-attested file — not in the evidentiary sections.
      worklist: runData.worklist ?? [],
      extensibilityRoute: runData.extensibilityRoute,
    } as unknown as Project;

    // 1. Server-side file generation (identical set to the former client flow)
    const fileContents: Record<string, string> = {
      '00-executive-summary.md': generateExecutiveSummary(project),
      '00-executive-summary.doc': generateExecutiveSummaryDoc(project),
      '00-provenance.md': generateProvenanceManifest(project), // F-04: per-file/field provenance classes

      '01-input-fingerprint.json': JSON.stringify(
        project.auditMetadata?.inputFingerprint || { note: 'No fingerprint available.' },
        null, 2,
      ),
      '02-decision-record.json': JSON.stringify(generateDecisionRecord(project), null, 2),
      '03-findings.csv': generateFindingsCsv(project),
      '04-model-card.md': generateModelCard(project),
      '05-known-limitations.md': generateKnownLimitations(),
      '06-architecture-decision-record.md': generateArchitectureDecisionRecord(project),
    };

    // 2. Hash server-side
    const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const enc = new TextEncoder();
    const files = Object.entries(fileContents).map(([path, content]) => ({
      path, sha256: sha(content), bytes: enc.encode(content).byteLength,
    }));

    // 3. Canonical manifest + signature (format matches /api/export/sign + verify)
    const runHash: string = runData.runHash;
    const engineVersion: string = runData.analyzerVersion || APP_VERSION;
    const sapApiCatalogVersion: string = runData.sapApiCatalogVersion || '';
    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const canonicalSuffix = `${projectId}:${runId}:${runHash}:${engineVersion}:${sapApiCatalogVersion};`;
    const canonicalManifest = sortedFiles.map(f => `${f.path}:${f.sha256}`).join(';') + ';' + canonicalSuffix;
    const manifestHash = sha(canonicalManifest);

    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    const signature = crypto.createHmac('sha256', signingKey).update(manifestHash).digest('hex');
    const generatedAt = new Date().toISOString();

    const manifest = {
      version: '2.0',
      runId,
      projectId,
      generatedAt,
      engineVersion,
      sapApiCatalogVersion,
      files,
      manifestHash,
      signed: true,
      signature,
      runHash,
    };

    // 4. Assemble ZIP server-side
    const zip = new JSZip();
    for (const [path, content] of Object.entries(fileContents)) zip.file(path, content);
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
