import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import {
  appendPrograms,
  batchesOf,
  BatchRefusal,
  checkBatchHeader,
  createBatch,
  readBatch,
} from '@/lib/portfolio/batch-store';
import { PORTFOLIO_UPLOAD_BODY_BYTES } from '@/lib/portfolio/limits';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';

/**
 * The batch run of the portfolio — roadmap 3.0.21 (1).
 *
 *   GET  → `{ batches }`, the account's batches, newest first, with progress.
 *   POST `{ name?, edition, release?, total, programs }` → `{ batchId }` — a new
 *        batch with its first programs; the rest follow through
 *        `POST /api/portfolio/batches/{batchId}` (`action: 'append'`), because
 *        100 programs do not fit one request.
 *
 * Owner only, and only for an account whose own model key is stored and tested
 * (`lib/portfolio/access-server.ts`). Nothing here calls a model or signs
 * anything: a program becomes a queued item; its project and its signed run
 * are made by the step (`[batchId]/route.ts`).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function refused(err: BatchRefusal): NextResponse {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
}

export async function GET(req: NextRequest) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-read', perHour: 600 });
    if (!gate.ok) return gate.response;
    const headers = (await batchesOf(gate.db, gate.uid)).slice(0, 20);
    const batches = [];
    for (const b of headers) {
      const found = await readBatch(gate.db, gate.uid, b.id);
      if (found) batches.push(found);
    }
    return NextResponse.json({ batches });
  } catch (err: unknown) {
    logger.error('portfolio batches could not be read', { route: 'api/portfolio/batches', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the batches.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120 });
    if (!gate.ok) return gate.response;
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
      /* answered as an empty batch below */
    }
    const header = checkBatchHeader(body);
    const programs = Array.isArray(body.programs) ? body.programs : [];
    const batchId = await createBatch(gate.db, gate.uid, header);
    const appended = programs.length > 0 ? await appendPrograms(gate.db, gate.uid, batchId, programs) : 0;
    return NextResponse.json({ batchId, appended }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return refused(err);
    logger.error('portfolio batch could not be created', { route: 'api/portfolio/batches', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not create the batch.' }, { status: 500 });
  }
}
