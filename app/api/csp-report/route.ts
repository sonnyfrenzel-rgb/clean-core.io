import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import {
  InstanceRateLimiter,
  ViolationAggregator,
  parseCspReports,
} from '@/lib/csp-report';

/**
 * Receives Content-Security-Policy violation reports from browsers (ADR-065).
 *
 * The report-only policy set in `middleware.ts` points `report-uri` here; the
 * `report-to` format is read too, for the day that directive is added. Browsers send these without credentials, so the route is
 * unauthenticated by necessity; `/api` is outside the middleware matcher, and
 * the route performs no origin check because browsers do not send a useful
 * one for reports.
 *
 * What it does with a report: one compact structured log line — directive,
 * origin of what was blocked, document path without query, a count — and
 * nothing else. No Firestore write, no mail, no full URL, no script sample.
 *
 * Bounds: the body is read up to 16 kB (`readBoundedBody`) and refused beyond; each client address
 * may deliver 60 bodies a minute per instance; at most 20 violations are read
 * from one body; identical violations are collapsed into one line per minute
 * with their count.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A report is a few hundred bytes; a `report-to` batch a few kB. A slow sender is cut off too. */
const BODY_LIMITS = { maxBytes: 16 * 1024, timeoutMs: 5_000 };

const limiter = new InstanceRateLimiter(60, 60_000);
const aggregator = new ViolationAggregator(60_000);

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  if (!limiter.allow(getClientIp(req))) {
    return new NextResponse(null, { status: 429 });
  }

  let json: unknown;
  try {
    json = JSON.parse(await readBoundedBody(req, BODY_LIMITS));
  } catch (err) {
    if (err instanceof ResponseLimitError) return new NextResponse(null, { status: 413 });
    // Not JSON: nothing to log, nothing to tell the browser.
    return NO_CONTENT();
  }

  for (const violation of parseCspReports(json)) {
    const count = aggregator.record(violation);
    if (count === 0) continue;
    // Cloud Run reads a JSON line on stdout as a structured log entry.
    console.log(JSON.stringify({
      severity: 'WARNING',
      event: 'csp-report',
      disposition: violation.disposition,
      directive: violation.directive,
      blocked: violation.blocked,
      path: violation.path,
      count,
    }));
  }

  return NO_CONTENT();
}
