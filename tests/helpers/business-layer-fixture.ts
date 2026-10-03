import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../../lib/process-naming';
import { buildProcessMapModel } from '../../lib/process-map';
import { buildProcessDocumentation } from '../../lib/process-documentation-build';
import type { ProcessDocumentation } from '../../lib/process-documentation';
import { buildProcessDocument } from '../../lib/process-document-build';
import type { ProcessDocument } from '../../lib/process-document';

/**
 * A stored engine documentation and a business layer for it — the fixture the
 * Documentation specs seed when they need the SOP and the RACI on screen.
 *
 * The documentation is the engine's own reading of the shipped example, built
 * exactly as the stage builds it. The business layer stands in for what a model
 * would return: it is keyed to the documentation's element ids, as the real
 * prompt asks, and it carries the gaps a reader must be shown — one step with no
 * Accountable, one with two, one role Responsible almost everywhere, one step
 * the process does not have, and empty fields.
 */

export const FIXTURE_FILE = 'Z_MM_PO_APPROVAL.abap';

export function fixtureSource(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', 'public', 'starter-examples', FIXTURE_FILE), 'utf8')
    .replace(/\r\n/g, '\n');
}

export function engineDocumentationOf(source: string): ProcessDocumentation {
  const bpmn = buildBpmnExportFromSource(source, { processName: FIXTURE_FILE, sourceFileName: FIXTURE_FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: FIXTURE_FILE });
  return buildProcessDocumentation({ source, map });
}

/** The process description of the same source, as the stage and the Confluence page render it. */
export function processDocumentOf(source: string): ProcessDocument {
  const bpmn = buildBpmnExportFromSource(source, { processName: FIXTURE_FILE, sourceFileName: FIXTURE_FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: FIXTURE_FILE });
  return buildProcessDocument({ source, map });
}

/** The top-level steps a model would describe: no events, no decisions. */
export function describedSteps(doc: ProcessDocumentation) {
  return doc.steps.filter((s) => s.level === null && !/^(Start|End|Decision)/.test(s.kind));
}

export interface FixtureBusinessLayer {
  raci_matrix: Array<Record<string, string>>;
  sop_details: Array<Record<string, string>>;
  audit_controls: Array<Record<string, string>>;
}

export const UNKNOWN_STEP_ID = 'Task_not_in_process';

export function businessLayerFor(doc: ProcessDocumentation): FixtureBusinessLayer {
  const steps = describedSteps(doc);
  const raci_matrix = steps.map((step, i) => ({
    stepId: step.id,
    r: i === 4 ? 'Requester' : i === steps.length - 3 ? 'Department Head' : 'Purchasing Clerk',
    a: i === 2 ? '' : i === 5 ? 'Process Owner, Finance Lead' : 'Process Owner',
    c: i % 3 === 0 ? 'Compliance Officer' : '',
    i: i % 2 === 0 ? 'Finance, Internal Audit' : 'Requester',
  }));
  raci_matrix.push({ stepId: UNKNOWN_STEP_ID, r: 'Purchasing Clerk', a: 'Process Owner', c: '', i: '' });
  const sop_details = steps.map((step, i) => ({
    stepId: step.id,
    narrative: i === 3
      ? ''
      : `The ${step.technicalName.toLowerCase().replace(/_/g, ' ')} step is carried out by the responsible role. `
        + 'The outcome is recorded before the case moves on. Exceptions are routed to the process owner.',
    businessException: i % 2 === 0 ? 'Escalate to the process owner for manual review.' : '',
    kpiTarget: i % 2 === 0 ? 'Completed within one business day' : '',
  }));
  sop_details.push({
    stepId: UNKNOWN_STEP_ID,
    narrative: 'A step the model described that the code does not have.',
    businessException: '',
    kpiTarget: '',
  });
  const audit_controls = steps.slice(0, 3).map((step) => ({
    stepId: step.id,
    controlObjective: 'Approvals follow the four-eyes principle.',
    mitigationAction: 'Dual approval above the limit.',
    assertionMethod: 'Quarterly review of the approval log.',
  }));
  return { raci_matrix, sop_details, audit_controls };
}
