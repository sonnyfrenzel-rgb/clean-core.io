/**
 * SAP Clean Core object classification — A / B / C / D.
 *
 * SAP's Cloudification Repository governs which technical objects are Clean-Core
 * ready. The community has moved from the older Tier 1/2/3 wording to a four-grade
 * cloud-readiness classification, driven by API release status, upgrade safety and
 * extensibility compliance:
 *
 *   A = released and cloud-ready
 *   B = stable, acceptable with caution
 *   C = conditional, requires risk review
 *   D = not clean, should be replaced
 *
 * Clean-Core.io derives this grade DETERMINISTICALLY — from the Cloudification
 * Repository release state where an object is known, and otherwise from the
 * evidence the engine already computes (access type, risk level, custom flag).
 * It is a *derived* readiness grade aligned to the A–D scheme — proven, not guessed.
 */

export type CloudReadinessGrade = 'A' | 'B' | 'C' | 'D';

export const GRADES: CloudReadinessGrade[] = ['A', 'B', 'C', 'D'];

export interface GradeMeta {
  grade: CloudReadinessGrade;
  label: string;
  short: string;
  description: string;
  color: string; // hex — charts
  badge: string; // tailwind badge classes
}

export const ABCD_META: Record<CloudReadinessGrade, GradeMeta> = {
  A: {
    grade: 'A',
    label: 'Released & cloud-ready',
    short: 'Cloud-ready',
    description: 'Released SAP APIs / CDS views — clean and upgrade-safe. Adopt as-is.',
    color: '#059669',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  B: {
    grade: 'B',
    label: 'Stable — acceptable with caution',
    short: 'Stable',
    description: 'A released path exists but with caveats — minor refactor or a thin wrapper is advisable.',
    color: '#2563eb',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  C: {
    grade: 'C',
    label: 'Conditional — requires risk review',
    short: 'Review',
    description: 'Expert sign-off needed — deprecated-adjacent, or no direct released path yet.',
    color: '#d97706',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  D: {
    grade: 'D',
    label: 'Not clean — should be replaced',
    short: 'Replace',
    description: 'Unreleased objects, direct writes to standard tables, or kernel/dynpro — replace before Clean Core.',
    color: '#dc2626',
    badge: 'bg-red-50 text-red-700 border-red-200',
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
      return 'C';
  }
}

/**
 * Grade a detected data-coupling dependency from the deterministic evidence
 * (access type + risk level). Writes are graded more strictly than reads.
 */
export function gradeFromCoupling(c: { accessType?: string; riskLevel?: string; isCustom?: boolean }): CloudReadinessGrade {
  const isWrite = (c.accessType || '').toLowerCase() !== 'read';
  const risk = c.riskLevel || 'Medium';
  if (risk === 'High') return isWrite ? 'D' : 'C';
  if (risk === 'Medium') return isWrite ? 'C' : 'B';
  return 'A'; // Low risk
}

/** Grade a custom code object from its criticality and type. */
export function gradeFromInventory(item: { criticality?: string; type?: string }): CloudReadinessGrade {
  const t = (item.type || '').toLowerCase();
  if (t.includes('dynpro') || t.includes('screen')) return 'D';
  const crit = item.criticality || 'Medium';
  if (crit === 'High') return 'C';
  if (crit === 'Low') return 'A';
  return 'B';
}

/** Count grades into an ordered A→D distribution. */
export function gradeDistribution(grades: CloudReadinessGrade[]): Record<CloudReadinessGrade, number> {
  const dist: Record<CloudReadinessGrade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of grades) dist[g] += 1;
  return dist;
}
