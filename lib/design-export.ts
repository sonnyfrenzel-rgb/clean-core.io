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
import { formatIsoDate } from '@/lib/format';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { EXPORT_CSS } from '@/lib/export-style';
import { SIDE_BY_SIDE_ROUTE, isSideBySideRoute, sapNamesForDisplay } from '@/lib/sap-naming';

/** The stylesheet every stage export shares (`lib/export-style.ts`). */
const baseCSS = EXPORT_CSS;

/** The design page as one HTML string, or `null` when there is no design. */
export function buildDesignExportHtml(currentProject: Project): string | null {
  if (!currentProject?.solutionDesign) return null;
  const esc = escapeHtml;

  let htmlContent = '';

  // Check if JSON
  let isJson = false;
  let data: DesignData | null = null;
  const trimmedDesignText = currentProject.solutionDesign.trim();
  if (trimmedDesignText.startsWith('{') || (trimmedDesignText.includes('{') && trimmedDesignText.includes('}'))) {
    try {
      data = cleanAndParseJSON(currentProject.solutionDesign) as DesignData;
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

    const servicesCards = data.cloudServices?.map(svc => `
        <div class="card">
          <h4>${esc(svc.serviceName)}</h4>
          <p class="muted">${esc(svc.purpose)}</p>
          <div class="meta">
            <strong>Packages:</strong> ${svc.npmPackages?.map(pkg => `<code>${esc(pkg)}</code>`).join(', ') || 'None'}
          </div>
        </div>
      `).join('') || '';

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
          <td class="strong">${esc(map.sapStandardApiName)}</td>
          <td class="mono">${esc(map.apiId)}</td>
          <td class="muted">${esc(map.description)}</td>
          <td>${sapApiHubLink(map.apiHubUrl, 'api.sap.com →')}</td>
        </tr>
      `).join('') || '';

    const apiMappingSection = data.sapStandardApiMapping && data.sapStandardApiMapping.length > 0 ? `
        <h2>SAP Business Accelerator Hub Mappings</h2>
        <p>Decoupled communication mappings dynamically generated to keep the S/4HANA core clean:</p>
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
              <p>${esc(data.architectureOverview?.approachDescription)}</p>
            </div>

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
            <p>${esc(data.dataSync?.description)}</p>

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
