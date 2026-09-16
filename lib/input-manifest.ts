/**
 * What a derivation was computed from — by name, revision and hash.
 *
 * Roadmap 0.5 (`docs/ROADMAP.md` §Phase 0, work package
 * `docs/roadmap/SCHNITT-0-UMFANG.md` §6 `UX-E02-F01:R0`): *"Ableitungen sagen,
 * woraus sie entstanden sind — mit Revision und Hash, nicht mit einer
 * Heuristik"*, and, precisely: *"`inputs[]` je abgeleitetem Artefakt: ID,
 * Revision, Hash (QA24-13) — ersetzt den Digest-Vergleich als Wahrheitsquelle"*.
 *
 * Until now a signed run recorded its inputs in five unrelated fields —
 * `inputFingerprint.sha256`, `analyzerVersion`, `rulesetVersion`,
 * `sapApiCatalogVersion`, `model` — and the only one a reader ever compared was
 * the source digest. A catalog re-sync, a ruleset change or a different
 * deployment target moved the findings and left every earlier result reading as
 * current, because nothing put those inputs and the result in the same
 * sentence. This module is that sentence: one list, one canonical form, one
 * hash, signed with the run and carried in the audit pack.
 *
 * No imports beyond the digest helper, which itself has none: this file is read
 * by the phase contract in the browser and written by the run route on the
 * server, and the producer and the reader must not be able to hash differently.
 *
 * Not a security boundary on its own. It records what the run bound itself to;
 * what the record is *worth* comes from the run's signature over it.
 */

import { sha256Hex } from './artefact-digest';

/**
 * The four data classes of QA24-14 — source artefacts, transaction/test data,
 * derivations and collaboration, secrets and identity.
 *
 * The class is not decoration: roadmap 0.6 reads it to decide what a divergence
 * means. A source artefact that moved invalidates what was derived from it; a
 * derivation that moved (a newer engine, a different narrative model) is
 * recorded and reported, because the evidence was not computed from it.
 */
export const DATA_CLASSES = ['source-artefact', 'transaction-data', 'derivation', 'secret-identity'] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

/**
 * Input classes whose divergence invalidates everything derived from the run.
 * `secret-identity` is here too, but only so an unknown class can never fall
 * through as harmless — a secret is never a recorded input (see `assertNoSecrets`).
 */
const NON_INVALIDATING: ReadonlySet<DataClass> = new Set<DataClass>(['derivation']);

/** How the run held the input when it computed. */
export type InputBinding =
  /** The run read the bytes; `sha256` is their digest. */
  | 'value'
  /**
   * The run held the input by name. `sha256` is the digest of `id@revision`
   * and says which revision was bound — never that the bytes were read. A
   * manifest that hashed a 5 MB catalog it only looked an entry up in would be
   * claiming a check nobody performed.
   */
  | 'reference';

export interface ManifestInput {
  /** Stable identifier, e.g. `source:abap`. Unique within a manifest. */
  id: string;
  /** Which of the four data classes of QA24-14 this input belongs to. */
  dataClass: DataClass;
  /** The revision its producer names. A version string or a content address — never a timestamp. */
  revision: string;
  binding: InputBinding;
  /** Lowercase hex SHA-256. See `InputBinding` for what it covers. */
  sha256: string;
}

export interface InputManifest {
  /** Format of this record. Bumped only when the canonical form changes. */
  manifestVersion: 1;
  /**
   * How often the input set of this project has changed, counting from 1.
   * Re-analysing the same inputs keeps the number; any other change raises it.
   * This is the "Revision" of the workspace meta line (`DESIGN.md` §2.3).
   */
  revision: number;
  /** Sorted by `id`. */
  inputs: ManifestInput[];
  /** SHA-256 over `canonicalInputManifest` — the one value a reader compares. */
  hash: string;
}

