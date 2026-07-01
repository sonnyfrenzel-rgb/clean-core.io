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

/* ---------- release registry ---------- */

export type CatalogRelease = 'latest' | 'pce-latest' | `pce-${string}`;

const RAW_BASE = 'https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src';

/** Well-known release files. PCE (Private Cloud Edition / on-prem) files are versioned. */
export const RELEASE_FILES: Record<string, string> = {
  'latest': `${RAW_BASE}/objectReleaseInfoLatest.json`,        // SAP Cloud ERP (Public)
  'pce-latest': `${RAW_BASE}/objectReleaseInfo_PCELatest.json`, // latest Private edition
  // pin specific PCE releases as needed, e.g.:
  'pce-2023-3': `${RAW_BASE}/objectReleaseInfo_PCE2023_3.json`,
};

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
