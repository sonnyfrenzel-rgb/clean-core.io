import type { ProcessDocumentation } from '../../lib/process-documentation';
import { describedSteps, type FixtureBusinessLayer } from './business-layer-fixture';

/**
 * The RACI the owner saw on 04.10.2026 for Z_MM_PO_APPROVAL ("unrealistically
 * many roles in the RACI"): fourteen job titles of a large corporation, a
 * different Accountable on almost every step, and one step (the sixth, "Check
 * vendor") whose Accountable is missing. Keyed to the engine's step ids as the
 * real prompt asks, so the matrix places it on the process.
 */
export const OVERLOAD_ROLES = [
  'Procurement Operations Lead',
  'Operational Buyer',
  'Procurement Specialist',
  'Category Sourcing Lead',
  'Business Unit Lead',
  'Designated Approver (Department Head)',
  'Procurement Communications Coordinator',
  'Requisitioner',
  'Vendor Compliance Officer',
  'Vendor Master Data Steward',
  'Head of Strategic Sourcing',
  'Supply Chain Director',
  'Finance Controller',
  'Internal Audit',
] as const;

/** The step (0-based, in process order) whose Accountable the model left out. */
export const STEP_WITHOUT_ACCOUNTABLE = 5;

export function overloadedLayerFor(doc: ProcessDocumentation): FixtureBusinessLayer {
  const steps = describedSteps(doc);
  const role = (i: number) => OVERLOAD_ROLES[i % OVERLOAD_ROLES.length];
  const raci_matrix = steps.map((step, i) => ({
    stepId: step.id,
    r: `${role(i + 1)}, ${role(i + 2)}`,
    a: i === STEP_WITHOUT_ACCOUNTABLE ? '' : role(i + 10),
    c: `${role(i + 4)}, ${role(i + 8)}`,
    i: `${role(i + 6)}, ${role(13)}`,
  }));
  const sop_details = steps.map((step) => ({
    stepId: step.id,
    narrative: `The ${step.technicalName.toLowerCase().replace(/_/g, ' ')} step is carried out by the responsible role. The outcome is recorded.`,
    businessException: 'Escalate to the accountable role.',
    kpiTarget: 'Completed within one business day',
  }));
  const audit_controls = steps.slice(0, 2).map((step) => ({
    stepId: step.id,
    controlObjective: 'Approvals follow the four-eyes principle.',
    mitigationAction: 'Dual approval above the limit.',
    assertionMethod: 'Quarterly review of the approval log.',
  }));
  return { raci_matrix, sop_details, audit_controls };
}
