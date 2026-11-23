import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { WORKSPACE_PLACES, workspaceRedirectHref, workspaceRedirectPlace } from '../lib/workspace-redirect';
import { IT_SECTION_IDS } from '../lib/it-sections';
import { MANAGEMENT_IDS } from '../lib/management-sections';
import { LAYER_ADDRESSES } from '../lib/workspace-model';
import { WORKSPACE_RETURN, workspaceBackHref, familyBackLink } from '../lib/workspace-back-href';
import { ORIGINS, choiceHref, originBackHref, type OriginKey } from '../lib/choice-addresses';
import { ANALYZE_IT_DETAIL_PLACES, ANALYZE_IT_IDS } from '../lib/analyze-it';
import { BUSINESS_MAP_ID } from '../lib/business-layers';

/**
 * The workspace page dissolves (3.5.0, AB-11; ROADMAP 3.5.0 item (3)): `/project/<id>` redirects to Analyze in every
 * view, and every address it ever wrote lands on the place that holds its content (`lib/workspace-redirect.ts`).
 * Server-free: the rule, the table against every place the workspace and its tools wrote, and the page that applies it.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const go = (search: string, hash = '') => workspaceRedirectHref({ projectId: 'p1', search, hash });

test.describe('/project/<id> goes to Analyze', () => {
  test('in every view, keeping the view; Business is the default and is not written', () => {
    expect(go('')).toBe('/project/p1/analyze');
    expect(go('?view=business')).toBe('/project/p1/analyze?view=business');
    expect(go('?view=it')).toBe('/project/p1/analyze?view=it');
    expect(go('?view=management')).toBe('/project/p1/analyze?view=management');
    // A view is a perspective, never a grant (ADR-018): an unknown one is dropped.
    expect(go('?view=admin')).toBe('/project/p1/analyze');
  });

  test('carries first, from, origin and add; drops focus and anything else', () => {
    expect(go('?first=1')).toBe('/project/p1/analyze?first=1');
    expect(go('?view=it&from=workspace-tools&focus=abc&x=1')).toBe('/project/p1/analyze?view=it&from=workspace-tools');
    expect(go('?view=management&origin=management.options', '#decision-options')).toBe(
      '/project/p1/analyze?view=management&origin=management.options#decision-options',
    );
    expect(go('?view=it&add=usage')).toBe('/project/p1/analyze?view=it&add=usage');
    expect(go('?view=it&add=evil')).toBe('/project/p1/analyze?view=it');
  });

  test('a line stays a line; Management shows no code, so a line asked there opens in Business', () => {
    expect(go('', '#L42')).toBe('/project/p1/analyze#L42');
    expect(go('?view=it', '#L40-48')).toBe('/project/p1/analyze?view=it#L40-48');
    expect(go('?view=management', '#L42')).toBe('/project/p1/analyze#L42');
  });

  test('a place nothing names is dropped, and the address never leaves the project', () => {
    expect(go('?view=it', '#nowhere')).toBe('/project/p1/analyze?view=it');
    expect(go('', '#%E0%A4%A')).toBe('/project/p1/analyze');
    expect(workspaceRedirectHref({ projectId: 'a/b', search: '', hash: '' })).toBe('/project/a%2Fb/analyze');
  });
});

/**
 * The mapping table, as the report of the AB-11 branch states it. Every row is one address the workspace page, its
 * views or a tool wrote; the right side is where it lands now.
 */
