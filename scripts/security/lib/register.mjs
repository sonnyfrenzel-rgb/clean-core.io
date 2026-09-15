import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { openWith, PUBLIC_KEY_PATH, sealFor } from './envelope.mjs';

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
  writeFileSync(path, `${JSON.stringify(sealFor(register, readFileSync(PUBLIC_KEY_PATH, 'utf8')))}\n`);
}

/** Findings of a report the register has not decided on yet. */
export function untriaged(findings, register) {
  const known = new Set(register.entries.map((e) => e.fingerprint));
  return findings.filter((f) => !known.has(f.fingerprint));
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
