import { createHash } from 'node:crypto';
import { SEVERITIES } from './config.mjs';

/**
 * From model answers to the report Claude verifies and the owner reads — and
 * that the next review continues from.
 */

const normalizeTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

/** Stable while the place and the gist of the title stay; line numbers, viewports and scroll segments are not part of it. */
export function fingerprint(f) {
  const loc = f.location || {};
  const anchor = loc.file || String(loc.screenshot || '').replace(/-(desktop|phone|dark)(-s\d)?$/, '') || loc.route || f.area || '';
  return createHash('sha256').update(`${anchor}|${normalizeTitle(f.title)}`).digest('hex').slice(0, 12);
}

const worst = (a, b) => (SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(b) ? a : b);
const HEALTH = ['poor', 'needs_attention', 'good'];
const STATUS_RANK = { not_touched: 0, resolved: 1, still_open: 2 };

/** The rating can be more worried than the model, never less: a critical finding is never "good". */
export function healthOf(findings, stated) {
  const floor = findings.some((f) => f.severity === 'critical') ? 'poor' : findings.some((f) => f.severity === 'high') ? 'needs_attention' : 'good';
  return [floor, ...stated.filter((h) => HEALTH.includes(h))].sort((a, b) => HEALTH.indexOf(a) - HEALTH.indexOf(b))[0];
}

/**
 * @param results    area or delta calls: [{ review, batch: { area, title, part, files }, shots: [names] }]
 * @param synthesis  the end-to-end call of a full audit, or null
 * @param previous   the report this one continues from (delta only)
 * @param closed     (finding) => boolean — closed by a register decision made after it was raised (register.closedBy)
 */
export function buildReport({ mode, range, results, synthesis = null, previous = null, closed = () => false, notReviewed = [], baseline = null, meta = {} }) {
  const createdAt = new Date().toISOString();
  const byFp = new Map();
  const add = (raw, area) => {
    const f = { ...raw, area, fingerprint: fingerprint({ ...raw, area }), origin: range.head, raisedAt: createdAt };
    const seen = byFp.get(f.fingerprint);
    byFp.set(f.fingerprint, seen ? { ...seen, severity: worst(seen.severity, f.severity), evidence: `${seen.evidence}\n${f.evidence}` } : f);
  };
  for (const { review, batch } of results) for (const f of review.findings) add(f, batch?.area || 'release');
  if (synthesis) for (const f of synthesis.review.findings) add(f, 'gesamt');

  // Carried forward only in a delta: a full audit is a new baseline.
  const resolved = [];
  if (mode === 'delta' && previous) {
    const statuses = new Map();
    for (const { review } of results) {
      for (const s of review.previous_findings) {
        const seen = statuses.get(s.fingerprint);
        if (!seen || STATUS_RANK[s.status] > STATUS_RANK[seen.status]) statuses.set(s.fingerprint, s);
      }
    }
    for (const old of previous.findings || []) {
      if (closed(old) || byFp.has(old.fingerprint)) continue;
      const s = statuses.get(old.fingerprint);
      if (s?.status === 'resolved') resolved.push({ ...old, resolution: s.reason });
      else byFp.set(old.fingerprint, { ...old, carried: true, carriedReason: s?.reason || 'in dieser Review nicht erwähnt' });
    }
  }

  const findings = [...byFp.values()].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || String(a.area).localeCompare(String(b.area)));
  const reviews = [...results.map((r) => r.review), ...(synthesis ? [synthesis.review] : [])];
  const incomplete = notReviewed.length > 0 || (mode === 'full' && !synthesis);
  const selfTest = mode === 'self-test';

  return {
    version: 1,
    agent: 'ux',
    mode,
    range: { ...range, checkpoint: selfTest ? null : incomplete ? range.base : range.head },
    createdAt,
    meta,
    incomplete,
    // The complete full review this one builds on, carried forward so it never falls out of the fetched window.
    baseline: mode === 'full' && !incomplete ? { head: range.head, createdAt } : baseline,
    ux_health: healthOf(findings, synthesis ? [synthesis.review.ux_health] : reviews.map((r) => r.ux_health)),
    summary: synthesis ? synthesis.review.summary : results.map((r) => r.review.summary).filter(Boolean).join('\n\n'),
    findings,
    resolved,
    consistency: synthesis ? synthesis.review.consistency : results.flatMap((r) => r.review.consistency),
    areaConsistency: synthesis ? results.map((r) => ({ area: r.batch?.area, part: r.batch?.part || null, items: r.review.consistency })) : [],
    design_decisions: reviews.flatMap((r) => r.design_decisions),
    new_features: results.flatMap((r) => r.review.new_features),
    strengths: [...new Set(reviews.flatMap((r) => r.strengths))],
    priorities: synthesis ? synthesis.review.priorities : [],
    coverage: {
      reviewed: results.flatMap((r) => r.batch?.files || []),
      notReviewed,
      screenshots: [...new Set([...results, ...(synthesis ? [synthesis] : [])].flatMap((r) => r.shots || []))],
      notes: reviews.map((r) => r.coverage_notes).filter(Boolean).join(' '),
    },
  };
}

