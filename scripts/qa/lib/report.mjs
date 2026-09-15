import { createHash } from 'node:crypto';
import { BLOCKING_SEVERITIES, SEVERITIES } from './config.mjs';

/**
 * Turning model output into a report a maintainer can act on — and that the
 * next review can continue from.
 */

const normalizeTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Stable across rounds as long as the file and the gist of the title stay the same; line numbers move, so they are not part of it. */
export function fingerprint(f) {
  return createHash('sha256').update(`${f.file}|${normalizeTitle(f.title)}`).digest('hex').slice(0, 12);
}

const worst = (a, b) => (SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(b) ? a : b);
const VERDICT_ORDER = ['no_go', 'go_with_notes', 'go'];

/**
 * Merge the batches of one review, drop what was refuted before, and carry the
 * previous review's open findings forward unless this delta resolved them.
 *
 * A finding the model does not mention again is carried, not forgotten: an open
 * bug in a file nobody touched is still open.
 */
export function buildReport({ range, results, previous, refuted, notReviewed, triage, meta }) {
  const refutedSet = new Set(refuted.map((r) => r.fingerprint));
  const byFp = new Map();

  for (const { review } of results) {
    for (const raw of review.findings || []) {
      const f = { ...raw, fingerprint: fingerprint(raw), origin: range.head };
      if (refutedSet.has(f.fingerprint)) continue;
      const seen = byFp.get(f.fingerprint);
      byFp.set(f.fingerprint, seen ? { ...seen, severity: worst(seen.severity, f.severity) } : f);
    }
  }

  const statuses = new Map();
  for (const { review } of results) for (const s of review.previous_findings || []) statuses.set(s.fingerprint, s);

  const resolved = [];
  for (const old of previous?.findings || []) {
    if (refutedSet.has(old.fingerprint) || byFp.has(old.fingerprint)) continue;
    const s = statuses.get(old.fingerprint);
    if (s?.status === 'resolved') resolved.push({ ...old, resolution: s.reason });
    else byFp.set(old.fingerprint, { ...old, carried: true, carriedReason: s?.reason || 'not mentioned by this review' });
  }

  const findings = [...byFp.values()].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.file.localeCompare(b.file));
  const verdict = results.map((r) => r.review.verdict).sort((a, b) => VERDICT_ORDER.indexOf(a) - VERDICT_ORDER.indexOf(b))[0] || 'go';

  return {
    version: 1,
    range,
    createdAt: new Date().toISOString(),
    meta,
    verdict: findings.some((f) => BLOCKING_SEVERITIES.has(f.severity)) && verdict === 'go' ? 'go_with_notes' : verdict,
    summary: results.map((r) => r.review.summary).filter(Boolean).join('\n\n'),
    findings,
    resolved,
    acceptance: results.flatMap((r) => r.review.acceptance || []),
    testGaps: results.flatMap((r) => r.review.test_gaps || []),
    coverage: {
      reviewed: results.flatMap((r) => r.files),
      notReviewed,
      notes: results.map((r) => r.review.coverage_notes).filter(Boolean).join(' '),
    },
    triage: { tags: triage.tags, signals: triage.signals, codeWithoutTests: triage.codeWithoutTests },
  };
}

/**
 * What may appear in a public Actions log: that a review ran and what it cost.
 *
 * Deliberately not the verdict and not the counts. The dev service is publicly
 * reachable, and "1 critical on dev" in a public log tells an attacker when to
 * look, which is exactly the signal the sealed artifact exists to withhold.
 */
export function publicSummary(report) {
  return {
    head: report.range.head.slice(0, 12),
    status: 'completed, sealed',
    modelCalls: report.meta?.modelCalls ?? 0,
    costUsd: report.meta?.costUsd ?? 0,
  };
}

export function severityCounts(report) {
  return Object.fromEntries(SEVERITIES.map((s) => [s, report.findings.filter((f) => f.severity === s).length]));
}

export const isBlocking = (report) => report.findings.some((f) => BLOCKING_SEVERITIES.has(f.severity));

/** The maintainer's view, printed locally after decryption. Short by design: file:line, what breaks, what to do. */
export function renderText(report) {
  const lines = [];
  const counts = severityCounts(report);
  lines.push(
    `QA review ${report.range.head.slice(0, 12)} — verdict ${report.verdict} — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')} — resolved ${report.resolved.length} — cost $${report.meta?.costUsd ?? '?'} (${report.meta?.modelCalls ?? 0} calls, effort ${report.meta?.effort ?? '—'})`,
  );
  if (report.meta?.skipped) lines.push(`No model call: ${report.meta.skipped}`);
  if (report.coverage.notReviewed.length) lines.push(`NOT REVIEWED: ${report.coverage.notReviewed.map((n) => `${n.path} (${n.reason})`).join('; ')}`);
  for (const f of report.findings) {
    lines.push('');
    lines.push(`[${f.fingerprint}] ${f.severity.toUpperCase()} ${f.category} · ${f.file}:${f.line}${f.carried ? ' · carried' : ''} · confidence ${f.confidence}`);
    lines.push(`  ${f.title}`);
    lines.push(`  breaks: ${f.failure_scenario}`);
    lines.push(`  evidence: ${f.evidence}`);
    lines.push(`  fix: ${f.suggested_fix}`);
  }
  const unmet = report.acceptance.filter((a) => a.status !== 'met');
  if (unmet.length) {
    lines.push('', 'Acceptance not met or not verifiable:');
    for (const a of unmet) lines.push(`  - ${a.status}: ${a.criterion} — ${a.reason}`);
  }
  if (report.testGaps.length) {
    lines.push('', 'Test gaps:');
    for (const g of report.testGaps) lines.push(`  - ${g.risk}: ${g.area} — ${g.missing_test}`);
  }
  if (report.resolved.length) lines.push('', `Resolved since last review: ${report.resolved.map((r) => r.fingerprint).join(', ')}`);
  return lines.join('\n');
}