/** The input ids this platform records. Written here so producer and reader cannot drift. */
export const INPUT_IDS = {
  /** The ABAP the run analysed. */
  source: 'source:abap',
  /** Public or private cloud — it decides the routing, so it is an input, not a preference. */
  deployment: 'target:s4-deployment',
  /** The merged SAP cloudification / API catalog the findings were looked up in. */
  catalog: 'catalog:sap-api',
  /** The rule set the levels and findings were derived under. */
  ruleset: 'ruleset:clean-core',
  /** The engine build that computed the evidence. */
  engine: 'engine:clean-core-io',
  /** The model that wrote the narrative. It never produced evidence; it is recorded so a pack can name it. */
  model: 'model:narrative',
} as const;

/**
 * Canonical form: one line per input, sorted by id, no whitespace.
 *
 *   <id>|<dataClass>|<binding>|<revision>|<sha256>;
 *
 * Deliberately not JSON. A JSON canonicaliser has to agree about key order,
 * numbers and absent values across two runtimes; this has to agree about a
 * semicolon.
 */
export function canonicalInputManifest(inputs: ReadonlyArray<ManifestInput>): string {
  return [...inputs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => `${i.id}|${i.dataClass}|${i.binding}|${i.revision}|${i.sha256};`)
    .join('');
}

/** The digest of an input the run held by name rather than by value. */
export function referenceDigest(id: string, revision: string): string {
  return sha256Hex(`${id}@${revision}`);
}

/**
 * Secrets and identity are the fourth data class so that the model is complete,
 * not so that they can be listed. A credential's revision and digest in a
 * signed, exportable record is an oracle; nothing may put one here.
 */
function assertNoSecrets(inputs: ReadonlyArray<ManifestInput>): void {
  const secret = inputs.find((i) => i.dataClass === 'secret-identity');
  if (secret) throw new Error(`An input manifest must not record a secret or identity input: ${secret.id}`);
}

/**
 * Build a manifest and decide its revision.
 *
 * `previous` is the manifest this project last recorded. Same inputs keep the
 * revision — re-analysing unchanged code is not a new state of the world — and
 * anything else is the next one.
 */
export function buildInputManifest(
  inputs: ReadonlyArray<ManifestInput>,
  previous?: Pick<InputManifest, 'hash' | 'revision'> | null,
): InputManifest {
  assertNoSecrets(inputs);
  const ids = new Set<string>();
  for (const i of inputs) {
    if (ids.has(i.id)) throw new Error(`Duplicate input id in manifest: ${i.id}`);
    ids.add(i.id);
  }
  const sorted = [...inputs].sort((a, b) => a.id.localeCompare(b.id));
  const hash = sha256Hex(canonicalInputManifest(sorted));
  const prevRevision = typeof previous?.revision === 'number' && previous.revision > 0 ? previous.revision : 0;
  const revision = previous?.hash === hash && prevRevision > 0 ? prevRevision : prevRevision + 1;
  return { manifestVersion: 1, revision, inputs: sorted, hash };
}

/** The inputs of one analysis run, in the order the run acquired them. */
export function analysisRunInputs(args: {
  /** SHA-256 of the analysed source — the run already computed it. */
  sourceSha256: string;
  /** `public` or `private`. */
  deploymentTarget: string;
  catalogVersion: string;
  rulesetVersion: string;
  engineVersion: string;
  /**
   * The model that wrote the narrative, or `null` when none did (roadmap 1.2).
   * A zero-LLM run used to record the default model here anyway, so its
   * manifest named an input the run never had — and the manifest is inside the
   * signed payload, so the signature would have attested to it.
   */
  model: { provider: string; modelId: string; byokUsed: boolean } | null;
}): ManifestInput[] {
  const modelRevision = args.model
    ? `${args.model.provider}/${args.model.modelId}${args.model.byokUsed ? '+byok' : ''}`
    : 'none';
  return [
    {
      id: INPUT_IDS.source,
      dataClass: 'source-artefact',
      // There is no revision store yet (roadmap 3.2), so the content address is
      // the revision. It is stated as one rather than implied by the hash.
      revision: `sha256:${args.sourceSha256.slice(0, 12)}`,
      binding: 'value',
      sha256: args.sourceSha256,
    },
    {
      id: INPUT_IDS.deployment,
      dataClass: 'source-artefact',
      revision: args.deploymentTarget,
      binding: 'value',
      sha256: sha256Hex(args.deploymentTarget),
    },
    {
      id: INPUT_IDS.catalog,
      dataClass: 'source-artefact',
      revision: args.catalogVersion,
      binding: 'reference',
      sha256: referenceDigest(INPUT_IDS.catalog, args.catalogVersion),
    },
    {
      id: INPUT_IDS.ruleset,
      dataClass: 'source-artefact',
      revision: args.rulesetVersion,
      binding: 'reference',
      sha256: referenceDigest(INPUT_IDS.ruleset, args.rulesetVersion),
    },
    {
      id: INPUT_IDS.engine,
      dataClass: 'derivation',
      revision: args.engineVersion,
      binding: 'reference',
      sha256: referenceDigest(INPUT_IDS.engine, args.engineVersion),
    },
    {
      id: INPUT_IDS.model,
      dataClass: 'derivation',
      revision: modelRevision,
      binding: 'reference',
      sha256: referenceDigest(INPUT_IDS.model, modelRevision),
    },
  ];
}

