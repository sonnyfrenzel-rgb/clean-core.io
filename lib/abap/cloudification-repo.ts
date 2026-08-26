/**
 * SAP Cloudification Repository — schema, release registry, normalizer.
 *
 * Source: https://github.com/SAP/abap-atc-cr-cv-s4hc (the same content SAP's
 * own ATC check "Usage of Released APIs (Cloudification Repository)" consumes).
 *
 * The sync script (scripts/sync-cloudification-repo.ts) fetches the raw JSON,
 * normalizes it via this module and writes a compact generated artifact to
 * lib/abap/generated/. The catalog-service merges that artifact underneath the
 * hand-curated SAP_API_CATALOG (curated entries always win — they carry
 * field-level knowledge the repository does not have).
 *
 * NOTE (license/attribution): verify the repository LICENSE before shipping and
 * keep the source URL + commit reference in the generated artifact and in the
 * Audit Pack model card for traceability.
 */

/* ---------- raw schema (formatVersion 1) ---------- */

export interface CrSuccessor {
  tadirObject: string;   // e.g. DDLS, CLAS, FUNC, SRVD
  tadirObjName: string;  // e.g. I_PRODUCT
  objectType: string;
  objectKey: string;
}

export interface CrObjectReleaseInfo {
  tadirObject: string;           // TABL, VIEW, CLAS, FUNC, INTF, DDLS, BDEF, CHKV ...
  tadirObjName: string;          // e.g. MARA
  objectType: string;
  objectKey: string;
  softwareComponent?: string;
  applicationComponent?: string;
  state: string;                 // 'released' | 'deprecated' | 'decommissioned' | 'notReleased' ... (kept verbatim)
  successorClassification?: 'oneObject' | 'multipleObjects' | 'concept' | string;
  successors?: CrSuccessor[];
  successorConceptName?: string; // when successorClassification === 'concept'
}

export interface CrFile {
  formatVersion: string;
  objectReleaseInfo: CrObjectReleaseInfo[];
}

/**
 * Second file in the same repository: objectClassifications_SAP.json
 * (formatVersion 2). It classifies objects SAP has NOT released, which is what
 * separates clean core level B from level D:
 *
 *   classicAPI - documented, generally upgrade-stable classic API  -> level B
 *   noAPI      - not intended for customer use                     -> level D
 *
 * The two files are near-disjoint (196 of 8,588 entries overlap), so this is
 * additional coverage, not a restatement of objectReleaseInfo*.json.
 *
 * Structural trap: for FUGR entries `tadirObjName` is the function GROUP and
 * `objectKey` is the function MODULE. Custom code calls the module
 * (CALL FUNCTION 'BAPI_...'), so the module is the unit worth indexing.
 */
export interface CrObjectClassification {
  tadirObject: string;   // FUGR, CLAS, INTF, DDLS
  tadirObjName: string;  // function GROUP for FUGR; object name otherwise
  objectType: string;    // FUNC, CLAS, INTF, CDS_STOB
  objectKey: string;     // function MODULE for FUGR; object name otherwise
  softwareComponent?: string;
  applicationComponent?: string;
  state: string;         // 'classicAPI' | 'noAPI' (kept verbatim)
  labels?: string[];     // e.g. 'remote-enabled', 'transactional-consistent'
  successors?: CrSuccessor[];
}

export interface CrClassificationFile {
  formatVersion: string;
  objectClassifications: CrObjectClassification[];
}

/* ---------- release registry ---------- */

export type CatalogRelease = 'latest' | 'pce-latest' | `pce-${string}`;

const RAW_BASE = 'https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src';

/** Well-known release files. PCE (Private Cloud Edition / on-prem) files are versioned. */
export const RELEASE_FILES: Record<string, string> = {
  'latest': `${RAW_BASE}/objectReleaseInfoLatest.json`,        // SAP Cloud ERP (Public)
  'pce-latest': `${RAW_BASE}/objectReleaseInfo_PCELatest.json`, // latest Private edition
  'btp-latest': `${RAW_BASE}/objectReleaseInfo_BTPLatest.json`, // SAP BTP ABAP environment
  // Pinned PCE releases. The clean core level of an object is release-dependent:
  // something released in 2025 is still unreleased against a 2023 target.
  'pce-2025-1': `${RAW_BASE}/objectReleaseInfo_PCE2025_1.json`,
  'pce-2025-0': `${RAW_BASE}/objectReleaseInfo_PCE2025_0.json`,
  'pce-2023-3': `${RAW_BASE}/objectReleaseInfo_PCE2023_3.json`,
  // formatVersion 2 - classicAPI / noAPI classification (see CrClassificationFile).
  'classifications-sap': `${RAW_BASE}/objectClassifications_SAP.json`,
};

