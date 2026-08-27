import fs from 'fs';
import path from 'path';
import { buildAbapEvidence, type EvidenceFinding } from '@/lib/abap/evidence-model';
import { routeExtensibility } from '@/lib/abap/extensibility-router';
import { getMergedCatalogVersion } from '@/lib/abap/catalog-service';

/**
 * The published reference run.
 *
 * The landing page used to promise "save days of manual mapping" — a claim that
 * cannot be checked, quoted, or put in a business case. This replaces it with a
 * run anyone can reproduce: one ABAP file that ships in this repository, analysed
 * by the same engine the product uses, with the result split into the only three
 * buckets that matter to a reader deciding whether to bother.
 *
 * Everything here is computed at request time from the file on disk. No figure on
 * the landing page, the reference page or the whitepaper is typed in by hand, so
 * none of them can drift away from what the engine actually does.
 *
 * Server-only: reads from the filesystem.
 */

export const REFERENCE_FILE = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const REFERENCE_PATH = path.join(process.cwd(), 'abap-test-files', REFERENCE_FILE);

/**
 * Findings the engine hands back untouched rather than transforming.
 *
 * These correspond to the classes the support matrix marks `not-supported`, plus
 * the two structural cases that cannot survive a transformation at all: a core
 * modification has to be reset in SPAU before anything else is possible, and
 * native SQL bypasses the database abstraction the target model depends on.
 */
const HANDED_BACK_KINDS = new Set(['dynpro', 'modification', 'native-sql']);

export interface ReferenceBucket {
  count: number;
  /** Headline in the reader's language, not the engine's. */
  label: string;
  /** One sentence on what it means for them. */
  meaning: string;
}

export interface ReferenceAnalysis {
  fileName: string;
  /** Lines excluding blanks and full-line comments. */
  linesOfCode: number;
  totalFindings: number;
  /** Wall-clock milliseconds for the deterministic pass. */
  durationMs: number;
  cleanCoreScore: number;
  recommendedRoute: string;
  catalogVersion: string;
  resolved: ReferenceBucket;
  decision: ReferenceBucket;
  handedBack: ReferenceBucket;
  /** The kinds behind the handed-back bucket, so the page can name them. */
  handedBackKinds: string[];
  /**
   * The SAP objects this run actually touched, each with the released successor
   * the catalog returned for it.
   *
   * A percentage proves nothing to an ABAP developer; `VBAK → API_SALES_ORDER_SRV`
   * proves the same thing in a form they recognise on sight. Derived from the
   * findings rather than curated, so it cannot drift from the run beside it, and
   * limited to real object identifiers — several finding titles sit in
   * `objectName` for findings that are about a construct rather than an object.
   */
  rollCall: ReferenceObject[];
  findings: EvidenceFinding[];
}

export interface ReferenceObject {
  name: string;
  /** e.g. 'Database Table', 'Function Module'. */
  objectType: string;
  /** The released successor, or null where the catalog has no path. */
  successor: string | null;
  /** True only for a catalog lookup — never for an inference. */
  fromCatalog: boolean;
}

function bucketOf(f: EvidenceFinding): 'resolved' | 'decision' | 'handedBack' {
  if (HANDED_BACK_KINDS.has(f.kind)) return 'handedBack';
  // A catalog match is a lookup against SAP's own data — nothing is inferred.
  if (f.sapReplacement?.confidence === 'Catalog Match') return 'resolved';
  return 'decision';
}

export function getReferenceAnalysis(): ReferenceAnalysis {
  const code = fs.readFileSync(REFERENCE_PATH, 'utf8');
  const linesOfCode = code
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*\*/.test(l)).length;

  const started = Date.now();
  const evidence = buildAbapEvidence(code, REFERENCE_FILE, 'private');
  const durationMs = Math.max(1, Date.now() - started);
  const route = routeExtensibility(evidence, 'private');

  const counts = { resolved: 0, decision: 0, handedBack: 0 };
  const kinds = new Set<string>();
  for (const f of evidence.findings) {
    const b = bucketOf(f);
    counts[b] += 1;
    if (b === 'handedBack') kinds.add(f.kind);
  }

  return {
    fileName: REFERENCE_FILE,
    linesOfCode,
    totalFindings: evidence.findings.length,
    durationMs,
    cleanCoreScore: route.cleanCoreScore,
    recommendedRoute: route.recommendedRoute,
    catalogVersion: getMergedCatalogVersion(),
    resolved: {
      count: counts.resolved,
      label: 'the tool settles',
      meaning:
        'These point at a released SAP successor, looked up in SAP’s own published data. You review the mapping; you do not have to find it.',
    },
    decision: {
      count: counts.decision,
      label: 'your decision',
      meaning:
        'Transformable, but somebody has to weigh business intent against the target design. The tool shows the evidence and stops.',
    },
    handedBack: {
      count: counts.handedBack,
      label: 'stays hand work',
      meaning:
        'Structurally out of reach for any generator. They are flagged and isolated rather than guessed at — so nothing false ends up in your draft.',
    },
    handedBackKinds: Array.from(kinds).sort(),
    rollCall: buildRollCall(evidence.findings),
    findings: evidence.findings,
  };
}

/**
 * An ABAP identifier, and not a finding title that happens to sit in the same
 * field. `objectName` carries both — "Legacy ALV Grid Display" is a construct,
 * `VBAK` is an object — and only the second kind means anything in a roll-call.
 */
const OBJECT_NAME = /^[A-Z][A-Z0-9_]{2,29}$|^\/[A-Z0-9]+\/[A-Z0-9_]+$/;

function buildRollCall(findings: EvidenceFinding[]): ReferenceObject[] {
  const seen = new Map<string, ReferenceObject>();
  for (const f of findings) {
    const name = f.objectName;
    if (!name || !OBJECT_NAME.test(name)) continue;
    const existing = seen.get(name);
    const successor = f.sapReplacement?.objectName ?? null;
    const fromCatalog = f.sapReplacement?.confidence === 'Catalog Match';
    // First writer wins, except that a catalog match always beats no match:
    // the same table can appear in several findings, only one of which carries
    // the replacement.
    if (!existing) {
      seen.set(name, { name, objectType: f.objectType || 'Object', successor, fromCatalog });
    } else if (!existing.fromCatalog && fromCatalog) {
      seen.set(name, { name, objectType: existing.objectType, successor, fromCatalog });
    }
  }
  // Catalog matches first — they are the part that proves something.
  return Array.from(seen.values()).sort((a, b) => {
    if (a.fromCatalog !== b.fromCatalog) return a.fromCatalog ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The raw source, for the download route on the reference page. */
export function getReferenceSource(): string {
  return fs.readFileSync(REFERENCE_PATH, 'utf8');
}
