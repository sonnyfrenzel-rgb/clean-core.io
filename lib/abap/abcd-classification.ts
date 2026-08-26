/**
 * SAP Clean Core object classification — A / B / C / D.
 *
 * SAP's Cloudification Repository governs which technical objects are Clean-Core
 * ready. The community has moved from the older Tier 1/2/3 wording to a four-grade
 * cloud-readiness classification, driven by API release status, upgrade safety and
 * extensibility compliance:
 *
 *   A = released SAP APIs & extension points (ABAP Cloud / BTP)
 *   B = classic SAP APIs, following SAP recommendations
 *   C = internal SAP APIs — conditionally clean (changelog check)
 *   D = not-recommended objects & technologies (modifications, …)
 *
 * The severity each level maps to in the ABAP Test Cockpit is recorded per grade
 * as `atcReading` — deliberately named as OUR reading, not an SAP specification.
 * We have not been able to cite an SAP source that states the mapping outright;
 * what SAP does document is the recommendation to run ATC in blocking mode for
 * Priority 1 and 2 findings. Until a source is confirmed, the field is presented
 * as an interpretation, not as SAP doctrine.
 *
 * Clean-Core.io derives this grade DETERMINISTICALLY — from the Cloudification
 * Repository release state where an object is known, and otherwise from the
 * evidence the engine already computes (access type, risk level, custom flag).
 * It is a *derived* readiness grade aligned to the A–D scheme — proven, not guessed.
 */

export type CloudReadinessGrade = 'A' | 'B' | 'C' | 'D' | 'Unknown';

/** The four assessable SAP clean-core levels (used for the legend). */
export const GRADES: CloudReadinessGrade[] = ['A', 'B', 'C', 'D'];

/** All grades incl. the Unknown / insufficient-evidence bucket (distribution bar). */
export const ALL_GRADES: CloudReadinessGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];

export interface GradeMeta {
  grade: CloudReadinessGrade;
  label: string;
  short: string;
  description: string;
  /** OUR reading of the matching ABAP Test Cockpit severity — not an SAP-published mapping. */
  atcReading: string;
  color: string; // hex — charts
  badge: string; // tailwind badge classes
}