/** What the public Actions log may say: that it ran, in which mode, and what it cost. Not the rating, not the counts. */
export function publicSummary(report) {
  return { head: report.range.head.slice(0, 12), mode: report.mode, status: 'completed, sealed', modelCalls: report.meta?.modelCalls ?? 0, costUsd: report.meta?.costUsd ?? 'unknown' };
}

export function actualCost(usages) {
  if (!usages.every((u) => typeof u?.cost === 'number')) return null;
  return Number(usages.reduce((n, u) => n + u.cost, 0).toFixed(4));
}

const DE = { critical: 'kritisch', high: 'hoch', medium: 'mittel', low: 'niedrig' };
const where = (f) => [f.location?.file && `${f.location.file}:${f.location.line}`, f.location?.route, f.location?.screenshot].filter(Boolean).join(' · ') || '—';

/** The report as text for the maintainer and for Claude's verification. */
export function renderText(report, { untriaged = null } = {}) {
  const counts = SEVERITIES.map((s) => `${report.findings.filter((f) => f.severity === s).length} ${DE[s]}`).join(', ');
  const open = untriaged ? new Set(untriaged.map((f) => f.fingerprint)) : null;
  const L = [
    `UX-Review ${report.range.head.slice(0, 12)} (${report.mode}${report.incomplete ? ', unvollständig' : ''}) — UX-Gesundheit ${report.ux_health} — ${counts} — Kosten $${report.meta?.costUsd ?? 'unbekannt'} (${report.meta?.modelCalls ?? 0} Aufrufe)`,
    '',
    report.summary,
  ];
  if (report.priorities.length) {
    L.push('', 'PRIORITÄTEN');
    for (const p of report.priorities) L.push(`${p.rank}. ${p.change} [${p.fingerprints.join(', ')}] — ${p.why}`);
  }
  L.push('', 'BEFUNDE');
  for (const f of report.findings) {
    L.push(
      '',
      `[${f.fingerprint}] ${DE[f.severity].toUpperCase()} ${f.category} · ${f.area} · ${where(f)}${f.carried ? ' · übernommen' : ''}${open && !open.has(f.fingerprint) ? ' · entschieden' : ''}`,
      `  ${f.title}`,
      `  Beobachtung: ${f.observation}`,
      `  Wirkung: ${f.user_impact}`,
      `  Beleg: ${f.evidence}`,
      `  Empfehlung: ${f.recommendation} (Aufwand ${f.effort}, Roadmap ${f.roadmap_hint}, Sicherheit ${f.confidence})`,
    );
  }
  if (report.consistency.length) {
    L.push('', 'KONSISTENZ');
    for (const c of report.consistency) L.push(`- ${c.dimension}: ${c.status} — ${c.evidence} → ${c.recommendation}`);
  }
  if (report.design_decisions.length) {
    L.push('', 'DESIGN-ENTSCHEIDUNGEN');
    for (const d of report.design_decisions) L.push(`- ${d.decision}\n  Frage: ${d.question}\n  Alternativen: ${d.alternatives}\n  Empfehlung: ${d.recommendation}`);
  }
  if (report.new_features.length) {
    L.push('', 'FEATURES AUS NUTZERSICHT');
    for (const n of report.new_features) L.push(`- ${n.feature}: ${n.user_view}${n.gaps ? ` — Lücken: ${n.gaps}` : ''}`);
  }
  if (report.strengths.length) L.push('', 'STÄRKEN', ...report.strengths.map((s) => `- ${s}`));
  if (report.resolved.length) L.push('', `ERLEDIGT SEIT DER LETZTEN REVIEW: ${report.resolved.map((r) => r.fingerprint).join(', ')}`);
  L.push(
    '',
    'ABDECKUNG',
    `${report.coverage.reviewed.length} Dateien gelesen, ${report.coverage.screenshots.length} Screenshots angesehen.`,
    ...report.coverage.notReviewed.map((n) => `Nicht gelesen: ${n.path} — ${n.reason}`),
    report.coverage.notes,
  );
  return L.filter((l) => l !== undefined).join('\n');
}