/** Why an input of the active run cannot be shown to still match. */
export interface UnverifiedInput {
  id: string;
  /** `unknown` when the manifest has no entry for an input the reader was asked to check. */
  dataClass: DataClass | 'unknown';
  reason:
    /** The input is there and it is a different one. */
    | 'differs'
    /** The reader could not read the current input at all. */
    | 'not-readable'
    /** The run's manifest has no entry for it. */
    | 'not-recorded';
}

/**
 * Roadmap 0.6, in one function: **anything that cannot be shown to still match
 * is invalid.**
 *
 * `live` maps input id to the digest of that input *now*, or `null` where the
 * reader could not determine it. Only ids the caller puts in `live` are judged —
 * the browser can recompute the source and the deployment target, the server can
 * recompute all six — and every one of them must come back equal. A missing
 * entry, an unreadable current value and a different value are three different
 * reasons and one verdict.
 *
 * The opposite arrangement is the freshness heuristic this replaces: it asked
 * whether anything *positively proved* the result old and, finding nothing,
 * called it current.
 */
export function unverifiedInputs(
  recorded: InputManifest | null | undefined,
  live: Readonly<Record<string, string | null>>,
): UnverifiedInput[] {
  const out: UnverifiedInput[] = [];
  const byId = new Map<string, ManifestInput>();
  for (const i of recorded?.inputs || []) byId.set(i.id, i);
  for (const id of Object.keys(live).sort()) {
    const entry = byId.get(id);
    if (!entry) {
      out.push({ id, dataClass: 'unknown', reason: 'not-recorded' });
      continue;
    }
    const now = live[id];
    if (typeof now !== 'string' || !now) {
      out.push({ id, dataClass: entry.dataClass, reason: 'not-readable' });
      continue;
    }
    if (now !== entry.sha256) out.push({ id, dataClass: entry.dataClass, reason: 'differs' });
  }
  return out;
}

/**
 * The divergences that invalidate a derivation, as opposed to the ones that are
 * merely worth reporting.
 *
 * A source artefact — the code, the catalog, the rule set, the target platform —
 * is what the evidence was computed from, so a change to it makes every
 * derivation a statement about something else. A derivation input (the engine
 * build, the narrative model) did not produce the evidence, so its version
 * moving on is recorded and shown, not treated as invalidation; every release
 * would otherwise block every project.
 */
export function invalidatingInputs(unverified: ReadonlyArray<UnverifiedInput>): UnverifiedInput[] {
  return unverified.filter((u) => u.dataClass === 'unknown' || !NON_INVALIDATING.has(u.dataClass as DataClass));
}

/** Short, human names for the ids, for a blocker message. */
export function inputLabel(id: string): string {
  switch (id) {
    case INPUT_IDS.source:
      return 'the analysed source';
    case INPUT_IDS.deployment:
      return 'the target deployment';
    case INPUT_IDS.catalog:
      return 'the SAP catalog';
    case INPUT_IDS.ruleset:
      return 'the rule set';
    case INPUT_IDS.engine:
      return 'the engine build';
    case INPUT_IDS.model:
      return 'the narrative model';
    default:
      return id;
  }
}
