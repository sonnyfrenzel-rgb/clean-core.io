import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, assertAdminStepUp, getAdminDb, logAuditEvent } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';
import { isFirestoreId } from '@/lib/firestore-id';
import {
  ContentHoldRefusal,
  blockProjectContent,
  deleteHeldContent,
  extendHoldRetention,
  holdDue,
  holdRetainUntil,
  listContentHolds,
  recordAuthorityDecision,
  recordPoliceInformed,
  releaseHeldContent,
  type ContentHold,
} from '@/lib/content-hold';

/**
 * Content blocked after a report of illegal content (legal texts Fassung 1.1;
 * Terms section 7, /report, privacy policy sections 2, 6 and 8) — the
 * operator's console. `lib/content-hold.ts` holds the rules.
 *
 *   GET   → the hold records: ids, dates, state, the evidence log, whether
 *           deletion is due. Never the held content: there is no route that
 *           shows, copies or exports it.
 *   POST  { action: 'block', projectId, criminalSuspicion, csamSuspicion }
 *         { action: 'police-informed', holdId, at? }
 *         { action: 'authority-decision', holdId, outcome, at? }
 *         { action: 'extend', holdId, until }
 *         { action: 'release', holdId }      (no suspected offence only)
 *         { action: 'delete', holdId }       (once allowed)
 *
 * Admin claim and a fresh step-up, as every console action; every action
 * writes an `audit_events` row.
 */

type Row = ContentHold & { retainUntil: string | null; due: boolean };

const rowOf = (h: ContentHold, now: number): Row => ({ ...h, retainUntil: holdRetainUntil(h), due: holdDue(h, now) });

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdminRequest(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 403 });
    const { db } = await getAdminDb();
    const now = Date.now();
    return NextResponse.json({ holds: (await listContentHolds(db)).map((h) => rowOf(h, now)) });
  } catch (error: unknown) {
    logger.error('content holds could not be listed', { route: 'api/admin/content-holds', error: errMessage(error) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdminRequest(req);
    if (!admin) return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 403 });
    try {
      await assertAdminStepUp(req, admin);
    } catch (stepUpErr: any) {
      return NextResponse.json({ error: stepUpErr.message || 'Recent administrator step-up verification required.' }, { status: stepUpErr.status || 403 });
    }
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const action = body.action;
    const { db, FieldValue } = await getAdminDb();
    let hold: ContentHold;
    if (action === 'block') {
      if (typeof body.projectId !== 'string' || !isFirestoreId(body.projectId)) return NextResponse.json({ error: 'Invalid projectId.' }, { status: 400 });
      hold = await blockProjectContent(db, FieldValue, admin.uid, {
        projectId: body.projectId,
        criminalSuspicion: body.criminalSuspicion === true,
        csamSuspicion: body.csamSuspicion === true,
      });
      await logAuditEvent(db, admin.uid, hold.csamSuspicion ? 'CONTENT_BLOCK:csam' : hold.criminalSuspicion ? 'CONTENT_BLOCK:criminal' : 'CONTENT_BLOCK', hold.ownerUid);
    } else {
      if (typeof body.holdId !== 'string' || !isFirestoreId(body.holdId)) return NextResponse.json({ error: 'Invalid holdId.' }, { status: 400 });
      const holdId = body.holdId;
      switch (action) {
        case 'police-informed':
          hold = await recordPoliceInformed(db, FieldValue, admin.uid, holdId, body.at);
          await logAuditEvent(db, admin.uid, 'CONTENT_HOLD_POLICE_INFORMED', hold.ownerUid);
          break;
        case 'authority-decision':
          hold = await recordAuthorityDecision(db, FieldValue, admin.uid, holdId, body.outcome, body.at);
          await logAuditEvent(db, admin.uid, `CONTENT_HOLD_AUTHORITY:${hold.authorityDecision?.outcome}`, hold.ownerUid);
          break;
        case 'extend':
          hold = await extendHoldRetention(db, FieldValue, admin.uid, holdId, body.until);
          await logAuditEvent(db, admin.uid, 'CONTENT_HOLD_EXTENDED', hold.ownerUid);
          break;
        case 'release':
          hold = await releaseHeldContent(db, FieldValue, admin.uid, holdId);
          await logAuditEvent(db, admin.uid, 'CONTENT_HOLD_RELEASED', hold.ownerUid);
          break;
        case 'delete':
          hold = await deleteHeldContent(db, FieldValue, admin.uid, holdId);
          await logAuditEvent(db, admin.uid, 'CONTENT_HOLD_DELETED', hold.ownerUid);
          break;
        default:
          return NextResponse.json({ error: 'Invalid action name.' }, { status: 400 });
      }
    }
    return NextResponse.json({ hold: rowOf(hold, Date.now()) });
  } catch (error: unknown) {
    if (error instanceof ContentHoldRefusal) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    logger.error('content hold action failed', { route: 'api/admin/content-holds', error: errMessage(error) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
