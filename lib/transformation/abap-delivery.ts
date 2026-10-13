/**
 * How the RAP scaffold delivers a process: a Fiori UI service, an Application
 * Job, or both (roadmap 3.0.12, DSAG ABAP guide review B3).
 *
 * Reports are not part of ABAP Cloud; a report becomes a Fiori app on RAP or an
 * Application Job (DSAG ABAP guide, clean-core/solution-approach.md "Migration
 * von Reports"). Which one is read from the original, never from a model:
 *
 *   - background use: `SUBMIT … VIA JOB`, the job function modules
 *     (`JOB_OPEN`, `JOB_SUBMIT`, `JOB_CLOSE`) or a `sy-batch` check;
 *   - interactive dialog: `CALL SCREEN`, `CALL SELECTION-SCREEN`,
 *     `AT USER-COMMAND`, `AT LINE-SELECTION`, `SET PF-STATUS`, popups, an ALV
 *     with a user-command callback;
 *   - list output: `WRITE`, an ALV display — in the background it goes to the
 *     spool, so it decides nothing on its own.
 *
 * The decision:
 *
 *   - background use and neither dialog nor list output → the job **instead
 *     of** the UI service: nobody sits in front of this program;
 *   - background use and a dialog or a list → **both**: the job for the
 *     unattended run, the UI service for what a user saw;
 *   - no background use, no selection input, no dialog and no list → the job:
 *     a program that takes nothing and shows nothing can only run unattended;
 *   - otherwise → the UI service (what the scaffold wrote before).
 *
 * Pure, no network, no model.
 */

import type { CallGraphReport } from '../abap/call-graph';
import type { OriginalContract } from '../abap/original-contract';
import type { AbapStatement } from '../abap/statement-reader';
import type { AbapDelivery, AbapDeliveryEvidence } from './types';

const JOB_MODULES = /^(?:JOB_OPEN|JOB_SUBMIT|JOB_CLOSE)$/;
const POPUP_MODULES = /^POPUP_/;
const ALV_MODULES = /^REUSE_ALV_/;

/** At most this many evidence lines per kind: the reason names the first, the rest are counted. */
const MAX_EVIDENCE = 12;

function push(list: AbapDeliveryEvidence[], line: number, what: string): void {
  if (list.length < MAX_EVIDENCE && !list.some((e) => e.line === line && e.what === what)) list.push({ line, what });
}

const words = (list: readonly AbapDeliveryEvidence[]) =>
  list.slice(0, 3).map((e) => `${e.what} (L${e.line})`).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');

export function abapDeliveryOf(facts: { statements: readonly AbapStatement[]; graph: CallGraphReport; contract: OriginalContract }): AbapDelivery {
  const background: AbapDeliveryEvidence[] = [];
  const dialog: AbapDeliveryEvidence[] = [];
  const output: AbapDeliveryEvidence[] = [];

  for (const s of facts.graph.submits) if (s.viaJob) push(background, s.lineStart, `SUBMIT ${s.program ?? s.programExpression} VIA JOB`);
  for (const f of facts.graph.functionModules) {
    if (!f.name) continue;
    if (JOB_MODULES.test(f.name)) push(background, f.lineStart, f.name);
    else if (POPUP_MODULES.test(f.name)) push(dialog, f.lineStart, f.name);
    else if (ALV_MODULES.test(f.name)) push(output, f.lineStart, f.name);
  }
  for (const c of facts.graph.callbacks) if (/USER_COMMAND/i.test(c.trigger)) push(dialog, c.lineStart, `ALV callback ${c.to}`);

  for (const s of facts.statements) {
    const t = s.text;
    if (/\bsy-batch\b/i.test(t)) push(background, s.lineStart, 'sy-batch');
    switch (s.keyword) {
      case 'CALL':
        if (/^CALL\s+SCREEN\b/i.test(t)) push(dialog, s.lineStart, 'CALL SCREEN');
        else if (/^CALL\s+SELECTION-SCREEN\b/i.test(t)) push(dialog, s.lineStart, 'CALL SELECTION-SCREEN');
        break;
      case 'AT':
        if (/^AT\s+(?:USER-COMMAND|LINE-SELECTION|PF\d+)\b/i.test(t)) push(dialog, s.lineStart, t.replace(/\s*\.$/, '').toUpperCase());
        break;
      case 'SET':
        if (/^SET\s+PF-STATUS\b/i.test(t)) push(dialog, s.lineStart, 'SET PF-STATUS');
        break;
      case 'WRITE':
        push(output, s.lineStart, 'WRITE');
        break;
      default:
        if (/\bcl_gui_alv_grid\b/i.test(t)) push(dialog, s.lineStart, 'CL_GUI_ALV_GRID');
        else if (/\bcl_salv_table\s*=>\s*factory\b/i.test(t)) push(output, s.lineStart, 'CL_SALV_TABLE');
    }
  }
  for (const list of [background, dialog, output]) list.sort((a, b) => a.line - b.line);
  const inputs = facts.contract.inputs.length;

  let kind: AbapDelivery['kind'];
  let reason: string;
  if (background.length > 0 && dialog.length === 0 && output.length === 0) {
    kind = 'application-job';
    reason = `The original runs in the background (${words(background)}) and has no dialog and no list: an Application Job replaces the report, without a UI service.`;
  } else if (background.length > 0) {
    kind = 'ui-service-and-job';
    reason = `The original runs in the background (${words(background)}) and also ${dialog.length > 0 ? `has a dialog (${words(dialog)})` : `shows a list (${words(output)})`}: an Application Job for the unattended run and the UI service for what a user saw.`;
  } else if (inputs === 0 && dialog.length === 0 && output.length === 0) {
    kind = 'application-job';
    reason = 'The original takes no selection input, has no dialog and shows no list: it can only run unattended, so an Application Job replaces the report, without a UI service.';
  } else {
    kind = 'ui-service';
    reason = 'No background use in the original (no SUBMIT … VIA JOB, no job function module, no sy-batch check): the process runs through the Fiori UI service.';
  }
  return { kind, reason, background, dialog, output, inputs };
}
