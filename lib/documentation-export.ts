/**
 * The Confluence pages of the documentation stage — the legacy blueprint and
 * the engine document (roadmap 3.0.5), as HTML a reviewer opens.
 *
 * Moved here out of `app/(app)/project/[projectId]/documentation/page.tsx` in
 * block D, step D.16a, unchanged: the page is a screen and is held to the
 * design tokens (`tests/design-source-guard.spec.ts`), while these are
 * documents that leave the application. Since D.28 they carry the stylesheet
 * all stage exports share, `lib/export-style.ts`, for a reader who opens them
 * outside it. The page builds nothing here itself; it asks for the file and
 * saves it.
 *
 * Every value in both documents was written by a model or read from the
 * customer's own source, and every one goes through `escapeHtml`
 * (`tests/export-escaping-guard.spec.ts` reads this file for that).
 */
import { escapeHtml } from '@/lib/utils';
import { EXPORT_STYLE_ELEMENT } from '@/lib/export-style';
import {
  anchorsWords,
  stepEvidence,
  type ProcessDocumentation,
} from '@/lib/process-documentation';

/** The stored forms are model JSON, read exactly as the page reads them. */
type ModelJson = any;

/**
 * What a stale export says about itself (owner decision 30.09.2026, QA
 * c8ae21453b3b). A documentation the workflow contract (`lib/workflow-steps.ts`)
 * calls `stale` stays exportable — it is not blocked — but the file does not
 * pass itself off as current: it opens with this note, and the page's export
 * button carries the same warning ("Stale — regenerate first") beside it, so
 * the reader is told before the download what the file then says itself.
 */
export const STALE_EXPORT_NOTE =
  'Stale — this documentation was written for an earlier source or an earlier step. Regenerate it before relying on it.';

/** Options both Confluence pages take. */
export interface ConfluenceExportOptions {
  /** True when the documentation phase is `stale` in `workflowSteps(project)`. */
  stale?: boolean;
}

/** The note a stale export opens with; empty for a current one. Our own markup, no model value. */
function staleNoteHtml(options: ConfluenceExportOptions | undefined): string {
  if (!options?.stale) return '';
  return `<p class="card accent-warning" data-stale-export=""><span class="tag tone-warning">Stale</span> ${escapeHtml(STALE_EXPORT_NOTE.replace(/^Stale — /, ''))}</p>`;
}

/**
 * The legacy blueprint's Confluence page.
 *
 * The export is an HTML document a reviewer opens, and every value in it
 * was written by the model from the customer's own ABAP — a comment in the
 * source is enough to steer it into returning markup (QA review of
 * 33471220d6e9, 06f7c0c56a6c). Nothing generated reaches the document
 * unescaped; the markup around it is ours.
 */