const TABLE: ReadonlyArray<readonly [string, string, string]> = [
  // search, hash, target
  ['', '#need', '/project/p1/analyze#process-map'],
  ['?view=it', '#need', '/project/p1/analyze#process-map'],
  ['', `#${BUSINESS_MAP_ID}`, '/project/p1/analyze#process-map'],
  ['?view=management', '#standard', '/project/p1/analyze?view=it#standard'],
  ['?view=it', '#costs', '/project/p1/tco?view=it'],
  ['?view=management', '#costs', '/project/p1/tco?view=management'],
  ['', '#costs', '/project/p1/tco'],
  ['?view=it', '#architecture', `/project/p1/analyze?view=it#${ANALYZE_IT_IDS.touch}`],
  ['?view=business', '#evidence', '/project/p1/analyze?view=it#it-trust'],
  ['?view=it', '#changes', '/project/p1/analyze?view=management#decision-card'],
  ['?view=it', `#${IT_SECTION_IDS.findings}`, `/project/p1/analyze?view=it#${ANALYZE_IT_IDS.kinds}`],
  ['?view=it', `#${IT_SECTION_IDS.objects}`, `/project/p1/analyze?view=it#${ANALYZE_IT_IDS.touch}`],
  ['?view=it', `#${IT_SECTION_IDS.questions}`, '/project/p1/analyze?view=it#not-determined'],
  ['', '#not-determined', '/project/p1/analyze?view=it#not-determined'],
  ['?view=management', '#not-determined', '/project/p1/analyze?view=management#not-determined'],
  ['?view=it', `#${IT_SECTION_IDS.profile}`, '/project/p1/analyze?view=it#it-target-profile'],
  ['?view=it', `#${IT_SECTION_IDS.route}`, '/project/p1/analyze?view=it#it-route'],
  ['?view=it', `#${IT_SECTION_IDS.trust}`, '/project/p1/analyze?view=it#it-trust'],
  ['?view=it', `#${IT_SECTION_IDS.standard}`, '/project/p1/analyze?view=it#standard'],
  ['?view=it', '#business-rules', '/project/p1/analyze?view=it#business-rules'],
  ['?view=it', '#it-elsewhere', '/project/p1/analyze?view=it'],
  ['?view=management', `#${MANAGEMENT_IDS.decision}`, '/project/p1/analyze?view=management#decision-card'],
  ['', `#${MANAGEMENT_IDS.decision}`, '/project/p1/analyze?view=management#decision-card'],
  ['?view=management', `#${MANAGEMENT_IDS.costs}`, '/project/p1/analyze?view=management#decision-rests-on-cost'],
  ['?view=management', `#${MANAGEMENT_IDS.readiness}`, '/project/p1/analyze?view=management#management-readiness'],
  ['?view=management', `#${MANAGEMENT_IDS.elsewhere}`, '/project/p1/analyze?view=management'],
  ['?view=it', `#${WORKSPACE_RETURN.tools}`, '/project/p1/analyze?view=it'],
  ['?view=management', `#${WORKSPACE_RETURN.status}`, '/project/p1/analyze?view=management'],
  ['', `#${WORKSPACE_RETURN.headTools}`, '/project/p1/analyze'],
  ['?view=it', `#${WORKSPACE_RETURN.nextStep}`, '/project/p1/analyze?view=it'],
  ['?view=management', '#workspace-access', '/project/p1/analyze?view=management'],
];

