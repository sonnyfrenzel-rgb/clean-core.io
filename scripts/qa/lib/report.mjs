import { createHash } from 'node:crypto';
import { BLOCKING_SEVERITIES, isAgentInfrastructure, SEVERITIES } from './config.mjs';

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
 * Merge the batches of one review, drop carried findings that were refuted, and
 * carry the previous review's other open findings forward unless this delta
 * resolved them.
 *
 * A finding the model does not mention again is carried, not forgotten: an open
 * bug in a file nobody touched is still open.
 */
/**
 * A refutation covers the instance it was written about — a finding raised
 * before it — and nothing raised later. Without the time bound, a regression
 * re-raised after a refutation would survive one review and vanish on the next
 * push (QA reviews of 221f2d11768c and 2f9b128bafd4).
 */
export function isSuppressed(finding, refuted) {
  return refuted.some((r) => r.fingerprint === finding.fingerprint && (!finding.raisedAt || String(r.refutedAt) >= String(finding.raisedAt)));
}

export function buildReport({ range, results, previous, refuted, notReviewed, triage, meta }) {
  const refutedSet = new Set(refuted.map((r) => r.fingerprint));
  const createdAt = new Date().toISOString();
  const byFp = new Map();

  for (const { review } of results) {
    for (const raw of review.findings || []) {
      // The reviewer is told not to raise a refuted finding again unless the
      // delta invalidates the refutation. One it raises anyway is kept and
      // marked — silently dropping it would let a regression that removed the
      // very guard behind the refutation pass unseen.
      const f = { ...raw, fingerprint: fingerprint(raw), origin: range.head, raisedAt: createdAt, ...(refutedSet.has(fingerprint(raw)) ? { reRaisedAfterRefutation: true } : {}) };
      const seen = byFp.get(f.fingerprint);
      byFp.set(f.fingerprint, seen ? { ...seen, severity: worst(seen.severity, f.severity) } : f);
    }
  }

  // Every batch sees the whole list of open findings but only its own files, so
  // "not_touched" from one batch must not overwrite what another batch judged.
  // Between two judgements, "still_open" wins: a fix is confirmed, never assumed.
  const RANK = { not_touched: 0, resolved: 1, still_open: 2 };
  const statuses = new Map();
  for (const { review } of results) {
    for (const s of review.previous_findings || []) {
      const seen = statuses.get(s.fingerprint);
      if (!seen || (RANK[s.status] ?? 0) > (RANK[seen.status] ?? 0)) statuses.set(s.fingerprint, s);
    }
  }

  const resolved = [];
  for (const old of previous?.findings || []) {
    if (isSuppressed(old, refuted) || byFp.has(old.fingerprint)) continue;
    const s = statuses.get(old.fingerprint);
    if (s?.status === 'resolved') resolved.push({ ...old, resolution: s.reason });
    else byFp.set(old.fingerprint, { ...old, carried: true, carriedReason: s?.reason || 'not mentioned by this review' });
  }

  const findings = [...byFp.values()].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.file.localeCompare(b.file));
  const verdict = results.map((r) => r.review.verdict).sort((a, b) => VERDICT_ORDER.indexOf(a) - VERDICT_ORDER.indexOf(b))[0] || 'go';

  // Code that was not read is not reviewed. Such a report is incomplete: it
  // cannot be a clean go, and its checkpoint stays at the base, so the next
  // review reads the omitted code again instead of starting past it.
  const incomplete = notReviewed.length > 0;
  const downgraded = (findings.some((f) => BLOCKING_SEVERITIES.has(f.severity)) || incomplete) && verdict === 'go' ? 'go_with_notes' : verdict;

  return {
    version: 1,
    range: { ...range, checkpoint: incomplete ? range.base : range.head },
    createdAt,
    meta,
    incomplete,
    verdict: downgraded,
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
    costUsd: report.meta?.costUsd ?? 'unknown',
  };
}

/** The sum of what OpenRouter reported, or null when any call did not report its cost — an unknown is never a zero. */
export function actualCost(usages) {
  if (!usages.every((u) => typeof u?.cost === 'number')) return null;
  return Number(usages.reduce((n, u) => n + u.cost, 0).toFixed(4));
}

export function severityCounts(report) {
  return Object.fromEntries(SEVERITIES.map((s) => [s, report.findings.filter((f) => f.severity === s).length]));
}

/** Critical and high block everywhere; medium blocks except on the agents' own machinery (config.mjs AGENT_INFRASTRUCTURE). */
export const blocks = (f) => BLOCKING_SEVERITIES.has(f.severity) && !(f.severity === 'medium' && isAgentInfrastructure(f.file));

export const isBlocking = (report) => report.findings.some(blocks);

/** The loop stays open for blocking findings and for a review that did not read all of its delta. */
export const needsAnotherRound = (report) => isBlocking(report) || Boolean(report.incomplete);

/** The maintainer's view, printed locally after decryption. Short by design: file:line, what breaks, what to do. */
export function renderText(report) {
  const lines = [];
  const counts = severityCounts(report);
  lines.push(
    `QA review ${report.range.head.slice(0, 12)} — verdict ${report.verdict} — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')} — resolved ${report.resolved.length} — cost $${report.meta?.costUsd ?? 'unknown'} (${report.meta?.modelCalls ?? 0} calls, effort ${report.meta?.effort ?? '—'})`,
  );
  if (report.meta?.skipped) lines.push(`No model call: ${report.meta.skipped}`);
  if (report.coverage.notReviewed.length) lines.push(`INCOMPLETE — checkpoint stays at ${String(report.range.checkpoint || 'main').slice(0, 12)}. NOT REVIEWED: ${report.coverage.notReviewed.map((n) => `${n.path} (${n.reason})`).join('; ')}`);
  for (const f of report.findings) {
    lines.push('');
    lines.push(`[${f.fingerprint}] ${f.severity.toUpperCase()} ${f.category} · ${f.file}:${f.line}${f.carried ? ' · carried' : ''}${f.reRaisedAfterRefutation ? ' · RE-RAISED after refutation' : ''}${BLOCKING_SEVERITIES.has(f.severity) && !blocks(f) ? ' · non-blocking (agent infrastructure)' : ''} · confidence ${f.confidence}`);
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