export function buildLegacyConfluenceHtml(
  parsedDoc: ModelJson,
  parsedBusinessDoc: ModelJson | null,
  options?: ConfluenceExportOptions,
): Blob {
  const esc = escapeHtml;
  const staleSection = staleNoteHtml(options);

  // The stylesheet every stage export shares (`lib/export-style.ts`).
  const confluenceCSS = EXPORT_STYLE_ELEMENT;

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        ${confluenceCSS}
      </head>
      <body>
        ${staleSection}
        <div class="header">
          <h1>${esc(parsedDoc.l1_domain?.name || 'Process documentation')}</h1>
          <div class="meta">Enterprise Integration Specifications & Workflow Definition</div>
        </div>
        
        <div class="card-grid">
          <div class="card">
            <div class="card-title">Level 1: Business Domain Blueprint</div>
            <p><strong>Strategic Goal:</strong> ${esc(parsedDoc.l1_domain?.strategicGoal || 'N/A')}</p>
            <span class="tag tone-neutral">Owner: ${esc(parsedDoc.l1_domain?.owner || 'N/A')}</span>
          </div>
          
          <div class="card">
            <div class="card-title">Level 2: Process Area Group</div>
            <p><strong>Process Area:</strong> ${esc(parsedDoc.l2_group?.processArea || 'N/A')}</p>
            <p><strong>KPI Framework:</strong></p>
            <div>
              ${(parsedDoc.l2_group?.kpis || []).map((kpi: string) => `<span class="tag tone-neutral">${esc(kpi)}</span>`).join(' ')}
            </div>
          </div>
        </div>
        
        <h2>Level 4: Architectural Task Specifications</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 10%">ID</th>
              <th style="width: 25%">Task Name</th>
              <th style="width: 35%">Functional Description</th>
              <th style="width: 15%">Complexity</th>
              <th style="width: 15%">Technology Stack</th>
            </tr>
          </thead>
          <tbody>
            ${(parsedDoc.l4_tasks || []).map((task: any) => `
              <tr>
                <td class="mono strong">${esc(task.stepId)}</td>
                <td><strong>${esc(task.name) || `Task ${esc(task.stepId)}`}</strong></td>
                 <td>
                   <p>${esc(task.description)}</p>
                   <p class="meta">
                     <strong>Inputs:</strong> ${esc((task.inputs || []).join(', ') || 'N/A')} | 
                     <strong>Outputs:</strong> ${esc((task.outputs || []).join(', ') || 'N/A')}
                   </p>
                 </td>
                <td>
                  <span class="${
                    task.complexity === 'High' ? 'tag tone-error' :
                    task.complexity === 'Medium' ? 'tag tone-warning' :
                    'tag tone-neutral'
                  }">${esc(task.complexity || 'Low')}</span>
                </td>
                <td>
                  ${(task.systems || []).map((sys: string) => `<span class="tag tone-neutral">${esc(sys)}</span>`).join(' ')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${parsedBusinessDoc ? `
          <h2>Level 5: Standard Operating Procedures (SOP) & RACI Assignment</h2>
          
          <h3>RACI Assignment Matrix</h3>
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Responsible (R)</th>
                <th>Accountable (A)</th>
                <th>Consulted (C)</th>
                <th>Informed (I)</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.raci_matrix || []).map((raci: any) => `
                <tr>
                  <td class="mono strong">${esc(raci.stepId)}</td>
                  <td>${esc(raci.r || 'N/A')}</td>
                  <td>${esc(raci.a || 'N/A')}</td>
                  <td>${esc(raci.c || 'N/A')}</td>
                  <td>${esc(raci.i || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h3>SOP Operational Playbook</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 15%">Task ID</th>
                <th style="width: 50%">Operational SOP Description</th>
                <th style="width: 20%">Business Exception Fallback</th>
                <th style="width: 15%">KPI Success Metric</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.sop_details || []).map((sop: any) => `
                <tr>
                  <td class="mono strong">${esc(sop.stepId)}</td>
                  <td>${esc(sop.narrative || 'N/A')}</td>
                  <td>${esc(sop.businessException || 'N/A')}</td>
                  <td class="strong">${esc(sop.kpiTarget || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <h3>Internal Audit Compliance & Risk Controls</h3>
          <table>
            <thead>
              <tr>
                <th>Task ID</th>
                <th>Control Objective</th>
                <th>Mitigation Action</th>
                <th>Assertion Verification Method</th>
              </tr>
            </thead>
            <tbody>
              ${(parsedBusinessDoc.audit_controls || []).map((ctrl: any) => `
                <tr>
                  <td class="mono strong">${esc(ctrl.stepId)}</td>
                  <td><strong>${esc(ctrl.controlObjective || 'N/A')}</strong></td>
                  <td>${esc(ctrl.mitigationAction || 'N/A')}</td>
                  <td class="mono">${esc(ctrl.assertionMethod || 'N/A')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </body>
    </html>
  `;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}

/** The file name both pages are saved under. */
export function confluenceFileName(projectName: string | undefined): string {
  const fileName = (projectName || 'Project').replace(/\s+/g, '_');
  return `${fileName}_Confluence.html`;
}

/**
 * Roadmap 3.0.5 — the Confluence page of the engine document: the same
 * content as the stage shows, every value escaped, nothing added. The
 * business layer, when there is one, follows as a model proposal.
 */
export function buildEngineConfluenceHtml(
  engine: ProcessDocumentation,
  parsedBusinessDoc: ModelJson | null,
  options?: ConfluenceExportOptions,
): Blob {
  const esc = escapeHtml;
  const staleSection = staleNoteHtml(options);
  // The stylesheet every stage export shares (`lib/export-style.ts`).
  const exportCSS = EXPORT_STYLE_ELEMENT;
  const statementById = new Map(engine.statements.map((s) => [s.id, s]));
  const stepRows = engine.steps.map((step) => {
    const sentence = step.statementId ? statementById.get(step.statementId) : undefined;
    const name = step.businessName
      ? `${esc(step.businessName)} <small>(${esc(step.technicalName)}) — Model proposal</small>`
      : esc(step.technicalName);
    return `<tr><td><code>${esc(step.id)}</code><br>${esc(step.kind)}</td><td>${name}${step.lane ? `<br><small>Lane: ${esc(step.lane)} — Model proposal</small>` : ''}</td><td>${sentence ? esc(sentence.text) : ''}</td><td>${esc(stepEvidence(step))}</td></tr>`;
  }).join('');
  const statementSection = engine.statements
    .map((s) => `<li>${esc(s.text)} <small>— ${esc(anchorsWords(s.anchors))}</small></li>`)
    .join('');
  const gapSection = engine.notDetermined
    .map((g) => `<li><strong>${esc(g.subject)}:</strong> Not determined — ${esc(g.reason)}</li>`)
    .join('');
  // The business layer the stage shows below the engine document. It was
  // promised by the comment above and never written, so an export of a
  // project with an SOP left the SOP out (QA review of 4b4586aff273). Every
  // value in it was written by the model: it is marked as a proposal and
  // escaped like the rest.
  const businessSection = parsedBusinessDoc
    ? `<h2 data-business-layer="">Business layer — Model proposal</h2>
    <p><em>Written by a language model from the documentation above. Not derived from the code, and not verified.</em></p>
    <h3>RACI assignment</h3>
    <table><thead><tr><th>Step</th><th>Responsible (R)</th><th>Accountable (A)</th><th>Consulted (C)</th><th>Informed (I)</th></tr></thead><tbody>${(parsedBusinessDoc.raci_matrix || [])
      .map((raci: Record<string, unknown>) => `<tr><td><code>${esc(raci.stepId)}</code></td><td>${esc(raci.r || 'N/A')}</td><td>${esc(raci.a || 'N/A')}</td><td>${esc(raci.c || 'N/A')}</td><td>${esc(raci.i || 'N/A')}</td></tr>`)
      .join('')}</tbody></table>
    <h3>Standard operating procedure</h3>
    <table><thead><tr><th>Step</th><th>Description</th><th>Business exception</th><th>KPI</th></tr></thead><tbody>${(parsedBusinessDoc.sop_details || [])
      .map((sop: Record<string, unknown>) => `<tr><td><code>${esc(sop.stepId)}</code></td><td>${esc(sop.narrative || 'N/A')}</td><td>${esc(sop.businessException || 'N/A')}</td><td>${esc(sop.kpiTarget || 'N/A')}</td></tr>`)
      .join('')}</tbody></table>
    <h3>Audit controls</h3>
    <table><thead><tr><th>Step</th><th>Control objective</th><th>Mitigation</th><th>Verification</th></tr></thead><tbody>${(parsedBusinessDoc.audit_controls || [])
      .map((ctrl: Record<string, unknown>) => `<tr><td><code>${esc(ctrl.stepId)}</code></td><td>${esc(ctrl.controlObjective || 'N/A')}</td><td>${esc(ctrl.mitigationAction || 'N/A')}</td><td>${esc(ctrl.assertionMethod || 'N/A')}</td></tr>`)
      .join('')}</tbody></table>`
    : '';
  const engineHtml = `<html><head><meta charset="utf-8">${exportCSS}</head><body>
    ${staleSection}
    <h1>Process documentation — ${esc(engine.processName)}</h1>
    <p><em>${esc(engine.disclaimer)}</em></p>
    <p>${esc(engine.fileName)}, ${esc(String(engine.lineCount))} lines. ${esc(engine.overview)} ${esc(engine.traceability.sentence)}</p>
    <h2>The process, element by element</h2>
    <table><thead><tr><th>Element</th><th>Name</th><th>What it does</th><th>Lines</th></tr></thead><tbody>${stepRows}</tbody></table>
    <h2>Business statements, across the whole program</h2><ul>${statementSection}</ul>
    <h2>Not determined from the code</h2><ul>${gapSection}</ul>
    ${businessSection}
  </body></html>`;
  return new Blob([engineHtml], { type: 'text/html;charset=utf-8' });
}
