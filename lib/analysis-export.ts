/**
 * The Analyze stage's Confluence page — the HTML document a reviewer opens or
 * pastes into Confluence.
 *
 * Moved here out of `app/(app)/project/[projectId]/analyze/page.tsx` in block
 * D, step D.28, as D.16a did for the documentation stage: the page is a screen
 * and is held to the design tokens, while this is a document that leaves the
 * application and takes its look from `lib/export-style.ts`. The page builds
 * nothing here itself; it asks for the file and saves it.
 *
 * Nearly every value in it was written either by the account holder (the
 * project name) or by the model out of the customer's own ABAP — a comment in
 * the uploaded source is enough to steer it into returning markup
 * (SEC-2026-014). Nothing of either kind reaches the template unescaped; the
 * markup around it is ours. The same `esc` as the design and documentation
 * exports, from the one escaper in `lib/export-safety.ts`.
 *
 * Attributes are the other half of the rule: escaping the five HTML
 * characters still leaves a value free inside `class="…"`, so no attribute in
 * this document interpolates a foreign value at all. Every class a branch
 * picks is hoisted into a local constant and the attribute reads only that
 * constant. `tests/export-escaping-guard.spec.ts` reads this file for both.
 */
import type { Project, AnalysisData } from '@/lib/types';
import type { ExtensibilityRouteReport } from '@/lib/abap/extensibility-router';
import { escapeHtml } from '@/lib/export-safety';
import { formatIsoDate } from '@/lib/format';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { readModelGaps, gapsUnreadableSentence } from '@/lib/model-gaps';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { readStoredAnalysis, withoutUnapprovedMoney } from '@/lib/money-honesty';
import { APP_VERSION } from '@/lib/version';
import { modelActionPlan } from '@/lib/action-plan';
import { EXPORT_CSS, severityClass, toneClass } from '@/lib/export-style';

export interface AnalysisExportInput {
  project: Project;
  /** The routing of the run on screen; its score is the one the run was signed with. */
  routeReport: ExtensibilityRouteReport | null;
  legacyCode: string;
  uploadedFileName: string;
  targetDeployment: 'public' | 'private' | null;
}

/** The stylesheet every stage export shares (`lib/export-style.ts`). */
const baseCSS = EXPORT_CSS;

