/**
 * Knowledge: SAP's Cloudification Repository — the release states (latest S/4HANA Cloud Public Edition) and the
 * object classifications (`classicAPI`, `noAPI`, …), as synced by `scripts/sync-cloudification-repo.ts` into
 * `lib/abap/generated/` (Apache-2.0, `THIRD-PARTY-NOTICES.md` §1). ADR-133 (2): pure data — a JSON import and its
 * types, no import from `lib/abap/` code, `lib/engine4/`, React, Firebase or I/O. Read by engine 4 (L4, the
 * readings) and available to today's engine.
 *
 * Facts only: what SAP's files say about a name. The A–D level is a rule on top of these facts
 * (`lib/abap/abcd-classification.ts`) and stays out of this tree and out of anything signed.
 */
import latest from '../abap/generated/cloudification-repo.latest.json';
import classifications from '../abap/generated/cloudification-repo.classifications-sap.json';

/** One object of a synced file (`NormalizedEntry` of `lib/abap/cloudification-repo.ts`, by structure). */
export interface CatalogEntry {
  state: string;
  tadir: string;
  successors?: Array<{ name: string; tadir: string }>;
  conceptNote?: string;
  appComponent?: string;
  labels?: string[];
}

export interface KnowledgeMeta {
  source: string;
  release: string;
  fetchedAt: string;
  sourceSha256: string;
  entryCount: number;
}

interface Artifact { meta: KnowledgeMeta; entries: Record<string, CatalogEntry> }

const RELEASE = latest as unknown as Artifact;
const CLASSIFICATION = classifications as unknown as Artifact;

/** Which files this module reads: a signed engine 4 run can record them as it records `engineDigest` for code. */
export const CLOUDIFICATION_META: readonly KnowledgeMeta[] = Object.freeze([RELEASE.meta, CLASSIFICATION.meta]);

/** A customer name (`Z…`, `Y…`): SAP's files never apply. */
export function isCustomerName(name: string): boolean {
  return /^[ZY]/.test((name || '').toUpperCase().trim());
}

/** A reserved-namespace name (`/ACME/X`): SAP's, a partner's or the customer's — the name alone does not say. */
export function isNamespacedName(name: string): boolean {
  return /^\/[^/]+\//.test((name || '').toUpperCase().trim());
}

/** What SAP's two files say about one name. `listed` is false when neither file holds it. */
export interface SapFacts {
  name: string;
  listed: boolean;
  /** `released`, `deprecated`, `notToBeReleased`, … (the release file, latest). */
  releaseState?: string;
  /** `classicAPI`, `noAPI`, … (the classification file). */
  classificationState?: string;
  /** The object's type as SAP lists it: `TABL`, `VIEW`, `DDLS`, `CLAS`, `INTF`, `FUNC`, `SRVD`, `SRVB`. */
  tadir?: string;
  successors: Array<{ name: string; tadir: string }>;
  /** Known to be SAP's: listed, or not customer and not namespaced (the shipping rule, `getSapObjectStates`). */
  isSapObject: boolean;
  isCustomerObject: boolean;
}

/** The facts for one name, upper-cased and trimmed. Pure lookup, no grade. */
export function sapFacts(name: string): SapFacts {
  const key = (name || '').toUpperCase().trim();
  const release = RELEASE.entries[key];
  const classification = CLASSIFICATION.entries[key];
  const listed = Boolean(release || classification);
  const customer = isCustomerName(key);
  return {
    name: key,
    listed,
    releaseState: release?.state,
    classificationState: classification?.state,
    tadir: release?.tadir ?? classification?.tadir,
    successors: [...(release?.successors ?? []), ...(classification?.successors ?? [])],
    isSapObject: !customer && (listed || !isNamespacedName(key)),
    isCustomerObject: customer,
  };
}
