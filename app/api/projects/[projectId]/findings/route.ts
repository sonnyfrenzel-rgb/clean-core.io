import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { findingsOf } from '@/lib/it-findings-build';

/**
 * The findings of one project, with both catalog views — roadmap 8.1.
 *
 * `GET` → `{ rows, sourceSha256, rulesDerived }`, the input of
 * `lib/it-findings.ts`.
 *
 * **Why a route rather than a call in the browser.** `buildAbapEvidence` reaches
 * the merged SAP catalog, which is 4.3 MB of generated JSON. `lib/first-look.ts`
 * refuses to call it from the workspace route for exactly that reason, and
 * `/api/abcd-classify` was built on the same rule: *"the client sends names and
 * gets grades back"*. The IT view needs rather more than grades — the finding,
 * its line, its routine and both halves of the catalog answer — so it asks for
 * those instead, and the catalog never leaves the server.
 *
 * **One engine, not a second opinion.** Everything below is the same
 * deterministic pass the signed run makes: `buildAbapEvidence` over the source
 * on the project, `deriveBusinessRules` over the same text, `gradeSapObjectUse`
 * out of the same catalog service. The digest of the bytes it read is answered
 * with the rows, so a caller can tell which source this is about.
 *
 * **Read-only, and it writes nothing.** No Firestore write, no run, no
 * signature. The clean core level in particular is never stored: `CLAUDE.md` —
 * *"The grade is never part of the signed audit pack."*
 *
 * Owner **or** an accepted reader (`mayReadProject`, roadmap 5.4), because a
 * share is read access to the case including its source, and the findings are
 * derived from that same source.
 */
export const runtime = 'nodejs';

/**
 * A source bound so one request cannot be turned into a long CPU burn.
 *
 * The largest example this product ships is 37 kB; the engine's own input gate
 * works at the same order. A source above this is refused with a sentence rather
 * than analysed slowly, and the refusal says the number.
 */
const MAX_SOURCE_BYTES = 400_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    // The findings are read out of the customer's own code. A token from before
    // the second factor reads neither, here as in Firestore.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists || !mayReadProject(snap.data(), decodedToken.uid)) {
      // One answer for "not there" and "not yours": a 404 that becomes a 403
      // tells a caller which project ids exist.
      return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (!source.trim()) {
      // Nothing staged is not an empty finding list: it is a project with no
      // source, and the caller is told that rather than shown a clean bill.
      return NextResponse.json(
        { error: 'No source is staged on this project, so nothing was analysed.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      return NextResponse.json(
        {
          error: `This source is larger than the ${MAX_SOURCE_BYTES} bytes this view reads in one request.`,
          code: 'too-large',
        },
        { status: 413 },
      );
    }

    const fingerprint = (data.auditMetadata as { inputFingerprint?: { fileName?: unknown } } | undefined)
      ?.inputFingerprint;
    const fileName =
      typeof fingerprint?.fileName === 'string' && fingerprint.fileName.trim()
        ? fingerprint.fileName
        : 'main.abap';
    const deployment = data.s4Deployment === 'private' ? 'private' : data.s4Deployment === 'public' ? 'public' : undefined;

    return NextResponse.json(findingsOf(source, fileName, deployment));
  } catch (err: unknown) {
    logger.error('project findings read failed', {
      route: 'api/projects/findings',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not read the findings of this project.' }, { status: 500 });
  }
}
