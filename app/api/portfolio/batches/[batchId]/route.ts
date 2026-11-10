import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { isFirestoreId } from '@/lib/firestore-id';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import {
  appendPrograms,
  BatchRefusal,
  cancelBatch,
  deleteBatchRecord,
  readBatch,
  stepBatch,
  type SignRun,
} from '@/lib/portfolio/batch-store';
import { PORTFOLIO_UPLOAD_BODY_BYTES } from '@/lib/portfolio/limits';
import { runInPortfolioStep } from '@/lib/portfolio/run-context';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import { POST as createSignedRun } from '@/app/api/runs/create/route';

/**
 * One batch of the portfolio — roadmap 3.0.21 (1).
 *
 *   GET    → `{ batch, items, progress }` — the progress list: done, running,
 *            failed and why.
 *   POST   `{ action: 'append', programs }` → the next part of the upload.
 *   POST   `{ action: 'step' }` → work the queue: up to five programs, each made
 *            into its project and signed. The page sends steps while it is open.
 *   POST   `{ action: 'cancel' }` → nothing queued is taken any more.
 *   DELETE → remove the record of a batch and any source still queued in it
 *            (its projects stay); open without the key, so a queue can always
 *            be taken back.
 *
 * **The same signed-run path as a single project.** A step signs each program
 * by calling the handler of `POST /api/runs/create` in this process, with this
 * request's own `Authorization` header: the same token check, second factor,
 * owner check, account gate, source checks, target profile, quota decision,
 * engine, signature and transaction. The batch adds no signing code. The only
 * difference is the route's own hourly limit, which a portfolio step replaces
 * with the batch limits (`lib/portfolio/run-context.ts`).
 *
 * **No model call.** The run is asked for without a narrative, so it records
 * `modelParticipation: 'none'`. **No free run spent:** the portfolio opens only
 * for an account with its own key, and `reserveRunQuota` does not meter such an
 * account (reason `byok`) — the platform's budget is untouched either way.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function refused(err: BatchRefusal): NextResponse {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
}

async function batchIdOf(params: Promise<{ batchId: string }>): Promise<string | null> {
  const { batchId } = await params;
  return typeof batchId === 'string' && isFirestoreId(batchId) ? batchId : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-read', perHour: 600 });
    if (!gate.ok) return gate.response;
    const batchId = await batchIdOf(params);
    if (!batchId) return NextResponse.json({ error: 'No such batch.' }, { status: 404 });
    const found = await readBatch(gate.db, gate.uid, batchId);
    if (!found) return NextResponse.json({ error: 'No such batch.' }, { status: 404 });
    return NextResponse.json(found);
  } catch (err: unknown) {
    logger.error('portfolio batch could not be read', { route: 'api/portfolio/batches/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the batch.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    // The account first, then the body: nothing of an unauthenticated request
    // is read. Steps, appends and cancels share one budget; a step signs at
    // most five programs, so 900 an hour is far above one batch's need.
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-batch', perHour: 900 });
    if (!gate.ok) return gate.response;
    const batchId = await batchIdOf(params);
    if (!batchId) return NextResponse.json({ error: 'No such batch.' }, { status: 404 });
    const raw = await readBoundedBody(req, { maxBytes: PORTFOLIO_UPLOAD_BODY_BYTES, timeoutMs: 30_000 }).catch((e) =>
      e instanceof ResponseLimitError ? null : '',
    );
    if (raw === null) {
      return NextResponse.json({ error: 'The upload part is too large. Send fewer programs per request.', code: 'body-too-large' }, { status: 413 });
    }
    let body: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') body = parsed;
    } catch {
      /* an unknown action below */
    }
    const action = body.action;

    if (action === 'append') {
      const programs = Array.isArray(body.programs) ? body.programs : [];
      const appended = await appendPrograms(gate.db, gate.uid, batchId, programs);
      return NextResponse.json({ appended });
    }
    if (action === 'cancel') {
      await cancelBatch(gate.db, gate.uid, batchId, gate.FieldValue);
      return NextResponse.json(await readBatch(gate.db, gate.uid, batchId));
    }
    if (action === 'step') {
      const authorization = req.headers.get('authorization') ?? '';
      const runUrl = new URL('/api/runs/create', req.url);
      const signRun: SignRun = async (runBody) => {
        const inner = new NextRequest(runUrl, {
          method: 'POST',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify(runBody),
        });
        const res = await runInPortfolioStep({ uid: gate.uid, batchId }, () => createSignedRun(inner));
        const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        return { status: res.status, body: parsed };
      };
      return NextResponse.json(await stepBatch(gate.db, gate.FieldValue, gate.uid, batchId, signRun));
    }
    return NextResponse.json({ error: 'Unknown action.', code: 'unknown-action' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return refused(err);
    logger.error('portfolio batch action failed', { route: 'api/portfolio/batches/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not work on the batch.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120, mode: 'manage' });
    if (!gate.ok) return gate.response;
    const batchId = await batchIdOf(params);
    if (!batchId) return NextResponse.json({ error: 'No such batch.' }, { status: 404 });
    await deleteBatchRecord(gate.db, gate.uid, batchId);
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return refused(err);
    logger.error('portfolio batch could not be deleted', { route: 'api/portfolio/batches/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not remove the batch record.' }, { status: 500 });
  }
}
