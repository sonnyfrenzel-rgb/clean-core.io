/**
 * The delivery package, checked against its signed run — 3.0.21, acceptance test T08.
 *
 * The privacy notice says that the offline verifier establishes whether the
 * files of a delivery package are unchanged against the package's manifest,
 * and which model took part. The delivery package is not signed — it
 * is assembled in the browser from what the project stores — so the check is
 * the chain that exists, link by link, and says which link it stands on:
 *
 *   1. **Contents.** Every file is the file `manifest.json` lists (SHA-256 of
 *      its bytes), nothing is missing, nothing unlisted, no path twice.
 *   2. **Markings.** Every file a statement of `aiGeneration` names carries
 *      that statement as its header comment (unless its format has no comments
 *      and the manifest says so in `withoutHeader`); from manifest version 2
 *      every row of `files` names the same source in its `ai` field. A file that mixes the engine's parts with a
 *      model's marks each model-written element where it stands (the cc:origin comment pair in Markdown,
 *      `data-origin` in HTML, `cc:origin` in BPMN, a tagged content control in Word — `aiOriginMarksIn`); the
 *      check lists those per file, with provider and model, and fails a file that carries such marks while no
 *      statement names it as model-written.
 *   3. **The signed run** (only with a verified audit pack): the package names
 *      the pack's run, its source digest is the one the pack signed in
 *      `01-input-fingerprint.json`, and where both name the analysis
 *      narrative's model they name the same one.
 *
 * The best verdict is `names-signed-run`, and it says no more than was checked:
 * the package is consistent with its own manifest, and that manifest names the
 * run and the source the authentic pack signed. The audit pack's signature does
 * not cover the package's files or its manifest — the pack is built on the
 * server from the run, the package in the browser from the project later — so
 * nothing here shows that the files themselves come from that run, and the
 * verdict never says they do.
 *
 * Which model took part comes from two places, said apart: the narrative's
 * model from the audit pack's signed `aiGeneration`, and the package's own
 * statement for every file it lists. The package's statement is the
 * manifest's — the files carry it, the hashes hold it to the files, but no
 * signature stands behind it, and the verdict says so.
 *
 * `scripts/verify-pack.mjs --package` repeats this check without a build;
 * `tests/ai-origin-marking-3021.spec.ts` holds the two to the same verdicts.
 * Version-1 manifests (before 3.0.21) are read as they are: their files carry
 * no `ai` field, and the markings are checked from `aiGeneration` alone.
 */

import JSZip from 'jszip';
import { PACK_LIMITS, archiveEntryLimitDefect, duplicateEntryNames, readEntryBounded, type VerifyResult } from './audit-pack-verify';
import { aiMarkingOf, aiOriginMarksIn } from './ai-marking';

/** `DELIVERY_MANIFEST_FORMAT` of `lib/delivery-package.ts` — repeated, so the verification page need not load the package builder. */
export const DELIVERY_FORMAT = 'clean-core-delivery-manifest';

/** The file of an audit pack that carries the signed source digest. */
export const INPUT_FINGERPRINT_FILE = '01-input-fingerprint.json';

/** What a verified audit pack says about its run — the facts the package is held against. */
export interface SignedRunFacts {
  /** True only when the pack verified as authentic (`VerifyResult.success`). */
  authentic: boolean;
  runId: string | null;
  /** SHA-256 of the source the run analysed, from the pack's signed `01-input-fingerprint.json`. */
  sourceSha256: string | null;
  /** The signed AI marking of the run's narrative: provider and model, or null when the pack carries none. */
  narrative: { statement: string | null; provider: string | null; model: string | null } | null;
}

/** One model-written source of the package, as its manifest states it. */
export interface DeliveryModelRow {
  source: string;
  statement: string;
  provider: string | null;
  model: string | null;
  keyOwner: string | null;
  files: string[];
}

/** The model-written elements one file marks where they stand, counted per provider and model. */
export interface DeliveryElementOrigins {
  path: string;
  /** The source the manifest names for the file, or null when none does. */
  source: string | null;
  marks: Array<{ provider: string; model: string; count: number }>;
}

/** Per-element marks grouped by provider and model, in order of first appearance. */
export function groupOriginMarks(text: string): DeliveryElementOrigins['marks'] {
  const out: DeliveryElementOrigins['marks'] = [];
  for (const m of aiOriginMarksIn(text)) {
    const row = out.find((r) => r.provider === m.provider && r.model === m.model);
    if (row) row.count += 1;
    else out.push({ provider: m.provider, model: m.model, count: 1 });
  }
  return out;
}

