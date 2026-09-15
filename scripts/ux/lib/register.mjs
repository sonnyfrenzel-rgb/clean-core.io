import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * The UX register: every finding Claude has verified and decided on, and where
 * it went in the roadmap. Plain JSON in the repository — UX findings describe
 * screens, not weaknesses, and the roadmap table is derived from it. Anything
 * security-relevant never gets here: the brief keeps it out of UX findings.
 */

export const REGISTER_PATH = 'docs/ux/register.json';

export const STATUSES = { accepted: 'eingeplant', refuted: 'widerlegt', deferred: 'zurückgestellt', fixed: 'behoben' };

export function loadRegister(path = REGISTER_PATH) {
  if (!existsSync(path)) return { version: 1, entries: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveRegister(register, path = REGISTER_PATH) {
  writeFileSync(path, `${JSON.stringify(register, null, 2)}\n`);
}

export function nextId(register) {
  const n = register.entries.reduce((max, e) => Math.max(max, Number(String(e.id).replace(/^UX-/, '')) || 0), 0) + 1;
  return `UX-${String(n).padStart(3, '0')}`;
}

/** Fingerprints the reviewer must not raise again: refuted with a reason. */
export const refutedEntries = (register) => register.entries.filter((e) => e.status === STATUSES.refuted);

/** Decided findings that stop being carried from report to report. */
export const closedFingerprints = (register) => new Set(register.entries.filter((e) => e.status === STATUSES.refuted || e.status === STATUSES.fixed).map((e) => e.fingerprint));

/**
 * Findings not decided yet — plus those marked fixed that a review of a commit
 * containing the fix reports again, the same rule as the security register.
 */
export function untriaged(findings, register, { head, isAncestorOf } = {}) {
  const byFingerprint = new Map(register.entries.map((e) => [e.fingerprint, e]));
  return findings.flatMap((f) => {
    const entry = byFingerprint.get(f.fingerprint);
    if (!entry) return [f];
    const back = entry.status === STATUSES.fixed && (!entry.fixedIn || !head || !isAncestorOf || isAncestorOf(entry.fixedIn, head));
    return back ? [{ ...f, reopened: true }] : [];
  });
}

/** The rows of the roadmap table (docs/ROADMAP.md §13). */
export function roadmapRows(register) {
  const order = ['critical', 'high', 'medium', 'low'];
  return register.entries
    .filter((e) => e.status !== STATUSES.refuted)
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.id.localeCompare(b.id))
    .map((e) => `| ${e.id} | ${e.severity} | ${String(e.title).replace(/\|/g, '/')} | ${e.step || '—'} | ${e.status} |`);
}
