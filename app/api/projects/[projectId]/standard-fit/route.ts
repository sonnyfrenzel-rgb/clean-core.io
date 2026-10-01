import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { deriveStandardCoverageFrom, type CatalogLookup } from '@/lib/abap/standard-coverage';
import { deriveCounterCheckScenariosFrom } from '@/lib/abap/counter-check';
import { deriveUserChangeFrom } from '@/lib/abap/user-change';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import { humaniseField, plainContext } from '@/lib/abap/plain-language';
import { resolveApi } from '@/lib/abap/catalog-service';
import { complianceReviewHints, examinedTablesFromDependencies } from '@/lib/compliance-review-hints';
import { buildStandardFitView } from '@/lib/standard-fit-view';
import { readSource } from '@/lib/first-look';
import { plainWordingFor } from '@/lib/business-card';

/**
 * The *Standard fit* layer of one project — mockup screen `s3`, roadmap 7.2.
 *
 *   GET → `{ view }` (`lib/standard-fit-view.ts`).
 *
 * A read, and only a read: it derives the coverage table, the counter-check
 * scenarios, what changes for users and the compliance hints from the source
 * stored on the project, with SAP's cloudification catalogue as the one input a
 * browser does not have. Nothing is written, nothing is signed, no model is
 * called. The same source and the same catalogue give the same view.
 *
 * Readable by everyone who may read the project — the owner and invited
 * readers (`mayReadProject`) — because it shows nothing the project's own code
 * does not already show them. One answer for "not there" and "not yours".
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The same ceiling `process-states` uses: the rule reader is quadratic in the source. */
const MAX_ANALYSED_SOURCE_BYTES = 256 * 1024;

/** The catalogue the product ships, asked the one question 7.2 needs. */
const CATALOG: CatalogLookup = { successorFor: (object) => resolveApi(object)?.view ?? null };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    // Read out of the customer's own code: a token from before the second
    // factor reads none of it, here as in Firestore.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }
    try {
      await assertRateLimit(`standard-fit-read:${decodedToken.uid}`, 240, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }

    const { projectId } = await params;
    if (!projectId || !isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
    }

    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return inactive;

    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists || !mayReadProject(snap.data(), decodedToken.uid)) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (!source.trim()) {
      return NextResponse.json(
        { error: 'No source is staged on this project, so nothing was compared.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_ANALYSED_SOURCE_BYTES) {
      return NextResponse.json(
        { error: 'This source is larger than one request compares.', code: 'source-too-large' },
        { status: 413 },
      );
    }

    const reading = readSource(source);
    const ruleSet = reading.ruleSet;
    const ctx = plainContext(source);
    const wording = plainWordingFor(source, reading.skeleton);
    const words = (text: string | null) => !!text && (text.match(/[A-Za-z]/g) ?? []).length >= 3;
    const view = buildStandardFitView({
      coverage: deriveStandardCoverageFrom(source, ruleSet, { catalog: CATALOG }),
      scenarios: deriveCounterCheckScenariosFrom(ruleSet),
      users: deriveUserChangeFrom(source, ruleSet, { catalog: CATALOG }),
      compliance: complianceReviewHints(examinedTablesFromDependencies(readTableDependencies(source).dependencies)),
      name: (subject, ruleIds) => {
        // The rule's own phrase ("plant 1000") reads better than the field
        // alone ("Plant"); the field is the fallback, the code the last resort.
        const rule = ruleSet.rules.find((r) => r.id === ruleIds[0]);
        const phrase = rule ? wording.rulePhrase(rule) : null;
        if (phrase && words(phrase)) return phrase.charAt(0).toUpperCase() + phrase.slice(1);
        const plain = humaniseField(subject, ctx).trim();
        if (words(plain) && plain.toUpperCase() !== subject.toUpperCase()) return plain;
        const sentence = rule ? wording.ruleSentence(rule) : null;
        return sentence && words(sentence) ? sentence : null;
      },
    });
    return NextResponse.json({ view });
  } catch (err: unknown) {
    logger.error('standard fit read failed', { route: 'api/projects/standard-fit', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not compare this project with SAP standard.' }, { status: 500 });
  }
}