export interface DeliveryCheck {
  /** False when the archive's manifest is not a delivery manifest at all. */
  isDeliveryPackage: boolean;
  version: number | null;
  /** Files listed in the manifest. */
  files: number;
  missing: string[];
  altered: string[];
  unlisted: string[];
  duplicates: string[];
  /** Files a statement names whose header comment is missing or another statement. */
  headerMismatch: string[];
  /** Version 2: files whose `ai` field disagrees with the statement that names them. */
  sourceMismatch: string[];
  /** Files that mark model-written elements where they stand, with provider and model per mark. */
  elements: DeliveryElementOrigins[];
  /** Files that mark model-written elements although no statement of the manifest names them. */
  unstatedElements: string[];
  run: { id: string | null; sourceSha256: string | null; matchesSignedRun: boolean };
  /** Every model-written source and the files it wrote; empty when no model wrote a file of the package. */
  models: DeliveryModelRow[];
  /** The comparison with a signed run, or null when none was given. */
  against: { packAuthentic: boolean; runMatches: boolean; sourceMatches: boolean; narrativeMatches: boolean | null } | null;
  verdict: 'names-signed-run' | 'consistent' | 'failed';
  problems: string[];
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

async function loadZip(data: Blob | Uint8Array | ArrayBuffer): Promise<{ zip: JSZip; bytes: ArrayBuffer | Uint8Array }> {
  const declared = (data as { size?: unknown }).size;
  if (typeof declared === 'number' && declared > PACK_LIMITS.archiveBytes) throw new Error('The archive is larger than a package may be.');
  const bytes = typeof (data as Blob).arrayBuffer === 'function' ? await (data as Blob).arrayBuffer() : (data as ArrayBuffer | Uint8Array);
  if (bytes.byteLength > PACK_LIMITS.archiveBytes) throw new Error('The archive is larger than a package may be.');
  const defect = archiveEntryLimitDefect(bytes);
  if (defect) throw new Error(defect);
  return { zip: await JSZip.loadAsync(bytes), bytes };
}

/**
 * The facts of a verified audit pack the package is held against: its run, the
 * signed source digest and the narrative's model. The fingerprint file is read
 * only when its bytes are the ones the manifest lists — a pack whose files did
 * not verify gives no digest.
 */
export async function signedRunFactsOf(auditPack: Blob | Uint8Array | ArrayBuffer, result: VerifyResult): Promise<SignedRunFacts> {
  const m = result.manifest;
  const ai = m?.aiGeneration ?? null;
  let sourceSha256: string | null = null;
  const listed = m?.files?.find((f) => f.path === INPUT_FINGERPRINT_FILE);
  if (listed) {
    const { zip } = await loadZip(auditPack);
    const entry = zip.file(INPUT_FINGERPRINT_FILE);
    if (entry) {
      const bytes = await readEntryBounded(entry, { remaining: PACK_LIMITS.totalBytes });
      if ((await sha256Hex(bytes)) === listed.sha256) {
        try {
          sourceSha256 = str((JSON.parse(new TextDecoder().decode(bytes)) as { sha256?: unknown }).sha256);
        } catch {
          sourceSha256 = null;
        }
      }
    }
  }
  return {
    authentic: result.success,
    runId: str(m?.runId),
    sourceSha256,
    narrative: ai ? { statement: ai.statement, provider: ai.provider, model: ai.model } : null,
  };
}

/** The package checked against its manifest and, when given, against a signed run. */
export async function checkDeliveryPackage(data: Blob | Uint8Array | ArrayBuffer, signed: SignedRunFacts | null = null): Promise<DeliveryCheck> {
  const { zip, bytes } = await loadZip(data);
  const budget = { remaining: PACK_LIMITS.totalBytes };
  const problems: string[] = [];
  const empty: DeliveryCheck = {
    isDeliveryPackage: false, version: null, files: 0, missing: [], altered: [], unlisted: [], duplicates: [], headerMismatch: [], sourceMismatch: [], elements: [], unstatedElements: [],
    run: { id: null, sourceSha256: null, matchesSignedRun: false }, models: [], against: null, verdict: 'failed', problems,
  };
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    problems.push('The archive has no manifest.json.');
    return empty;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(await readEntryBounded(manifestEntry, budget))) as Record<string, unknown>;
  } catch {
    problems.push('manifest.json is not JSON.');
    return empty;
  }
  if (manifest.format !== DELIVERY_FORMAT) {
    problems.push('manifest.json is not the manifest of a Clean-Core.io delivery package.');
    return empty;
  }
  const version = typeof manifest.version === 'number' ? manifest.version : null;
  const rows = Array.isArray(manifest.files) ? (manifest.files as Array<Record<string, unknown>>) : [];

  // 1. Contents.
  const missing: string[] = [];
  const altered: string[] = [];
  const text = new Map<string, string>();
  const whole = new Map<string, string>();
  for (const row of rows) {
    const path = String(row.path ?? '');
    const entry = zip.file(path);
    if (!entry) {
      missing.push(path);
      continue;
    }
    const content = await readEntryBounded(entry, budget);
    if ((await sha256Hex(content)) !== row.sha256) altered.push(path);
    text.set(path, new TextDecoder().decode(content.subarray(0, 4096)));
    whole.set(path, new TextDecoder().decode(content));
  }
  const listed = new Set(rows.map((r) => String(r.path ?? '')));
  const unlisted = Object.values(zip.files).filter((e) => !e.dir && e.name !== 'manifest.json' && !listed.has(e.name)).map((e) => e.name).sort();
  const names = duplicateEntryNames(bytes);
  const duplicates = [...names.duplicates];
  if (!names.counted) problems.push(`The archive's entry list could not be read, so duplicate paths were not checked: ${names.why ?? ''}`);

  // 2. Markings.
  const ai = manifest.aiGeneration && typeof manifest.aiGeneration === 'object' ? (manifest.aiGeneration as { statements?: unknown }) : null;
  const statements = Array.isArray(ai?.statements) ? (ai!.statements as Array<Record<string, unknown>>) : [];
  const models: DeliveryModelRow[] = [];
  const headerMismatch: string[] = [];
  const sourceOf = new Map<string, string>();
  for (const st of statements) {
    const files = Array.isArray(st.files) ? (st.files as unknown[]).map(String) : [];
    const without = new Set(Array.isArray(st.withoutHeader) ? (st.withoutHeader as unknown[]).map(String) : []);
    const statement = String(st.statement ?? '');
    models.push({ source: String(st.source ?? ''), statement, provider: str(st.provider), model: str(st.model), keyOwner: str(st.keyOwner), files });
    for (const path of files) {
      sourceOf.set(path, String(st.source ?? ''));
      if (without.has(path) || !text.has(path)) continue;
      if (aiMarkingOf(text.get(path) as string) !== statement) headerMismatch.push(path);
    }
  }
  const sourceMismatch: string[] = [];
  if (version !== null && version >= 2) {
    for (const row of rows) {
      const path = String(row.path ?? '');
      const stated = row.ai === undefined ? undefined : row.ai === null ? null : String(row.ai);
      if (stated !== (sourceOf.get(path) ?? null)) sourceMismatch.push(path);
    }
  }

  // Per element: what each file marks where it stands, and that the manifest names every such file as model-written.
  const elements: DeliveryElementOrigins[] = [];
  const unstatedElements: string[] = [];
  for (const [path, content] of whole) {
    const marks = groupOriginMarks(content);
    if (!marks.length) continue;
    const source = sourceOf.get(path) ?? null;
    elements.push({ path, source, marks });
    if (source === null) unstatedElements.push(path);
  }
  if (unstatedElements.length) problems.push(`Files mark model-written elements, but the manifest names them as written by no model: ${unstatedElements.join(', ')}.`);

  // 3. The signed run.
  const runRow = (manifest.run ?? {}) as Record<string, unknown>;
  const sourceRow = (manifest.source ?? {}) as Record<string, unknown>;
  const run = { id: str(runRow.id), sourceSha256: str(sourceRow.sha256), matchesSignedRun: sourceRow.matchesSignedRun === true };
  let against: DeliveryCheck['against'] = null;
  if (signed) {
    const analysis = models.find((m) => m.source === 'analysis');
    const narrativeMatches = analysis && signed.narrative && signed.narrative.statement
      ? analysis.provider === signed.narrative.provider && analysis.model === signed.narrative.model
      : null;
    against = {
      packAuthentic: signed.authentic,
      runMatches: run.id !== null && run.id === signed.runId,
      sourceMatches: run.sourceSha256 !== null && run.sourceSha256 === signed.sourceSha256,
      narrativeMatches,
    };
    if (!signed.authentic) problems.push('The audit pack did not verify as authentic, so the package is not checked against a signed run.');
    if (!against.runMatches) problems.push('The package names another run than the audit pack, or none.');
    if (!against.sourceMatches) problems.push('The package was built from another source than the one the audit pack signed, or names none.');
    if (narrativeMatches === false) problems.push('The package names another model for the analysis narrative than the audit pack signed.');
  }

  const contentsOk = missing.length === 0 && altered.length === 0 && unlisted.length === 0 && duplicates.length === 0 && names.counted;
  const markingsOk = headerMismatch.length === 0 && sourceMismatch.length === 0 && unstatedElements.length === 0;
  const runOk = against !== null && against.runMatches && against.sourceMatches && against.narrativeMatches !== false;
  const verdict: DeliveryCheck['verdict'] = !contentsOk || !markingsOk || (against !== null && !runOk && against.packAuthentic)
    ? 'failed'
    : against && against.packAuthentic && runOk
      ? 'names-signed-run'
      : 'consistent';
  return {
    isDeliveryPackage: true, version, files: rows.length, missing, altered, unlisted, duplicates, headerMismatch, sourceMismatch,
    elements, unstatedElements, run, models, against, verdict, problems,
  };
}

/** The verdict in one sentence — what the page shows and the command-line verifier prints. */
export function deliveryVerdictHeadline(c: Pick<DeliveryCheck, 'verdict' | 'isDeliveryPackage'>): string {
  if (!c.isDeliveryPackage) return 'Not a Clean-Core.io delivery package.';
  if (c.verdict === 'names-signed-run') {
    return "The package matches its own manifest, and the manifest names the run and the source the audit pack signed. The package itself is not signed: the audit pack's signature does not cover its files, so this does not show that they come from that run.";
  }
  if (c.verdict === 'consistent') return 'The package matches its own manifest; it has not been checked against a signed audit pack.';
  return 'The package does not match its manifest or the signed run.';
}