/** The analysis page as one HTML string, or `null` when there is no analysis. */
export function buildAnalysisExportHtml(input: AnalysisExportInput): string | null {
  const { project, routeReport, legacyCode, uploadedFileName, targetDeployment } = input;
  if (!project?.analysis) return null;
  const esc = escapeHtml;

  let htmlContent = '';

  // The same reader as the stage itself: every stored shape, amounts of money masked (lib/money-honesty.ts).
  const data = readStoredAnalysis<AnalysisData>(project.analysis);
  // The score in the export is the one the run was signed with — the project
  // field the server wrote — never a number the model returned (e184fc0c59bf).
  const signedScore: number | null =
    typeof routeReport?.cleanCoreScore === 'number'
      ? routeReport.cleanCoreScore
      : typeof project?.cleanCoreScore === 'number'
        ? project.cleanCoreScore
        : null;
  const isJson = data !== null;

  if (isJson && data) {
    // Local fallback for Confluence export
    // Every field here used to carry a fallback that manufactured the answer when
    // the model had not produced one: an asset score of 82/55/35 chosen by a
    // string comparison, a maintenance cost of `(100 - score) * 180 + 1200`
    // rendered into the export as €/yr, value drivers picked by searching the
    // context for the word "partner", and a flat "~40%" ROI claim. This document
    // is exported to Confluence and kept by a customer.
    //
    // The prompt in `lib/analysis-prompt.ts` is careful about exactly this — it
    // asks the model for a RANGE, hedged language and a calibration disclaimer.
    // The fallback then threw that discipline away. Missing values are now
    // missing, and the renderer says so.
    const bizFallback = {
      legacyAssetScore: data.businessValueAnalysis?.legacyAssetScore ?? null,
      technicalDebtLevel: data.businessValueAnalysis?.technicalDebtLevel ??
        (typeof data.cleanCoreScore === 'number'
          ? (data.cleanCoreScore < 50 ? 'High' : data.cleanCoreScore < 75 ? 'Medium' : 'Low')
          : null),
      valueDrivers: data.businessValueAnalysis?.valueDrivers ?? null,
      plainEnglishActionPlan: modelActionPlan(data.businessValueAnalysis?.plainEnglishActionPlan) ?? [
        "1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.",
        "2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.",
        `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${project.extensibilityRoute || data.extensibilityRouting?.recommendedRoute || 'decoupled'} architecture.`
      ]
    };

    // Build visual table for gaps. A single object is one gap; any other
    // shape is said in the table instead of leaving it silently empty.
    const gapsReading = readModelGaps(data.gaps);
    const gapsUnreadableRow = gapsReading.unreadable
      ? `
        <tr>
          <td colspan="5" class="muted">${esc(gapsUnreadableSentence(gapsReading.unreadable))}</td>
        </tr>
      `
      : '';
    const gapsRows = (gapsReading.gaps as AnalysisData['gaps']).map(g => {
      const sevClass = severityClass(g.severity);
      return `
        <tr>
          <td class="strong">${esc(g.title)}</td>
          <td><span class="${sevClass}">${esc(g.severity)}</span></td>
          <td class="strong">${esc(g.strategy)}</td>
          <td class="muted">${esc(g.rationale)}</td>
          <td class="strong">${esc(g.complexity)}</td>
        </tr>
      `;
    }).join('') + gapsUnreadableRow;

    const stepsList = data.strategicNextSteps?.map(step => `
        <li><strong>${esc(step)}</strong></li>
      `).join('') || '';

    /*
     * `decisionTreeCheckpoints` and `comparativeAnalysis` are optional: the model
     * returns them when it produced them, and often it did not. Where it had not,
     * this export wrote four complete checkpoints and a full two-track comparison
     * — named milestones, an "Evaluation Question", a "Legacy Code Assessment"
     * per checkpoint, feasibility grades, pros and cons — all of it decided by
     * one boolean: whether the chosen route contains the letters "BTP". Nothing
     * had been assessed and none of it was read off the customer's code, yet the
     * document said the code "was evaluated step-by-step" and that the comparison
     * was "mapped specifically to this project's requirements". This file is
     * exported to Confluence and kept as the record of a decision (QA 0613631545b2).
     *
     * The screen had the same fallback one layer down, in
     * `components/analyze/ExtensibilityDecisionMatrix.tsx`; both are gone, because
     * a corrected export beside a screen that still invents is not a correction.
     *
     * Same rule as the business-value block above: a missing value is reported
     * missing.
     */
    const checkpoints = data.extensibilityRouting?.decisionTreeCheckpoints ?? null;
    const comparative = data.extensibilityRouting?.comparativeAnalysis ?? null;
    const notDetermined = (what: string) => `
            <div class="note">
              <div class="card-title">Not determined for this run</div>
              <p>${what} Nothing is inferred here from the chosen route.</p>
            </div>`;

    const checkpointsRows = (checkpoints ?? []).map((cp, idx) => {
      // A model that answers with something other than a string used to crash
      // the export here, on .includes(), before anything was rendered. A route
      // is a word, not a state: every result is the same neutral chip.
      const state = String(cp.resultState ?? '');
      const stateClass = toneClass('neutral');
      return `
        <tr>
          <td class="strong">${idx + 1}</td>
          <td class="strong">${esc(cp.checkpointName)}</td>
          <td>${esc(cp.question)}</td>
          <td>${esc(cp.evaluation)}</td>
          <td><span class="${stateClass}">${esc(state)}</span></td>
        </tr>
      `;
    }).join('');

    // The two score cards below mark their left rule by threshold. Both are
    // decided here so that the template's `class="…"` reads a constant rather
    // than an expression over a stored value. A low score is not a proof, so
    // it is neutral, never green.
    const complexity = project.complexityScore;
    const criticality = project.criticalityScore;
    const complexityAccent = complexity !== undefined && complexity >= 7 ? 'card accent-error' : complexity !== undefined && complexity >= 4 ? 'card accent-warning' : 'card accent-neutral';
    const criticalityAccent = criticality !== undefined && criticality >= 7 ? 'card accent-error' : criticality !== undefined && criticality >= 4 ? 'card accent-warning' : 'card accent-neutral';
    const complexityNote = complexity !== undefined && complexity >= 7
      ? 'High — significant refactoring needed'
      : complexity !== undefined && complexity >= 4 ? 'Moderate — manageable effort' : 'Low — straightforward migration';
    const criticalityNote = criticality !== undefined && criticality >= 7
      ? 'Mission-critical — requires careful planning'
      : criticality !== undefined && criticality >= 4 ? 'Important — schedule appropriately' : 'Low impact — quick win candidate';

    htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>${baseCSS}</style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${esc(data.projectTitle || project.name)}</h1>
            <div class="meta">Clean Core Compliance: <strong>${typeof signedScore === 'number' ? `${signedScore}%` : 'not computed'}</strong> | Generated by Clean-Core.io | ${esc(formatIsoDate(new Date()) ?? '')}</div>
          </div>
          <div class="content">
            <div class="summary-box">
              <h3>Executive Summary</h3>
              <p>${esc(data.summary)}</p>
            </div>

            <h2>Business Value & Executive Action Center</h2>
            <div class="card-grid">
              <div class="card">
                <div class="card-title">Business Asset Audit</div>
                <p><strong>Legacy Asset Score:</strong> ${bizFallback.legacyAssetScore !== null ? `${esc(bizFallback.legacyAssetScore)}% (Custom IP Value)` : 'not computed'}</p>
                <p><strong>Technical Debt Level:</strong> ${esc(bizFallback.technicalDebtLevel ?? 'not computed')}</p>
                <p><strong>Annual maintenance cost:</strong> not determined</p>
                <div><strong>Value Drivers:</strong></div>
                <ul>
                  ${(bizFallback.valueDrivers ?? []).map(d => `<li>${esc(d)}</li>`).join('') || '<li>not identified for this run</li>'}
                </ul>
                <p class="note">
                  <strong>Cost and ROI:</strong> Not determined. A cost or ROI figure needs approved cost assumptions, and this analysis has none — the Economics stage models costs only from figures you enter.
                </p>
              </div>
              <div class="card">
                <div class="card-title">Plain English Stakeholder Roadmap</div>
                <p class="muted">Simplified action items to modernize this business capability successfully:</p>
                <ul class="strong">
                  ${bizFallback.plainEnglishActionPlan.map(action => `<li>${esc(action)}</li>`).join('')}
                </ul>
              </div>
            </div>

            <h2>As-Is Process & Legacy Context</h2>
            <p>${esc(data.asIsContext)}</p>

            <h2>Standard Fit Assessment</h2>
            <p><strong>Target Standard Process ID / Module:</strong> ${esc(data.standardFit?.targetStandardProcess || 'N/A')}</p>
            <p><strong>Standardization Potential:</strong> <span class="tag tone-neutral">${esc(data.standardFit?.potential || 'not computed')}</span></p>
            <p>${esc(data.standardFit?.rationale)}</p>

            <h2>SAP Extensibility Routing Decision Path</h2>
            ${checkpoints === null ? notDetermined('This analysis did not return the step-by-step checkpoints behind the routing decision.') : `
            <p>The legacy ABAP code was evaluated step-by-step against the official SAP Clean Core extensibility decision tree. Below is the detailed pathway and checkpoint audit:</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%;">Step</th>
                  <th style="width: 20%;">Decision Milestone</th>
                  <th style="width: 25%;">Evaluation Question</th>
                  <th style="width: 40%;">Legacy Code Assessment</th>
                  <th style="width: 10%;">Result State</th>
                </tr>
              </thead>
              <tbody>
                ${checkpointsRows}
              </tbody>
            </table>`}

            <h2>Extensibility Track Comparative Matrix</h2>
            ${comparative === null ? notDetermined('This analysis did not return a side-by-side comparison of the two extensibility tracks.') : `
            <p>Direct architectural comparison of both available tracks mapped specifically to this project's requirements:</p>
            <div class="card-grid">
              <div class="card">
                <div class="card-title">In-App ABAP Cloud (RAP) Track</div>
                <p class="meta">Feasibility: ${esc(comparative.inAppABAPCloud.technicalFeasibility)}</p>
                <p>${esc(comparative.inAppABAPCloud.fitDetails)}</p>
                <div><strong>Technical Pros:</strong></div>
                <ul>
                  ${comparative.inAppABAPCloud.pros.map(pro => `<li>${esc(pro)}</li>`).join('')}
                </ul>
                <div><strong>Limitations (Cons):</strong></div>
                <ul class="muted">
                  ${comparative.inAppABAPCloud.cons.map(con => `<li>${esc(con)}</li>`).join('')}
                </ul>
              </div>
              <div class="card">
                <div class="card-title">Side-by-Side SAP BTP (CAP) Track</div>
                <p class="meta">Feasibility: ${esc(comparative.sideBySideBTP.technicalFeasibility)}</p>
                <p>${esc(comparative.sideBySideBTP.fitDetails)}</p>
                <div><strong>Technical Pros:</strong></div>
                <ul>
                  ${comparative.sideBySideBTP.pros.map(pro => `<li>${esc(pro)}</li>`).join('')}
                </ul>
                <div><strong>Limitations (Cons):</strong></div>
                <ul class="muted">
                  ${comparative.sideBySideBTP.cons.map(con => `<li>${esc(con)}</li>`).join('')}
                </ul>
              </div>
            </div>`}

            <h2>Functional Gaps Analysis Matrix</h2>
            <table>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Divergence</th>
                  <th>Mitigation Strategy</th>
                  <th>Technical Rationale</th>
                  <th>Complexity</th>
                </tr>
              </thead>
              <tbody>
                ${gapsRows}
              </tbody>
            </table>

            <h2>Modernization Recommendations</h2>
            <div class="card-grid">
              <div class="card">
                <div class="card-title">Keep Core Clean</div>
                <p>${esc(data.recommendations?.keepCoreClean)}</p>
              </div>
              <div class="card">
                <div class="card-title">Decommissioning</div>
                <p>${esc(data.recommendations?.decommissioning)}</p>
              </div>
              <div class="card">
                <div class="card-title">Cloud Readiness</div>
                <p>${esc(data.recommendations?.cloudReadiness)}</p>
              </div>
            </div>

            <h2>Architectural Next Steps</h2>
            <ol>
              ${stepsList}
            </ol>

            <h2>Detailed Technical Assessment</h2>
            ${complexity !== undefined || criticality !== undefined ? `
            <div class="card-grid">
              ${complexity !== undefined ? `
              <div class="${complexityAccent}">
                <div class="card-title">Complexity Score</div>
                <p class="score">${esc(complexity)}<span class="muted">/10</span></p>
                <p class="muted">${complexityNote}</p>
              </div>` : ''}
              ${criticality !== undefined ? `
              <div class="${criticalityAccent}">
                <div class="card-title">Criticality Score</div>
                <p class="score">${esc(criticality)}<span class="muted">/10</span></p>
                <p class="muted">${criticalityNote}</p>
              </div>` : ''}
            </div>` : ''}

            ${(project.codeInventory || []).length > 0 ? `
            <h3>Code Inventory</h3>
            <table>
              <thead><tr>
                <th>Object Name</th>
                <th>Type</th>
                <th>Module</th>
                <th>Criticality</th>
              </tr></thead>
              <tbody>
                ${(project.codeInventory || []).map((item: any) => {
                  const critClass = severityClass(item.criticality || 'Low');
                  return `<tr>
                  <td class="strong">${esc(item.objectName || '')}</td>
                  <td>${esc(item.type || '')}</td>
                  <td>${esc(item.module || '—')}</td>
                  <td>
                    <span class="${critClass}">${esc(item.criticality || 'Low')}</span>
                  </td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>` : ''}

            ${(project.dataCoupling || []).length > 0 ? `
            <h3>Data Coupling Analysis</h3>
            <table>
              <thead><tr>
                <th>Table</th>
                <th>Access Type</th>
                <th>Risk Level</th>
                <th>Recommendation</th>
              </tr></thead>
              <tbody>
                ${(project.dataCoupling || []).map((item: any) => {
                  // A type reference (`Reference`, 2.11) is no write; only the two write forms are red.
                  const writes = item.accessType === 'Write' || item.accessType === 'Read/Write';
                  const accessClass = writes ? 'tag tone-error' : 'tag tone-neutral';
                  const riskClass = severityClass(item.riskLevel || 'Low');
                  return `<tr>
                  <td class="strong">
                    ${esc(item.tableName || '')} ${item.isCustom ? '<span class="meta">(Custom)</span>' : ''}
                  </td>
                  <td>
                    <span class="${accessClass}">${esc(item.accessType || 'Read')}</span>
                  </td>
                  <td>
                    <span class="${riskClass}">${esc(item.riskLevel || 'Low')}</span>
                  </td>
                  <td class="muted">${esc(item.recommendation || '')}</td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>` : ''}

            ${(() => {
              // Evidence Findings table for Confluence export — deduplicated, sorted by severity
              const evidenceForExport = legacyCode ? buildAbapEvidence(legacyCode, uploadedFileName || 'main.abap', targetDeployment as 'public' | 'private').findings : [];
              if (evidenceForExport.length === 0) return '';
              const sevOrd: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
              const grp = new Map<string, { f: typeof evidenceForExport[0]; lines: number[]; snippets: string[] }>();
              for (const ef of evidenceForExport) {
                const k = `${ef.kind}::${ef.objectName || ef.title}`;
                const ex = grp.get(k);
                if (ex) { ex.lines.push(ef.lineStart); if (ef.snippet && !ex.snippets.includes(ef.snippet)) ex.snippets.push(ef.snippet); }
                else grp.set(k, { f: ef, lines: [ef.lineStart], snippets: ef.snippet ? [ef.snippet] : [] });
              }
              const sorted = Array.from(grp.values()).sort((a, b) => (sevOrd[a.f.severity] ?? 9) - (sevOrd[b.f.severity] ?? 9));
              const rows = sorted.map(({ f, lines, snippets }) => {
                const sevClass = severityClass(f.severity);
                const confClass = (f.sapReplacement?.confidence === 'Catalog Match' || f.sapReplacement?.confidence === 'Verified') ? 'tag tone-success' : f.sapReplacement?.confidence === 'Candidate' ? 'tag tone-warning' : 'tag tone-error';
                const srcClass = toneClass('neutral');
                const srcLabel = f.source === 'static-parser' ? 'Parser' : f.source === 'catalog-match' ? 'Catalog' : 'LLM';
                return `<tr>
                  <td class="strong">${esc(f.title)}${lines.length > 1 ? ` (${lines.length}×)` : ''}<br/><small>${esc(f.kind)}</small></td>
                  <td class="mono">${esc(lines.join(', '))}</td>
                  <td><code>${esc(snippets[0] || '—')}</code></td>
                  <td><span class="${sevClass}">${esc(f.severity)}</span></td>
                  <td><span class="${srcClass}">${srcLabel}</span></td>
                  <td>${f.sapReplacement ? `${esc(f.sapReplacement.objectName)}<br/><span class="${confClass}">${esc(f.sapReplacement.confidence)}</span>` : '—'}</td>
                  <td>${esc((f.targetOptions || []).slice(0, 2).join(', ') || '—')}</td>
                </tr>`;
              }).join('');
              return `
              <h2>Evidence Findings</h2>
              <p class="meta">${sorted.length} unique findings — deduplicated, sorted by severity</p>
              <table>
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Lines</th>
                    <th>Snippet</th>
                    <th>Severity</th>
                    <th>Source</th>
                    <th>SAP Replacement</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`;
            })()}

            ${(() => {
              // Gaps Worklist for Confluence export — combined findings + functional gaps
              const wl: any[] = project?.worklist || [];
              if (wl.length === 0) return '';
              const sevOrd: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
              const sorted = [...wl].sort((a, b) => (sevOrd[a.severity] ?? 9) - (sevOrd[b.severity] ?? 9));
              const wlRows = sorted.map(item => {
                const sevClass = severityClass(item.severity);
                return `<tr>
                  <td class="strong">${esc(item.title || '—')}</td>
                  <td><span class="${sevClass}">${esc(item.severity || '—')}</span></td>
                  <td class="muted">${esc(item.category || '—')}</td>
                  <td>${esc(item.location || '—')}</td>
                  <td class="muted">${esc(item.recommendation || item.strategy || '—')}</td>
                  <td class="strong">${esc(item.effort || '—')}</td>
                  <td class="strong">${esc(item.status || 'open')}</td>
                </tr>`;
              }).join('');
              return `
              <h2>Gaps Worklist</h2>
              <p class="meta">${sorted.length} items — sorted by severity</p>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Recommendation</th>
                    <th>Effort</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${wlRows}</tbody>
              </table>`;
            })()}

            <div class="footer">
              Report generated by Clean-Core.io v${APP_VERSION} | All tabs exported | ${new Date().toISOString()}
            </div>
          </div>
        </body>
        </html>
      `;
  } else {
    // Legacy markdown fallback
    htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>${baseCSS}</style>
        </head>
        <body>
          <div class="header">
            <h1>Business Analysis Report: ${esc(project.name)}</h1>
            <div class="meta">Generated by Clean-Core.io | ${esc(formatIsoDate(new Date()) ?? '')}</div>
          </div>
          <div class="content">
            ${renderMarkdownSafe(withoutUnapprovedMoney(project.analysis))}
          </div>
        </body>
        </html>
      `;
  }

  return htmlContent;
}

/** The file name the page saves the document under. */
export function analysisExportFileName(projectName: string): string {
  return `${projectName.replace(/\s+/g, '_')}_Business_Analysis.html`;
}
