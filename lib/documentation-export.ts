/**
 * The Confluence pages of the documentation stage — the legacy blueprint and
 * the engine document (roadmap 3.0.5), as HTML a reviewer opens.
 *
 * Moved here out of `app/(app)/project/[projectId]/documentation/page.tsx` in
 * block D, step D.16a, unchanged: the page is a screen and is held to the
 * design tokens (`tests/design-source-guard.spec.ts`), while these are
 * documents that leave the application and carry their own stylesheet, with
 * its own colours, for a reader who opens them outside it. The page builds
 * nothing here itself; it asks for the file and saves it.
 *
 * Every value in both documents was written by a model or read from the
 * customer's own source, and every one goes through `escapeHtml`
 * (`tests/export-escaping-guard.spec.ts` reads this file for that).
 */
import { escapeHtml } from '@/lib/utils';
import {
  anchorsWords,
  stepEvidence,
  type ProcessDocumentation,
} from '@/lib/process-documentation';

/** The stored forms are model JSON, read exactly as the page reads them. */
type ModelJson = any;

/**
 * The legacy blueprint's Confluence page.
 *
 * The export is an HTML document a reviewer opens, and every value in it
 * was written by the model from the customer's own ABAP — a comment in the
 * source is enough to steer it into returning markup (QA review of
 * 33471220d6e9, 06f7c0c56a6c). Nothing generated reaches the document
 * unescaped; the markup around it is ours.
 */
export function buildLegacyConfluenceHtml(parsedDoc: ModelJson, parsedBusinessDoc: ModelJson | null): Blob {
  const esc = escapeHtml;

  const confluenceCSS = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172B4D; line-height: 1.6; padding: 20px; }
      .doc-header { background: #0747A6; color: white; padding: 24px; border-radius: 8px; margin-bottom: 30px; }
      .doc-header h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; }
      .doc-header p { margin: 8px 0 0 0; opacity: 0.8; font-weight: 500; }
      h2 { color: #0747A6; border-bottom: 2px solid #DFE1E6; padding-bottom: 8px; margin-top: 40px; font-size: 20px; text-transform: uppercase; }
      .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
      .meta-card { background: #F4F5F7; padding: 20px; border-radius: 8px; border: 1px solid #DFE1E6; }
      .meta-card h3 { margin: 0 0 10px 0; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; }
      .meta-card p { margin: 0; font-weight: 600; font-size: 15px; }
      .meta-card .badge { display: inline-block; background: #DEEBFF; color: #0747A6; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 8px; }
      table { border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      th, td { border: 1px solid #DFE1E6; padding: 12px; text-align: left; }
      th { background-color: #F4F5F7; font-weight: 700; color: #42526E; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
      .complexity-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
      .complexity-high { background: #FFEBE6; color: #BF2600; }
      .complexity-medium { background: #FFF0B3; color: #172B4D; }
      .complexity-low { background: #EAE6FF; color: #403294; }
      .tech-pill { display: inline-block; background: #E3FCEF; color: #006644; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 4px; }
    </style>
  `;

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        ${confluenceCSS}
      </head>
      <body>
        <div class="doc-header">
          <h1>${esc(parsedDoc.l1_domain?.name || 'Process documentation')}</h1>
          <p>Enterprise Integration Specifications & Workflow Definition</p>
        </div>
        
        <div class="meta-grid">
          <div class="meta-card">
            <h3>Level 1: Business Domain Blueprint</h3>
            <p><strong>Strategic Goal:</strong> ${esc(parsedDoc.l1_domain?.strategicGoal || 'N/A')}</p>
            <div class="badge">Owner: ${esc(parsedDoc.l1_domain?.owner || 'N/A')}</div>
          </div>
          
          <div class="meta-card">
            <h3>Level 2: Process Area Group</h3>
            <p><strong>Process Area:</strong> ${esc(parsedDoc.l2_group?.processArea || 'N/A')}</p>
            <p style="margin-top: 10px;"><strong>KPI Framework:</strong></p>
            <div style="margin-top: 5px;">
              ${(parsedDoc.l2_group?.kpis || []).map((kpi: string) => `<span class="tech-pill">${esc(kpi)}</span>`).join('')}
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
                <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(task.stepId)}</td>
                <td><strong>${esc(task.name) || `Task ${esc(task.stepId)}`}</strong></td>
                 <td>
                   <p style="margin: 0;">${esc(task.description)}</p>
                   <p style="margin: 6px 0 0 0; font-size: 11px; color: #6B778C;">
                     <strong>Inputs:</strong> ${esc((task.inputs || []).join(', ') || 'N/A')} | 
                     <strong>Outputs:</strong> ${esc((task.outputs || []).join(', ') || 'N/A')}
                   </p>
                 </td>
                <td>
                  <span class="complexity-badge ${
                    task.complexity === 'High' ? 'complexity-high' :
                    task.complexity === 'Medium' ? 'complexity-medium' :
                    'complexity-low'
                  }">${esc(task.complexity || 'Low')}</span>
                </td>
                <td>
                  ${(task.systems || []).map((sys: string) => `<span class="tech-pill">${esc(sys)}</span>`).join('')}
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
                  <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(raci.stepId)}</td>
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
                  <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(sop.stepId)}</td>
                  <td>${esc(sop.narrative || 'N/A')}</td>
                  <td style="color: #BF2600; font-weight: 500;">${esc(sop.businessException || 'N/A')}</td>
                  <td style="font-weight: 600; color: #006644;">${esc(sop.kpiTarget || 'N/A')}</td>
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
                  <td style="font-family: monospace; font-weight: bold; color: #0747A6;">${esc(ctrl.stepId)}</td>
                  <td><strong>${esc(ctrl.controlObjective || 'N/A')}</strong></td>
                  <td>${esc(ctrl.mitigationAction || 'N/A')}</td>
                  <td style="font-family: monospace; font-size: 11px;">${esc(ctrl.assertionMethod || 'N/A')}</td>
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
export function buildEngineConfluenceHtml(engine: ProcessDocumentation, parsedBusinessDoc: ModelJson | null): Blob {
  const esc = escapeHtml;
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
  const engineHtml = `<html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #172B4D; line-height: 1.6; padding: 20px; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #DFE1E6; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #F4F5F7; } small { color: #6B778C; }
  </style></head><body>
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
