/**
 * The Design stage's Confluence page — the solution design as HTML a reviewer
 * opens, previews or pastes into Confluence.
 *
 * Moved here out of `app/(app)/project/[projectId]/design/page.tsx` in block
 * D, step D.28, as D.16a did for the documentation stage: the page is a screen
 * and is held to the design tokens, while this is a document that leaves the
 * application and takes its look from `lib/export-style.ts`. The page decides
 * whether to preview or save; the document is built here.
 *
 * Everything the model wrote is text, and this document can be opened as HTML
 * in the application's own origin (QA review of 33471220d6e9, 024ec609bc86). A
 * comment in the uploaded ABAP is enough to steer the model into returning
 * markup, so no model value reaches the template unescaped
 * (`tests/export-escaping-guard.spec.ts` reads this file for that).
 */
import type { Project, DesignData } from '@/lib/types';
import { escapeHtml } from '@/lib/utils';
import { sapApiHubLink } from '@/lib/export-safety';
import { cleanAndParseJSON } from '@/lib/design-response';
import { CERTIFIED_SNAPSHOT_NOTE, MVCC_REFUSAL, postCheckDesign, type DesignPostCheck } from '@/lib/design-post-checks';
import { formatIsoDate } from '@/lib/format';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { EXPORT_CSS } from '@/lib/export-style';
import { SIDE_BY_SIDE_ROUTE, isSideBySideRoute, sapNamesForDisplay } from '@/lib/sap-naming';
import { isTargetArchitecture, recommendedArchitecture, type TargetArchitectureCode } from '@/lib/project-commands';
import { getCloudServiceKey } from '@/lib/cloud-service-key';
import {
  COMPARED_OPTION_LABELS,
  COMPARISON_ASPECTS,
  COMPARISON_ASPECT_LABELS,
  readOptionComparison,
} from '@/lib/design-option-comparison';
// SAP identifiers the model wrote, each followed by its check (external review F-03).
import { catalogNoteForMapping, sapAttributionHtml, sapReferenceAnnotator } from '@/lib/sap-reference-check';
import {
  ARCHITECTURE_CENTER_SOURCE,
  FIT_LABEL,
  REFERENCE_OF_SERVICE,
  REFERENCE_OF_TARGET,
  REFERENCE_WORDING,
  SAP_REFERENCE_ARCHITECTURES,
  VERIFIED_AT,
  eventSourceSentence,
  raUrl,
  type ReferenceBinding,
} from '@/lib/sap-reference-architectures';

/** The stylesheet every stage export shares (`lib/export-style.ts`). */
const baseCSS = EXPORT_CSS;

/** The target the reference section names: the signed-off target, else the recommendation. */
function exportTarget(project: Project): { code: TargetArchitectureCode; basis: string } | null {
  if (project.approvedByArchitect === true && isTargetArchitecture(project.targetArchitecture)) {
    return { code: project.targetArchitecture, basis: 'signed off in Design' };
  }
  const code = recommendedArchitecture(project);
  return code ? { code, basis: 'recommended by the analysis' } : null;
}

/** One binding as a table row: RA ID and title (linked), fit, reason, SAP's date and our verification date. */
function referenceRow(b: ReferenceBinding): string {
  const ra = b.ra ? SAP_REFERENCE_ARCHITECTURES[b.ra] : null;
  return `
          <tr>
            <td class="mono strong">${ra ? `<a href="${escapeHtml(raUrl(ra.id))}">${escapeHtml(ra.id)}</a>` : '—'}</td>
            <td>${ra ? escapeHtml(ra.title) : '—'}</td>
            <td class="strong">${escapeHtml(FIT_LABEL[b.fit])}</td>
            <td class="muted">${escapeHtml(b.why)}</td>
            <td class="mono">${ra ? escapeHtml(ra.lastUpdate) : '—'}</td>
            <td class="mono">${escapeHtml(b.verifiedAt)}</td>
          </tr>`;
}

/**
 * "SAP reference pattern for the target" (roadmap 3.0.9, ADR-089): the RA ID
 * and our verification date beside the target. Read from the hand-curated
 * mapping; it changes neither the route nor the score, and it is not part of
 * the signed audit pack.
 */
