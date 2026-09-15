import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openWith, AUDIT_PUBLIC_PEM, sealFor } from './envelope.mjs';

/**
 * The security register: every audit finding the maintainer has triaged, with
 * its decision. Committed sealed to the public key — only the private key opens
 * it — because an accepted-but-unfixed finding is precisely what must not be
 * readable in a public repository.
 *
 * What may be public is derived from it (`publicRows`): ID, severity, priority,
 * roadmap step, status. Never the title, the file or the description.
 */

export const REGISTER_PATH = 'docs/security/register.enc.json';

export function loadRegister(privateKey, path = REGISTER_PATH) {
  if (!existsSync(path)) return { version: 1, entries: [] };
  return openWith(JSON.parse(readFileSync(path, 'utf8')), privateKey);
}

export function saveRegister(register, path = REGISTER_PATH) {
  writeFileSync(path, `${JSON.stringify(sealFor(register, readFileSync(AUDIT_PUBLIC_PEM, 'utf8')))}\n`);
}

/**
 * Findings of a report the register has not decided on yet — and findings marked
 * fixed that an audit of a commit containing the fix reports again. Without that,
 * a reintroduced defect stays silent behind its old decision (QA review of
 * 52b34aba4cb8, finding cf4293a0d91a). An audit of a commit that does not contain
 * the fix yet is expected to still report it.
 *
 * @param head          the audited commit
 * @param isAncestorOf  (fixCommit, head) => boolean
 */
export function untriaged(findings, register, { head, isAncestorOf } = {}) {
  const byFingerprint = new Map(register.entries.map((e) => [e.fingerprint, e]));
  return findings.flatMap((f) => {
    const entry = byFingerprint.get(f.fingerprint);
    if (!entry) return [f];
    const reported = entry.status === 'behoben' && (!entry.fixedIn || !head || !isAncestorOf || isAncestorOf(entry.fixedIn, head));
    return reported ? [{ ...f, reopened: true }] : [];
  });
}

export function nextId(register, year = new Date().getFullYear()) {
  const n = register.entries.filter((e) => e.id.startsWith(`SEC-${year}-`)).length + 1;
  return `SEC-${year}-${String(n).padStart(3, '0')}`;
}

export const STATUSES = ['eingeplant', 'widerlegt', 'behoben', 'akzeptiertes Risiko'];

/** The rows the public roadmap may show. */
export function publicRows(register) {
  return register.entries
    .filter((e) => e.status !== 'widerlegt')
    .map((e) => `| ${e.id} | ${e.severity} | ${e.priority || '—'} | ${e.step || '—'} | ${e.status} |`);
}
