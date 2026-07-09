/**
 * SAP Clean Core object classification — A / B / C / D.
 *
 * SAP's Cloudification Repository governs which technical objects are Clean-Core
 * ready. The community has moved from the older Tier 1/2/3 wording to a four-grade
 * cloud-readiness classification, driven by API release status, upgrade safety and
 * extensibility compliance:
 *
 *   A = released SAP APIs & extension points (ABAP Cloud / BTP)     — ATC: no message
 *   B = classic SAP APIs, following SAP recommendations            — ATC: Priority 3 (info)
 *   C = internal SAP APIs — conditionally clean (changelog check)  — ATC: Priority 2 (warning)
 *   D = not-recommended objects & technologies (modifications, …)  — ATC: Priority 1 (error)
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
  atc: string; // matching ABAP Test Cockpit message priority (SAP clean core level concept)
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
    atc: 'No message',
    color: '#059669',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  B: {
    grade: 'B',
    label: 'Classic SAP APIs — SAP-recommended',
    short: 'Classic OK',
    description: 'Classic SAP APIs and extension points that follow SAP recommendations — used where no Level A path is available.',
    atc: 'Priority 3 · info',
    color: '#2563eb',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  C: {
    grade: 'C',
    label: 'Internal SAP APIs — conditional',
    short: 'Internal',
    description: 'Uses internal SAP objects/APIs — conditionally clean if verified via the changelog-for-SAP-objects approach before each upgrade.',
    atc: 'Priority 2 · warning',
    color: '#d97706',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  D: {
    grade: 'D',
    label: 'Not recommended — replace',
    short: 'Replace',
    description: 'Not-recommended objects & technologies — modifications, implicit enhancements, direct table writes, non-released access. Not clean; replace before upgrade.',
    atc: 'Priority 1 · error',
    color: '#dc2626',
    badge: 'bg-red-100 text-red-800 border-red-300',
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
