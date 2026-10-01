import { test, expect } from '@playwright/test';
import { buildDesignExportHtml } from '../lib/design-export';
import type { Project } from '../lib/types';

/**
 * QA 7250545cb4ae (full review of v2.20.0): an on-stack RAP design was exported
 * under "Side-by-Side Node.js Project Blueprint" and "Cloud Services & NPM
 * Dependencies". The headings follow the route the design was generated for,
 * with the same rule the page's prompt uses: anything not on BTP is on-stack.
 */

const DESIGN = JSON.stringify({
  projectName: 'Fixture',
  architectureOverview: { approachDescription: 'An approach.', nodeFramework: 'F', runtimePlatform: 'P' },
  nodeAppBlueprint: { projectStructure: [{ path: 'a', purpose: 'b' }], apiEndpoints: [] },
  cloudServices: [{ serviceName: 'S', purpose: 'p', npmPackages: [] }],
  dataSync: { patternName: 'X', description: 'Y' },
  securityHardening: [],
  roadmap: [],
});

function exportFor(route: string | undefined): string {
  const project = { id: 'p', name: 'Fixture', solutionDesign: DESIGN, extensibilityRoute: route } as unknown as Project;
  const html = buildDesignExportHtml(project);
  expect(html).not.toBeNull();
  return html!;
}

test('an on-stack RAP design is not exported as a side-by-side Node.js blueprint', () => {
  const html = exportFor('On-Stack Developer Extensibility (ABAP Cloud)');
  expect(html).not.toContain('Node.js Project Blueprint');
  expect(html).not.toContain('NPM Dependencies');
  expect(html).toContain('ABAP Cloud (RAP) Artifact Blueprint');
});

test('a side-by-side BTP design keeps its Node.js headings', () => {
  for (const route of ['Side-by-Side (SAP BTP)', undefined]) {
    const html = exportFor(route);
    expect(html).toContain('Side-by-Side Node.js Project Blueprint');
    expect(html).toContain('Cloud Services & NPM Dependencies');
  }
});