// Aligned to SAP's official clean core level concept (ABAP extensibility guide, 2025)
// and the matching ABAP Test Cockpit behaviour.
export const ABCD_META: Record<CloudReadinessGrade, GradeMeta> = {
  A: {
    grade: 'A',
    label: 'Released SAP APIs & extension points',
    short: 'Cloud-ready',
    description: 'Released SAP APIs (local & remote) and extension points — ABAP Cloud on-stack, or side-by-side on SAP BTP. Fully supported and upgrade-stable.',
    atcReading: 'No message',
    color: '#059669',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  B: {
    grade: 'B',
    label: 'Classic SAP APIs — SAP-recommended',
    short: 'Classic OK',
    description: 'Classic SAP APIs and extension points that follow SAP recommendations — used where no Level A path is available.',
    atcReading: 'Priority 3 · info',
    color: '#2563eb',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  C: {
    grade: 'C',
    label: 'Internal SAP APIs — conditional',
    short: 'Internal',
    description: 'Uses internal SAP objects/APIs — conditionally clean if verified via the changelog-for-SAP-objects approach before each upgrade.',
    atcReading: 'Priority 2 · warning',
    color: '#d97706',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  D: {
    grade: 'D',
    label: 'Not recommended — replace',
    short: 'Replace',
    description: 'Not-recommended objects & technologies — modifications, implicit enhancements, direct table writes, non-released access. Not clean; replace before upgrade.',
    atcReading: 'Priority 1 · error',
    color: '#dc2626',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
  Unknown: {
    grade: 'Unknown',
    label: 'Insufficient evidence',
    short: 'Unknown',
    description: 'Not enough evidence to assign a clean-core level. Provide risk/criticality or import ATC results to classify — shown honestly instead of a guessed grade.',
    atcReading: 'Not assessed',
    color: '#64748b',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

/** Map a Cloudification Repository release state to an A–D grade. */
export function gradeFromCatalogState(state?: string, hasSuccessor?: boolean): CloudReadinessGrade {
  switch (state) {
    case 'released':
      return 'A';
    case 'deprecated':
      return hasSuccessor ? 'C' : 'D';
    case 'notToBeReleased':
      return 'D';
    default:
      return 'Unknown'; // F-05: unknown catalog state → Unknown, not a guessed C
  }
}

/**
 * Grade a detected data-coupling dependency from the deterministic evidence
 * (access type + risk level). Writes are graded more strictly than reads.
 */
export function gradeFromCoupling(c: { accessType?: string; riskLevel?: string; isCustom?: boolean }): CloudReadinessGrade {
  // F-05: don't fabricate a level when the risk signal is missing — return Unknown
  // instead of silently defaulting to Medium (avoids false precision).
  const risk = c.riskLevel;
  if (risk !== 'High' && risk !== 'Medium' && risk !== 'Low') return 'Unknown';
  const isWrite = (c.accessType || '').toLowerCase() !== 'read';
  if (risk === 'High') return isWrite ? 'D' : 'C';
  if (risk === 'Medium') return isWrite ? 'C' : 'B';
  return 'A'; // Low risk
}

/** Grade a custom code object from its criticality and type. */
export function gradeFromInventory(item: { criticality?: string; type?: string }): CloudReadinessGrade {
  const t = (item.type || '').toLowerCase();
  if (t.includes('dynpro') || t.includes('screen')) return 'D';
  // F-05: Unknown when the criticality signal is missing (no silent Medium default).
  const crit = item.criticality;
  if (crit !== 'High' && crit !== 'Medium' && crit !== 'Low') return 'Unknown';
  if (crit === 'High') return 'C';
  if (crit === 'Low') return 'A';
  return 'B';
}

/** Count grades into an ordered A→D (+Unknown) distribution. */
export function gradeDistribution(grades: CloudReadinessGrade[]): Record<CloudReadinessGrade, number> {
  const dist: Record<CloudReadinessGrade, number> = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
  for (const g of grades) dist[g] += 1;
  return dist;
}

/** Severity order for rolling a customer object up to its worst finding. */
const GRADE_SEVERITY: Record<CloudReadinessGrade, number> = { Unknown: 0, A: 1, B: 2, C: 3, D: 4 };

/**
 * F-05: worst-finding rollup. SAP rolls a customer object's clean-core level up to
 * its most-severe relevant finding. Unknown findings are ignored unless nothing is
 * assessable (then the object is Unknown); an empty list is treated as clean (A).
 */
export function worstGrade(grades: CloudReadinessGrade[]): CloudReadinessGrade {
  const assessable = grades.filter((g) => g !== 'Unknown');
  if (assessable.length === 0) return grades.length ? 'Unknown' : 'A';
  return assessable.reduce<CloudReadinessGrade>(
    (worst, g) => (GRADE_SEVERITY[g] > GRADE_SEVERITY[worst] ? g : worst),
    'A',
  );
}

/* ------------------------------------------------------------------ *
 * Catalog-backed grading (SAP data) vs. heuristic grading (our guess)
 * ------------------------------------------------------------------ */

/**
 * Where a grade came from. Shown next to every grade so a reader can tell a
 * looked-up fact from a derived estimate without reading the docs.
 *
 *   catalog          - the object is listed in SAP's own data with a state that
 *                      maps to a level. This is a lookup, not an inference.
 *   catalog-residual - the object is in neither SAP list. Per the clean core
 *                      level concept that IS the definition of level C ("SAP
 *                      internal objects, not classified or intended for
 *                      customer use") — a derived-but-principled verdict.
 *   heuristic        - no SAP data applies (custom Z/Y objects, or evidence
 *                      without an object name). Falls back to risk/criticality.
 */
export type GradeProvenance = 'catalog' | 'catalog-residual' | 'heuristic';

export interface GradedObject {
  grade: CloudReadinessGrade;
  provenance: GradeProvenance;
  /** verbatim SAP state behind the grade, when one applied (e.g. 'classicAPI') */
  state?: string;
}

export interface SapObjectStates {
  /** state from objectReleaseInfo*.json — 'released' | 'deprecated' | 'notToBeReleased' */
  releaseState?: string;
  /** state from objectClassifications_SAP.json — 'classicAPI' | 'noAPI' */
  classificationState?: string;
  hasSuccessor?: boolean;
  /** false for customer objects (Z, Y prefixes), where SAP data cannot apply */
  isSapObject?: boolean;
}

/**
 * Grade an object from SAP's published data.
 *
 * Precedence matters at the 196 objects that appear in BOTH files: `released`
 * wins over `classicAPI`, because a released API is level A even if the classic
 * list also mentions it. Getting this backwards would silently downgrade 194
 * released objects to B.
 *
 * Returns grade 'Unknown' with provenance 'heuristic' when no SAP data applies —
 * the caller then falls back to gradeFromCoupling / gradeFromInventory.
 */
export function gradeFromSapStates(s: SapObjectStates): GradedObject {
  const release = (s.releaseState || '').toLowerCase();
  const classification = (s.classificationState || '').toLowerCase();

  if (release === 'released') return { grade: 'A', provenance: 'catalog', state: 'released' };
  if (classification === 'classicapi') return { grade: 'B', provenance: 'catalog', state: 'classicAPI' };
  if (classification === 'noapi') return { grade: 'D', provenance: 'catalog', state: 'noAPI' };
  if (release === 'nottobereleased') return { grade: 'D', provenance: 'catalog', state: 'notToBeReleased' };
  if (release === 'deprecated') {
    return { grade: s.hasSuccessor ? 'C' : 'D', provenance: 'catalog', state: 'deprecated' };
  }

  // Listed nowhere. For an SAP object that is the level C definition itself.
  if (s.isSapObject) return { grade: 'C', provenance: 'catalog-residual' };

  return { grade: 'Unknown', provenance: 'heuristic' };
}

/** Customer objects (Z*, Y*) carry no SAP classification — SAP data cannot apply. */
export function isCustomerObject(name: string): boolean {
  const n = (name || '').toUpperCase().trim();
  if (!n) return false;
  // Customer namespace /.../ prefixes are partner/SAP-adjacent, not customer-owned.
  return /^[ZY]/.test(n);
}
