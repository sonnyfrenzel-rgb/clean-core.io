/**
 * What the Delivery page may say about the audit-pack seal right after a
 * download, decided from the project document it read back from the server.
 * Pure, no imports, so it is tested without a server
 * (`tests/audit-pack-seal.spec.ts`).
 *
 * The route records the seal only while the run it packed is still the active
 * one. The page used to compare the stored run id with the run it displays and
 * nothing else, and to read a failed read as "the run is no longer active". Now:
 *
 * - `unconfirmed` — the read failed; nothing is claimed about the run.
 * - `not-sealed` — the server's active run is not the one on the page, or it
 *   holds no seal for that run.
 * - `sealed-now` — the seal belongs to the displayed, still active run and was
 *   written at or after the download started.
 * - `sealed-earlier` — a seal for that run, but one that predates this download
 *   (or is the one the page already showed): this download did not make it.
 */

export type AuditPackSealState =
  | { kind: 'unconfirmed' }
  | { kind: 'not-sealed' }
  | { kind: 'sealed-now'; auditPackExportedAt: string; auditPackExportedRunId: string }
  | { kind: 'sealed-earlier'; auditPackExportedAt: string; auditPackExportedRunId: string };

export interface AuditPackSealInput {
  /** The project document's data as read from the server; `null` when it does not exist. */
  doc: { activeRunId?: unknown; auditMetadata?: unknown } | null;
  /** The read itself failed (network, permission, offline). */
  readFailed: boolean;
  /** The run the page displays and the pack was made from. */
  displayedRunId: string | null;
  /** When the download started, in epoch milliseconds (client clock). */
  downloadStartedAt: number;
  /** The seal the page showed before the download, if any. */
  previousExportedAt?: string | null;
}

/**
 * The server stamps the seal with its own clock, the page starts the download
 * with the browser's. This much skew is forgiven before a seal counts as older
 * than the download; a seal identical to the one already shown never counts as
 * this download's, whatever the clocks say.
 */
export const SEAL_CLOCK_SKEW_MS = 2 * 60 * 1000;

export function auditPackSealState(input: AuditPackSealInput): AuditPackSealState {
  if (input.readFailed) return { kind: 'unconfirmed' };
  const runId = input.displayedRunId;
  if (!input.doc || !runId) return { kind: 'not-sealed' };
  if (input.doc.activeRunId !== runId) return { kind: 'not-sealed' };

  const meta = (input.doc.auditMetadata ?? {}) as { auditPackExportedAt?: unknown; auditPackExportedRunId?: unknown };
  const at = meta.auditPackExportedAt;
  if (typeof at !== 'string' || !at || meta.auditPackExportedRunId !== runId) return { kind: 'not-sealed' };
  const sealedAt = Date.parse(at);
  if (Number.isNaN(sealedAt)) return { kind: 'not-sealed' };

  const seal = { auditPackExportedAt: at, auditPackExportedRunId: runId };
  const fresh = sealedAt >= input.downloadStartedAt - SEAL_CLOCK_SKEW_MS && at !== (input.previousExportedAt ?? null);
  return fresh ? { kind: 'sealed-now', ...seal } : { kind: 'sealed-earlier', ...seal };
}
