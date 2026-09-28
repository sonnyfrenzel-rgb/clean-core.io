import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkDesignResponse } from '../lib/design-response';

/**
 * A model answer is stored as the solution design only if it has the shape the
 * prompt asked for (QA full review of fc787674705f, 6a5a3b3546de). Before, the
 * design page checked `if (!responseText)` and nothing else, so `{}` became a
 * design with `status: 'designed'`.
 */
const VALID = {
  projectName: 'Z order audit',
  architectureOverview: {
    approachDescription: 'Side-by-side CAP service over released APIs.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model)',
    runtimePlatform: 'SAP BTP (Business Technology Platform)',
  },
  nodeAppBlueprint: {
    projectStructure: [{ path: 'db/schema.cds', purpose: 'CDS schema' }, 'srv/service.cds'],
    apiEndpoints: [{ path: '/orders', method: 'GET', description: 'List orders' }],
  },
  cloudServices: [{ serviceName: 'XSUAA', purpose: 'Auth', npmPackages: ['@sap/xssec'] }],
  dataSync: { patternName: 'Event Mesh', description: 'Events.' },
  securityHardening: [{ category: 'Auth', requirement: 'JWT', packageOrConfig: '@sap/xssec' }],
  roadmap: [{ phase: 'Phase 0', title: 'Foundation', deliverables: ['Repo'] }],
};

test.describe('a design is stored only when it is one', () => {
  test('a complete design passes, also wrapped in a fence with a trailing comma', () => {
    expect(checkDesignResponse(JSON.stringify(VALID))).toEqual({ ok: true });
    const fenced = '```json\n' + JSON.stringify(VALID).replace(/\}$/, ',}') + '\n```';
    expect(checkDesignResponse(fenced)).toEqual({ ok: true });
  });

  const refused: Array<[string, string]> = [
    ['an empty object', '{}'],
    ['malformed JSON', '{"architectureOverview": {'],
    ['prose', 'Here is your design: it is great.'],
    ['an overview that is text', JSON.stringify({ ...VALID, architectureOverview: 'CAP' })],
    ['an empty approach', JSON.stringify({ ...VALID, architectureOverview: { ...VALID.architectureOverview, approachDescription: '  ' } })],
    ['a blueprint that is missing', JSON.stringify({ ...VALID, nodeAppBlueprint: undefined })],
    ['endpoints that are text', JSON.stringify({ ...VALID, nodeAppBlueprint: { ...VALID.nodeAppBlueprint, apiEndpoints: 'GET /x' } })],
    ['services of strings', JSON.stringify({ ...VALID, cloudServices: ['XSUAA'] })],
    ['a roadmap with no phase', JSON.stringify({ ...VALID, roadmap: [] })],
    ['a roadmap that is text', JSON.stringify({ ...VALID, roadmap: 'later' })],
  ];
  for (const [name, text] of refused) {
    test(`${name} is refused`, () => {
      const verdict = checkDesignResponse(text);
      expect(verdict.ok, name).toBe(false);
    });
  }

  test('the design page checks the shape before it writes the design', () => {
    const src = readFileSync(join(process.cwd(), 'app/(app)/project/[projectId]/design/page.tsx'), 'utf8');
    const check = src.indexOf('checkDesignResponse(responseText)');
    const write = src.indexOf('solutionDesign: responseText');
    expect(check, 'the page no longer checks the model answer').toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(check, 'the design is written before it is checked').toBeLessThan(write);
    expect(src.slice(check, write)).toMatch(/if \(!shape\.ok\)\s*\{\s*throw /);
  });
});
