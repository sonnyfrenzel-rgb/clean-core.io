import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/export/sign
 *
 * Receives a list of audit pack files with their SHA-256 hashes,
 * computes a canonical manifest hash, and returns an HMAC-SHA256
 * signature using the server-only AUDIT_SIGNING_KEY.
 *
 * This keeps the signing key server-side while allowing the client
 * to construct the ZIP with the signed manifest.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // 2. Rate limiting: 10 requests/min per user
    await assertRateLimit(`export-sign:${decodedToken.uid}`, 10, 60_000);

    // 3. Parse request body
    const body = await req.json().catch(() => ({}));
    const { projectId, runId, files } = body;

    if (!projectId || !runId || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters: projectId, runId, files[].' },
        { status: 400 },
      );
    }

    // Validate file entries
    for (const f of files) {
      if (!f.path || typeof f.path !== 'string' || !f.sha256 || typeof f.sha256 !== 'string') {
        return NextResponse.json(
          { error: 'Each file entry must have a valid path and sha256.' },
          { status: 400 },
        );
      }
    }

    const { db } = await getAdminDb();

    // 4. Verify project ownership
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const projectData = projectDoc.data();
    const isAdmin = decodedToken.admin === true;
    const isOwner = projectData?.userId === decodedToken.uid;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    // 5. Verify run exists
    const runDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('runs')
      .doc(runId)
      .get();
    if (!runDoc.exists) {
      return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
    }

    const runData = runDoc.data();

    // 5b. Verify this is the active run for the project (prevents signing stale/orphaned runs)
    const projectActiveRunId = projectData?.activeRunId;
    if (projectActiveRunId && projectActiveRunId !== runId) {
      return NextResponse.json(
        { error: 'Requested run is not the active run for this project. Please re-run the analysis.' },
        { status: 409 },
      );
    }

    // 5c. Verify run has a valid runHash (ensures run was properly created via /api/runs/create)
    if (!runData?.runHash) {
      return NextResponse.json(
        { error: 'Run document is incomplete (missing runHash). Please re-run the analysis.' },
        { status: 422 },
      );
    }

    const runHash = runData.runHash;
    const engineVersion = runData?.analyzerVersion || '';
    const sapApiCatalogVersion = runData?.sapApiCatalogVersion || '';

    // 6. Sort files alphabetically and build canonical manifest string
    const sortedFiles = [...files].sort((a: any, b: any) => a.path.localeCompare(b.path));
    const canonicalSuffix = `${projectId}:${runId}:${runHash}:${engineVersion}:${sapApiCatalogVersion};`;
    const canonicalManifest = sortedFiles.map((f: any) => `${f.path}:${f.sha256}`).join(';') + ';' + canonicalSuffix;

    // 7. Compute manifest hash
    const manifestHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');

    // 8. Compute HMAC-SHA256 signature
    const isProduction =
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true';
    const signingKey = process.env.AUDIT_SIGNING_KEY;

    if (!signingKey && isProduction) {
      console.error('CRITICAL: AUDIT_SIGNING_KEY is missing in production.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const finalKey = signingKey || 'dev_audit_signing_key_fallback_clean_core';
    if (!signingKey) {
      console.warn('WARNING: AUDIT_SIGNING_KEY is missing. Using development fallback.');
    }

    const signature = crypto.createHmac('sha256', finalKey).update(manifestHash).digest('hex');
    const generatedAt = new Date().toISOString();

    // 9. Write export timestamp server-side (avoids client-side Firestore write)
    await db.collection('projects').doc(projectId).set(
      { 'auditMetadata.auditPackExportedAt': generatedAt },
      { merge: true },
    );

    return NextResponse.json({
      signature,
      manifestHash,
      signed: true,
      generatedAt,
    });
  } catch (error: any) {
    if (error?.statusCode === 429) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('Error in /api/export/sign:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