export function designReferenceSection(project: Project): string {
  const target = exportTarget(project);
  const intro = `<p class="muted">${escapeHtml(REFERENCE_WORDING)} — the pattern SAP documents for this kind of target in the SAP Architecture Center (${escapeHtml(ARCHITECTURE_CENTER_SOURCE.license)}), checked on ${escapeHtml(VERIFIED_AT)}. Not a statement by SAP about this code, and not a reason for the route.</p>`;
  if (!target) {
    return `<h2>${escapeHtml(REFERENCE_WORDING)}</h2>${intro}<p>No target architecture is known for this project, so no pattern is named.</p>`;
  }
  const rows = REFERENCE_OF_TARGET[target.code].map(referenceRow).join('');
  const event = target.code === 'event' ? `<p>${escapeHtml(eventSourceSentence(project.s4Deployment))}</p>` : '';
  return `
            <h2>${escapeHtml(REFERENCE_WORDING)}</h2>
            ${intro}
            <p><strong>Target:</strong> <span class="mono">${escapeHtml(target.code)}</span> (${escapeHtml(target.basis)})</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 10%;">RA</th>
                  <th style="width: 25%;">Title</th>
                  <th style="width: 12%;">Fit</th>
                  <th>Why</th>
                  <th style="width: 11%;">Updated by SAP</th>
                  <th style="width: 10%;">Verified</th>
                </tr>
              </thead>
              <tbody>${rows}
              </tbody>
            </table>
            ${event}`;
}

/** One service's reference, as a line on its card. */
function serviceReference(serviceName: string): string {
  const linked = REFERENCE_OF_SERVICE[getCloudServiceKey(serviceName)].filter((b) => b.ra !== null);
  if (linked.length === 0) return 'none';
  return linked
    .map((b) => {
      const ra = SAP_REFERENCE_ARCHITECTURES[b.ra!];
      return `<a href="${escapeHtml(raUrl(ra.id))}">${escapeHtml(ra.id)}</a> (${escapeHtml(FIT_LABEL[b.fit].toLowerCase())}, verified ${escapeHtml(b.verifiedAt)})`;
    })
    .join(' · ');
}