/** Registry keys whose file uses the formatVersion 2 classification schema. */
export const CLASSIFICATION_RELEASES = new Set(['classifications-sap']);

/* ---------- normalized, compact artifact ---------- */

export interface NormalizedSuccessor {
  name: string;          // I_PRODUCT
  tadir: string;         // DDLS
}

export interface NormalizedEntry {
  /** verbatim repo state, upper-cased key is the object name */
  state: string;
  tadir: string;                       // object's own tadir type
  successors?: NormalizedSuccessor[];  // absent when none
  conceptNote?: string;                // successorClassification === 'concept'
  appComponent?: string;
  labels?: string[];                   // classification file only
}

export interface CloudificationArtifact {
  meta: {
    source: string;        // raw URL fetched
    release: string;       // registry key
    formatVersion: string;
    fetchedAt: string;     // ISO
    sourceSha256: string;  // hash of the raw file for traceability
    entryCount: number;
  };
  /** objectName (UPPER) -> entry. Filtered to relevant tadir types. */
  entries: Record<string, NormalizedEntry>;
}

/** Tadir types relevant to the evidence scanner / router. Keeps the artifact small. */
export const RELEVANT_TADIR = new Set(['TABL', 'VIEW', 'DDLS', 'CLAS', 'INTF', 'FUNC', 'SRVD', 'SRVB']);

export function normalizeCrFile(
  raw: CrFile,
  meta: { source: string; release: string; sourceSha256: string },
): CloudificationArtifact {
  const entries: Record<string, NormalizedEntry> = {};

  for (const o of raw.objectReleaseInfo ?? []) {
    if (!RELEVANT_TADIR.has((o.tadirObject || '').toUpperCase())) continue;
    const key = (o.tadirObjName || '').toUpperCase();
    if (!key) continue;

    const entry: NormalizedEntry = {
      state: o.state || 'unknown',
      tadir: (o.tadirObject || '').toUpperCase(),
    };
    if (o.successors?.length) {
      entry.successors = o.successors.map((s) => ({
        name: (s.tadirObjName || '').toUpperCase(),
        tadir: (s.tadirObject || '').toUpperCase(),
      }));
    }
    if (o.successorClassification === 'concept' && o.successorConceptName) {
      entry.conceptNote = o.successorConceptName;
    }
    if (o.applicationComponent) entry.appComponent = o.applicationComponent;

    // De-dup: last write wins (repo occasionally lists variants; verbatim keep is fine)
    entries[key] = entry;
  }

  return {
    meta: {
      source: meta.source,
      release: meta.release,
      formatVersion: raw.formatVersion || '1',
      fetchedAt: new Date().toISOString(),
      sourceSha256: meta.sourceSha256,
      entryCount: Object.keys(entries).length,
    },
    entries,
  };
}

/**
 * Normalizer for objectClassifications_SAP.json (formatVersion 2).
 *
 * Produces the same artifact shape as normalizeCrFile() so the sync script, the
 * change detection and the catalog service all stay on one code path.
 *
 * Keying rule: FUGR entries are indexed by `objectKey` (the function module),
 * every other type by `tadirObjName` (where name and key are identical anyway —
 * verified across all 1,744 CLAS, 1,340 INTF and 258 DDLS entries).
 */
export function normalizeClassificationFile(
  raw: CrClassificationFile,
  meta: { source: string; release: string; sourceSha256: string },
): CloudificationArtifact {
  const entries: Record<string, NormalizedEntry> = {};

  for (const o of raw.objectClassifications ?? []) {
    const isFunctionGroup = (o.tadirObject || '').toUpperCase() === 'FUGR';
    // Resolve to the tadir type the evidence scanner actually looks up: a FUGR
    // row describes a function module, so it is indexed as FUNC.
    const tadir = (isFunctionGroup ? 'FUNC' : o.tadirObject || '').toUpperCase();
    if (!RELEVANT_TADIR.has(tadir)) continue;

    const key = ((isFunctionGroup ? o.objectKey : o.tadirObjName) || '').toUpperCase();
    if (!key) continue;

    const entry: NormalizedEntry = {
      state: o.state || 'unknown',
      tadir,
    };
    if (o.successors?.length) {
      entry.successors = o.successors.map((s) => ({
        name: (s.tadirObjName || '').toUpperCase(),
        tadir: (s.tadirObject || '').toUpperCase(),
      }));
    }
    if (o.applicationComponent) entry.appComponent = o.applicationComponent;
    if (o.labels?.length) entry.labels = o.labels;

    entries[key] = entry;
  }

  return {
    meta: {
      source: meta.source,
      release: meta.release,
      formatVersion: raw.formatVersion || '2',
      fetchedAt: new Date().toISOString(),
      sourceSha256: meta.sourceSha256,
      entryCount: Object.keys(entries).length,
    },
    entries,
  };
}
