/**
 * What the head of the object page says about a project before the reader
 * has scrolled — the eyebrow line and the read-access line of mockup s1
 * (`PROJECT · PROCUREMENT · ECC 6.0 EHP8`, "Read access: only you").
 *
 * Pure, so the honesty of both lines is testable without a browser:
 *
 *   - **The eyebrow names only what is on record.** The mockup's domain and
 *     source release are not fields a project carries, so they are not
 *     invented here. What a project does carry is the file its signed run read
 *     and, when the owner declared it, the target edition and release. A
 *     project with neither reads `Project` and nothing more.
 *   - **The read-access line is the server's list.** It is built from the
 *     entries `/api/projects/{id}/readers` returned to the owner — never from
 *     invitations that were only sent — and initials are derived from the
 *     e-mail address the reader signed in with, because that is the only name
 *     the record holds.
 */

import { declaredTargetOf } from '@/lib/assessment-target';
import type { Project } from '@/lib/types';

/** The edition words, as the product names them elsewhere (`lib/architecture-contract.ts`). */
const EDITION_WORDS: Record<string, string> = {
  public: 'S/4HANA Cloud Public Edition',
  private: 'S/4HANA Cloud Private Edition',
};

/** The source file the active run signed, when the record names one. */
export function signedFileName(project: Project | null): string | null {
  const fromRun = (project as { inputFingerprint?: { fileName?: unknown } } | null)?.inputFingerprint?.fileName;
  const fromAudit = project?.auditMetadata?.inputFingerprint?.fileName;
  const name = typeof fromRun === 'string' && fromRun.trim() ? fromRun : fromAudit;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * The parts after "Project" in the eyebrow, in reading order.
 *
 * The edition only when the project stores one: `catalogLookupTargetOf` reads
 * an absent edition as Public for the catalog lookup, which is a rule of that
 * lookup and not something the owner said — the head does not repeat it as if
 * they had.
 */
export function workspaceEyebrow(project: Project | null): string[] {
  const parts: string[] = [];
  const file = signedFileName(project);
  if (file) parts.push(file);
  const edition = typeof project?.s4Deployment === 'string' ? EDITION_WORDS[project.s4Deployment] : undefined;
  if (edition) {
    const release = declaredTargetOf(project).release;
    parts.push(release ? `${edition} ${release}` : edition);
  }
  return parts;
}

/** One or two letters for a reader, from the address the account accepted with. */
export function readerInitials(email: string): string {
  const local = (email.split('@')[0] ?? '').trim();
  const words = local.split(/[._\-+]+/).filter((w) => /[a-z0-9]/i.test(w));
  const letters =
    words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? local).replace(/[^a-z0-9]/gi, '').slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** At most this many initials in the head; the rest is a count. */
export const HEAD_INITIALS = 3;