/** The design page as one HTML string, or `null` when there is no design. */
export function buildDesignExportHtml(currentProject: Project): string | null {
  if (!currentProject?.solutionDesign) return null;
  const esc = escapeHtml;
  const referenceSection = designReferenceSection(currentProject);
  // Every SAP identifier marked here, and the attributions those marks need (CC BY 4.0, SAP-docs).
  const sapRefs = sapReferenceAnnotator();
  const checked = sapRefs.annotate;

  let htmlContent = '';

  // Check if JSON
  let isJson = false;
  let data: DesignData | null = null;
  let post: DesignPostCheck<DesignData> | null = null;
  const trimmedDesignText = currentProject.solutionDesign.trim();
  if (trimmedDesignText.startsWith('{') || (trimmedDesignText.includes('{') && trimmedDesignText.includes('}'))) {
    try {
      // The scaffold's object names, no MVCC consistency promise (3.0.13, `lib/design-post-checks.ts`) —
      // the same checks as the package's solution-design.md.
      post = postCheckDesign(cleanAndParseJSON(currentProject.solutionDesign) as DesignData, currentProject.legacyCode ?? null);
      data = post.design;
      isJson = true;
    } catch {}
  }

  if (isJson && data) {
    // The same routing rule the page's prompt uses: anything not on BTP is an
    // on-stack ABAP Cloud / RAP design, and its export must not call itself a
    // side-by-side Node.js blueprint (QA 7250545cb4ae).
    const onStack = !isSideBySideRoute(currentProject.extensibilityRoute || SIDE_BY_SIDE_ROUTE);
    const structureRows = data.nodeAppBlueprint?.projectStructure?.map(item => {
      if (!item) return '';
      const pathStr = typeof item === 'string' ? item : item.path || '';
      const purposeStr = typeof item === 'string' ? '' : item.purpose || '';
      return `
          <tr>
            <td class="mono strong">${esc(pathStr)}</td>
            <td class="muted">${esc(purposeStr)}</td>
          </tr>
        `;
    }).join('') || '';

    // An HTTP method is a word, not a state: every method is the same neutral chip.
    const endpointsRows = data.nodeAppBlueprint?.apiEndpoints?.map(route => `
        <tr>
          <td><span class="tag tone-neutral mono">${esc(route.method)}</span></td>
          <td class="mono strong">${esc(route.path)}</td>
          <td class="muted">${esc(route.description)}</td>
        </tr>
      `).join('') || '';

    const servicesCards = data.cloudServices?.map(svc => {
      // Built by us from the hand-curated mapping, escaped inside (ADR-089).
      const serviceReferenceSection = serviceReference(String(svc.serviceName ?? ''));
      return `
        <div class="card">
          <h4>${esc(checked(svc.serviceName))}</h4>
          <p class="muted">${esc(checked(svc.purpose))}</p>
          <div class="meta">
            <strong>Packages:</strong> ${svc.npmPackages?.map(pkg => `<code>${esc(checked(pkg))}</code>`).join(', ') || 'None'}
          </div>
          <div class="meta"><strong>SAP reference pattern:</strong> ${serviceReferenceSection}</div>
        </div>
      `;
    }).join('') || '';

    const securityRows = data.securityHardening?.map(item => `
        <tr>
          <td class="strong">${esc(item.category)}</td>
          <td class="muted">${esc(item.requirement)}</td>
          <td class="mono strong">${esc(item.packageOrConfig)}</td>
        </tr>
      `).join('') || '';

    const roadmapPhases = data.roadmap?.map(phase => `
        <div class="card">
          <h4>${esc(phase.phase)}: ${esc(phase.title)}</h4>
          <ul class="muted">
            ${phase.deliverables?.map(del => `<li>${esc(del)}</li>`).join('') || ''}
          </ul>
        </div>
      `).join('') || '';

    const apiMappingRows = data.sapStandardApiMapping?.map(map => `
        <tr>
          <td class="mono strong">${esc(map.legacyTableOrFunction)}</td>
          <td class="strong">${esc(checked(map.sapStandardApiName))}</td>
          <td class="mono">${esc(checked(map.apiId))}</td>
          <td class="muted">${esc([checked(map.description), catalogNoteForMapping(map.legacyTableOrFunction, map.sapStandardApiName, map.apiId)].filter(Boolean).join(' '))}</td>
          <td>${sapApiHubLink(map.apiHubUrl, 'api.sap.com →')}</td>
        </tr>
      `).join('') || '';

    // The options compared before the standard is ruled out (roadmap 3.0.12,
    // F14) — the same reading as the page, a circular reason refused here too.
    const comparison = readOptionComparison(data);
    const optionSection = comparison.state === 'ready' ? `
        <h2>Standard, RAP and CAP compared</h2>
        <p>Model proposal on the engine's facts. Running cost is qualitative: amounts come only from approved cost assumptions in Economics.</p>
        <table>
          <thead>
            <tr>
              <th style="width: 16%;">Option</th>
              ${COMPARISON_ASPECTS.map((a) => `<th>${esc(COMPARISON_ASPECT_LABELS[a])}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${comparison.options.map((o) => `
            <tr>
              <td class="strong">${esc(COMPARED_OPTION_LABELS[o.option])}${comparison.recommended === o.option ? ' (proposed)' : ''}</td>
              ${COMPARISON_ASPECTS.map((a) => `<td class="muted">${esc(checked(o[a]))}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
        ${comparison.missing.length ? `<p>Not compared by the model: ${esc(comparison.missing.map((m) => COMPARED_OPTION_LABELS[m]).join(', '))}.</p>` : ''}
        ${comparison.reason
          ? `<p><strong>Why ${esc(COMPARED_OPTION_LABELS[comparison.recommended])}:</strong> ${esc(checked(comparison.reason.text))}</p><p><strong>The requirement the other options miss:</strong> ${esc(checked(comparison.reason.requirement))}</p>`
          : `<p><strong>The model's reason for ${esc(COMPARED_OPTION_LABELS[comparison.recommended])} is not shown:</strong> ${esc(comparison.refused ?? '')}</p>`}
      ` : comparison.state === 'absent'
        ? '<h2>Standard, RAP and CAP compared</h2><p>Not written in this design — it was written before the design compared the SAP standard, RAP and CAP.</p>'
        : `<h2>Standard, RAP and CAP compared</h2><p>The model's comparison could not be read: ${esc(comparison.why)}</p>`;

    const apiMappingSection = data.sapStandardApiMapping && data.sapStandardApiMapping.length > 0 ? `
        <h2>SAP Business Accelerator Hub Mappings</h2>
        <p>Model proposal: the released SAP APIs the model names in place of direct database access. Every identifier is checked against SAP data this product holds; a verified ID is SAP's, not a proof that it covers this use, and “name found in catalog” means the name is in a list and nothing more.</p>
        <table>
          <thead>
            <tr>
              <th style="width: 20%;">Legacy Object</th>
              <th style="width: 25%;">Target Released API</th>
              <th style="width: 15%;">Hub API ID</th>
              <th>Description</th>
              <th style="width: 15%;">Reference</th>
            </tr>
          </thead>
          <tbody>
            ${apiMappingRows}
          </tbody>
        </table>
      ` : '';

    // Marked before the template, so the attribution section below knows every mark it needs.
    const approachText = checked(data.architectureOverview?.approachDescription);
    const dataSyncText = checked(data.dataSync?.description);
    const attributionSection = sapAttributionHtml(sapRefs.attributions(), esc);

    htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Solution Design: ${esc(data.projectName || currentProject.name)}</title>
          <style>${baseCSS}</style>
        </head>
        <body>
          <div class="header">
            <h1>Solution Design Document: ${esc(data.projectName || currentProject.name)}</h1>
            <div class="meta">Target Framework: <strong>${esc(data.architectureOverview?.nodeFramework)}</strong> | Platform: <strong>${esc(data.architectureOverview?.runtimePlatform ? sapNamesForDisplay(data.architectureOverview.runtimePlatform) : undefined)}</strong> | Generated by Clean-Core.io | ${esc(formatIsoDate(new Date()) ?? '')}</div>
          </div>
          <div class="content">
            <div class="summary-box">
              <h3>Architectural Approach</h3>
              <p>${esc(approachText)}</p>
            </div>

            ${optionSection}

            ${referenceSection}

            <h2>${onStack ? 'ABAP Cloud (RAP) Artifact Blueprint' : 'Side-by-Side Node.js Project Blueprint'}</h2>
            <p>Recommended folder and file organization for the transformed extension:</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%;">Path</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                ${structureRows}
              </tbody>
            </table>

            <h2>Designed API Catalog</h2>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Endpoint Path</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${endpointsRows}
              </tbody>
            </table>

            <h2>${onStack ? 'Released Services &amp; Extension Points' : 'Cloud Services & NPM Dependencies'}</h2>
            <div class="card-grid">
              ${servicesCards}
            </div>

            <h2>Data Synchronization Pattern</h2>
            <p><strong>Pattern:</strong> <strong>${esc(data.dataSync?.patternName)}</strong></p>
            <p>${esc(dataSyncText)}</p>
            ${post?.mvccRefused.length ? `<p class="muted">${esc(MVCC_REFUSAL)}</p>` : ''}
            ${post?.twoCutoffs ? `<p class="muted">${esc(CERTIFIED_SNAPSHOT_NOTE)}</p>` : ''}

            ${apiMappingSection}

            <h2>Security Hardening Blueprint</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Requirement</th>
                  <th>Package / Configuration</th>
                </tr>
              </thead>
              <tbody>
                ${securityRows}
              </tbody>
            </table>

            <h2>Modernization Roadmap</h2>
            <div class="card-grid">
              ${roadmapPhases}
            </div>

            ${attributionSection}
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
          <title>Solution Design: ${esc(currentProject.name)}</title>
          <style>${baseCSS}</style>
        </head>
        <body>
          <div class="header">
            <h1>Solution Design Document: ${esc(currentProject.name)}</h1>
            <div class="meta">Generated by Clean-Core.io | ${esc(formatIsoDate(new Date()) ?? '')}</div>
          </div>
          <div class="content">
            ${renderMarkdownSafe(currentProject.solutionDesign)}
            ${referenceSection}
          </div>
        </body>
        </html>
      `;
  }

  return htmlContent;
}

/** The file name the page saves the document under. */
export function designExportFileName(projectName: string): string {
  return `${projectName.replace(/\s+/g, '_')}_Solution_Design.html`;
}