test.describe('the mapping table', () => {
  for (const [search, hash, target] of TABLE) {
    test(`${search || '(no view)'}${hash} → ${target}`, () => {
      expect(go(search, hash)).toBe(target);
    });
  }

  test('every layer address, every IT and Management section, every return point has a row', () => {
    const named = new Set(Object.keys(WORKSPACE_PLACES));
    for (const layer of LAYER_ADDRESSES) expect(named, `layer #${layer}`).toContain(layer);
    for (const id of Object.values(IT_SECTION_IDS)) expect(named, `IT #${id}`).toContain(id);
    for (const id of Object.values(MANAGEMENT_IDS)) expect(named, `Management #${id}`).toContain(id);
    for (const id of Object.values(WORKSPACE_RETURN)) expect(named, `return point #${id}`).toContain(id);
    // Every place a choice's way back named in a view of the workspace.
    for (const [key, origin] of Object.entries(ORIGINS)) {
      if (origin.surface.kind === 'tool') continue;
      expect(named, `origin ${key} #${origin.anchor}`).toContain(origin.anchor);
    }
  });

  test('every IT place it sends to stands on the IT page, or opens Technical detail', () => {
    const it = read('components/analyze/AnalyzeIt.tsx') + read('components/analyze/ItTouches.tsx') + read('components/analyze/EvidenceFindingsTable.tsx');
    const rail = read('components/workspace/ItRail.tsx') + read('components/workspace/ItRuleRegister.tsx');
    for (const home of Object.values(WORKSPACE_PLACES)) {
      if (home.kind !== 'analyze' || home.view !== 'it' || !home.hash) continue;
      const inDetail = ANALYZE_IT_DETAIL_PLACES.includes(home.hash);
      const onPage = Object.values(ANALYZE_IT_IDS).includes(home.hash as never);
      expect(inDetail || onPage, `#${home.hash} has no home on the IT page`).toBe(true);
      if (inDetail && home.hash !== ANALYZE_IT_IDS.detail) {
        // Its element is drawn by a part of Technical detail.
        expect(`${it}${rail}`, `#${home.hash}`).toMatch(new RegExp(`(id=["{]?|IT_SECTION_IDS\\.\\w+|IT_TARGET_PROFILE_ID|BUSINESS_RULES_ID)`));
      }
    }
  });
});

test.describe('the ways in land there without a hop', () => {
  test("a tool's way back goes to Analyze in the view it was opened from, and names it", () => {
    expect(workspaceBackHref({ projectId: 'p1', search: '?view=it' })).toBe('/project/p1/analyze?view=it');
    expect(workspaceBackHref({ projectId: 'p1', search: '?view=management&from=workspace-tools' })).toBe('/project/p1/analyze?view=management');
    const back = familyBackLink({ projectId: 'p1', search: '?view=it&from=workspace-tools' });
    expect(back).toEqual({ kind: 'link', href: '/project/p1/analyze?view=it', place: 'Analyze, IT view', to: 'analyze' });
    expect(familyBackLink({ projectId: 'p1', search: '' })).toMatchObject({ to: 'my-workspace', href: '/dashboard' });
    expect(workspaceRedirectPlace('/project/p1/analyze?view=management#decision-card')).toBe('Analyze, Management view');
  });

  test("a choice's link and its way back address Analyze, never /project/<id> alone", () => {
    for (const key of Object.keys(ORIGINS) as OriginKey[]) {
      const back = originBackHref({ base: '/project/p1', origin: key, search: '?view=it' });
      expect(back, key).not.toMatch(/^\/project\/p1(\?|#|$)/);
    }
    expect(choiceHref({ base: '/project/p1', choice: 'management.confirm', origin: 'it.open-questions', view: 'it' })).toBe(
      '/project/p1/analyze?view=management&origin=it.open-questions#decision-card',
    );
    expect(choiceHref({ base: '/project/p1', choice: 'it.target', view: 'management' })).toBe('/project/p1/analyze?view=it#it-target-profile');
    // The demo keeps its own workspace.
    expect(choiceHref({ base: '/demo', choice: 'management.confirm', view: 'it' })).toBe('/demo/workspace?view=management#decision-card');
  });

  test('the page is the redirect and nothing else: no shell, no read, no write', () => {
    // Comments out: the page explains where the reader's access is decided, and names the loader in doing so.
    const page = read('app/(app)/project/[projectId]/page.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(page).toContain('workspaceRedirectHref');
    expect(page).toContain('router.replace');
    for (const gone of ['WorkspaceShell', 'loadProjectAndHydrate', 'getDb', 'updateDoc', 'layerRedirect']) {
      expect(page, gone).not.toContain(gone);
    }
    // The shell, its coach marks and their hook are gone with it.
    for (const rel of ['components/workspace/WorkspaceShell.tsx', 'components/workspace/CoachMarks.tsx', 'lib/coach-marks.ts', 'hooks/useCoachMarks.ts']) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(false);
    }
  });
});
