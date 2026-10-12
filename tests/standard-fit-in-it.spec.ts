import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BUSINESS_LAYERS, BUSINESS_LAYER_ELSEWHERE } from '../lib/business-layers';
import { IT_ANCHORS, IT_LAYERS, IT_LAYER_ELSEWHERE, IT_SECTION_IDS } from '../lib/it-sections';
import { MANAGEMENT_LAYER_ELSEWHERE } from '../lib/management-sections';
import { layerRedirect } from '../lib/layer-redirect';
import { stageBackPlace, workspaceBackHref } from '../lib/workspace-back-href';
import { viewSwitchHash } from '../lib/view-switch';
import { DECISION_PLACE_IDS } from '../lib/decision-manager';

/**
 * Standard fit leaves the Business view and is one of IT's own sections
 * (owner, 12.10.2026, ADR-096). For a Z program without catalog successors
 * every row read "No catalog hit · E0 none · Not determined · Name a standard
 * process to compare", and its capabilities are rule conditions and rule ids —
 * an IT reading, until roadmap 3.0.13 (F14) brings the real comparison.
 *
 * Server-free: the lists, the redirects and the ways back, and the source
 * places that render them. The rendered half is in
 * `tests/business-view-clarity.spec.ts` and `tests/workspace-layers.spec.ts`.
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const run = { hasActiveRun: true };

test.describe('Standard fit is an IT section, not a Business layer (ADR-096)', () => {
  test('Business has no standard layer; IT lists it, last, at its old address', () => {
    expect(BUSINESS_LAYERS).not.toContain('standard');
    expect([...BUSINESS_LAYERS]).toEqual(['evidence']);
    expect(BUSINESS_LAYER_ELSEWHERE.standard).toBe('it');
    expect(IT_LAYERS).toContain('standard');
    expect(IT_ANCHORS).toContain('standard');
    expect(IT_ANCHORS[IT_ANCHORS.length - 1]).toBe('standard');
    expect(IT_SECTION_IDS.standard).toBe('standard');
    expect(IT_LAYER_ELSEWHERE.standard).toEqual({ kind: 'view', view: 'it', hash: 'standard' });
    expect(MANAGEMENT_LAYER_ELSEWHERE.standard).toEqual({ kind: 'view', view: 'it', hash: 'standard' });
  });

  test('every old address leads to IT #standard, and IT keeps it without a redirect onto itself', () => {
    expect(layerRedirect('business', '#standard', run)).toEqual({ kind: 'view', view: 'it', hash: 'standard' });
    expect(layerRedirect('management', '#standard', run)).toEqual({ kind: 'view', view: 'it', hash: 'standard' });
    expect(layerRedirect('it', '#standard', run)).toBeNull();
    // A view switch does not carry the place of the old view.
    expect(viewSwitchHash('#standard')).toBe('');
    // A stage's way back, from any view it was opened in.
    for (const view of ['business', 'it', 'management']) {
      const search = `?view=${view}&from=workspace-tools&layer=standard`;
      expect(workspaceBackHref({ projectId: 'p-1', search }), view).toBe('/project/p-1?view=it#standard');
      expect(stageBackPlace(search), view).toBe('IT view, Standard fit');
    }
    // Management's open condition "Check standard fit" points at the IT section.
    expect(DECISION_PLACE_IDS.itStandardFit).toBe(IT_SECTION_IDS.standard);
  });

  test('the sources render it where the lists say', () => {
    const answers = read('components/workspace/ItAnswers.tsx');
    // IT's own section, full width under the two columns, after the rail.
    expect(answers).toContain('id={IT_SECTION_IDS.standard}');
    expect(answers).toContain('<ItStandardFit');
    expect(answers.indexOf('id={IT_SECTION_IDS.standard}')).toBeGreaterThan(answers.indexOf('<ItRail'));
    // No "Standard fit → Business" link out any more.
    expect(answers).not.toContain('itv.elsewhereStandard');
    expect(answers).not.toMatch(/elsewhere\.open\('business', 'standard'\)/);
    // The shell and the demo hand IT the layer.
    expect(read('components/workspace/WorkspaceShell.tsx')).toMatch(/standardLayer=\{allLayers\.find\(\(l\) => l\.key === 'standard'\)/);
    expect(read('components/demo/DemoWorkspaceShell.tsx')).toMatch(/standardLayer=\{layers\.find\(\(l\) => l\.key === 'standard'\)/);
    // The table is IT's now; the Business layer section no longer draws it.
    expect(read('components/workspace/ItStandardFit.tsx')).toContain('<StandardFitTable');
    expect(read('components/workspace/LayerSection.tsx')).not.toContain('StandardFitTable');
    // One layer is no bar: the bar is drawn only where there are two or more.
    expect(read('components/workspace/WorkspaceShell.tsx')).toContain('layers.length > 1 ? <WorkspaceLayerBar');
    expect(read('components/demo/DemoWorkspaceShell.tsx')).toContain('viewLayers.length > 1 ?');
  });
});
