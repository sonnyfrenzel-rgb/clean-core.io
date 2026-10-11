import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CHAIN_LINKS,
  CHOICES,
  choiceAddress,
  choiceHref,
  economicsChoice,
  isChoiceKey,
  ORIGINS,
  originBackHref,
  originBackLabel,
  originOf,
  phaseChoice,
  STATIC_CHOICE_KEYS,
  STATIC_ORIGIN_KEYS,
  testingChoice,
  type ChoiceKey,
  type OriginKey,
} from '../lib/choice-addresses';
import { HANDOVER_LINKS } from '../lib/handover';
import { OPEN_QUESTION_ACTIONS } from '../lib/open-questions';
import { PAGE_ANCHOR_IDS } from '../lib/page-anchors';
import { IT_SECTION_IDS } from '../lib/it-sections';
import { MANAGEMENT_IDS } from '../lib/management-sections';
import { BUSINESS_MAP_ID } from '../lib/business-layers';
import { stageBackLink, stageHref, WORKSPACE_RETURN } from '../lib/workspace-back-href';
import { NAVIGATION_MESSAGES } from '../lib/messages/navigation';

/**
 * Every choice has one address, and a way back (owner 11.10.2026, roadmap
 * after 3.0.8, package A). `lib/choice-addresses.ts` gives each choice the
 * surface it lives on and the anchor of its control, and a link to it carries
 * the place that asked as `?origin=<key>` — a key of a closed list, nothing
 * else. Modelled on `tests/return-path-guard.spec.ts`: the way back must not
 * be pointable anywhere the module does not name.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BASE = '/project/p-1';

test.describe('every choice has one address', () => {
  // The inventory of the plan, C1–C21: key → the address it must produce from the IT view.
  const EXPECTED: Record<string, string> = {
    'design.target-signoff': `${BASE}/design?view=it&origin=it.next-step#architect-sign-off`,
    'management.options': `${BASE}?view=management&origin=it.next-step#decision-options`,
    'management.confirm': `${BASE}?view=management&origin=it.next-step#decision-card`,
    'business.rules': `${BASE}?view=business&origin=it.next-step#business-rules`,
    'business.walk': `${BASE}?view=business&origin=it.next-step#process-map`,
    'business.open-questions': `${BASE}?view=business&origin=it.next-step#not-determined`,
    'it.open-questions': `${BASE}?view=it&origin=it.next-step#not-determined`,
    'management.open-questions': `${BASE}?view=management&origin=it.next-step#not-determined`,
    'it.target': `${BASE}?view=it&origin=it.next-step#it-target-profile`,
    'economics.rates': `${BASE}/tco?view=it&origin=it.next-step#economics-step-rates`,
    'economics.cadence': `${BASE}/tco?view=it&origin=it.next-step#economics-cadence`,
    'economics.effort': `${BASE}/tco?view=it&origin=it.next-step#economics-step-effort`,
    'economics.result': `${BASE}/tco?view=it&origin=it.next-step#economics-step-result`,
    'economics.compare': `${BASE}/tco?view=it&origin=it.next-step#economics-compare`,
    'testing.run': `${BASE}/testing?view=it&origin=it.next-step#testing-verified`,
    'testing.write': `${BASE}/testing?view=it&origin=it.next-step#testing-write`,
    'testing.sap-result': `${BASE}/testing?view=it&origin=it.next-step#testing-sap-result`,
    'testing.hand': `${BASE}/testing?view=it&origin=it.next-step#testing-hand`,
    'delivery.audit-pack': `${BASE}/delivery?view=it&origin=it.next-step#audit-pack`,
    'delivery.still-needed': `${BASE}/delivery?view=it&origin=it.next-step#still-needed`,
    'analyze.add-usage': `${BASE}/analyze?view=it&origin=it.next-step&add=usage`,
    'analyze.add-atc': `${BASE}/analyze?view=it&origin=it.next-step&add=atc`,
    'requirements.nfr-questions': `${BASE}/design/requirements?view=it&origin=it.next-step#spec-s4`,
    'economics.option.do-nothing': `${BASE}/tco?view=it&origin=it.next-step#cost-option-do-nothing`,
    'economics.deferral.do-nothing': `${BASE}/tco?view=it&origin=it.next-step#cost-option-do-nothing`,
    'requirements.decision.D-3': `${BASE}/design/requirements?view=it&origin=it.next-step#decision-D-3`,
    'requirements.req.FR-01': `${BASE}/design/requirements?view=it&origin=it.next-step#req-FR-01`,
    'requirements.nfr-questions.security': `${BASE}/design/requirements?view=it&origin=it.next-step#nfr-q-security`,
    'it.open-questions.add-atc': `${BASE}?view=it&origin=it.next-step#oq-add-atc`,
  };

  test('each key of the inventory leads to its control', () => {
    for (const [key, href] of Object.entries(EXPECTED)) {
      expect(choiceHref({ base: BASE, choice: key as ChoiceKey, origin: 'it.next-step', view: 'it' }), key).toBe(href);
    }
    // Every fixed key is in the inventory above — a new one is a decision, not a silent addition.
    for (const key of STATIC_CHOICE_KEYS) expect(Object.keys(EXPECTED), key).toContain(key);
    expect(Object.keys(CHOICES).sort()).toEqual([...STATIC_CHOICE_KEYS].sort());
  });

  test('the anchors are the ids the pages already render, where they exist', () => {
    expect(CHOICES['delivery.audit-pack'].anchor).toBe(PAGE_ANCHOR_IDS.delivery.pack);
    expect(CHOICES['delivery.still-needed'].anchor).toBe(PAGE_ANCHOR_IDS.delivery.needed);
    expect(CHOICES['testing.run'].anchor).toBe(PAGE_ANCHOR_IDS.testing.run);
    expect(CHOICES['testing.write'].anchor).toBe(PAGE_ANCHOR_IDS.testing.write);
    expect(CHOICES['testing.sap-result'].anchor).toBe(PAGE_ANCHOR_IDS.testing.sapResult);
    expect(CHOICES['testing.hand'].anchor).toBe(PAGE_ANCHOR_IDS.testing.hand);
    expect(CHOICES['it.target'].anchor).toBe(IT_SECTION_IDS.profile);
    expect(CHOICES['it.open-questions'].anchor).toBe(IT_SECTION_IDS.questions);
    expect(CHOICES['management.confirm'].anchor).toBe(MANAGEMENT_IDS.decision);
    expect(CHOICES['business.walk'].anchor).toBe(BUSINESS_MAP_ID);
    expect(ORIGINS['management.rests-on.cost'].anchor).toBe(MANAGEMENT_IDS.costs);
    expect(ORIGINS['management.elsewhere'].anchor).toBe(MANAGEMENT_IDS.elsewhere);
    expect(ORIGINS['workspace.tools'].anchor).toBe(WORKSPACE_RETURN.tools);
    expect(ORIGINS['workspace.status'].anchor).toBe(WORKSPACE_RETURN.status);
    expect(ORIGINS['it.next-step'].anchor).toBe(WORKSPACE_RETURN.nextStep);
    // Ids that render today, read from the source that renders them.
    expect(read('components/design/DesignCanvasStage.tsx')).toContain('id="architect-sign-off"');
    expect(read('components/workspace/DecisionOptions.tsx')).toContain('id="decision-options"');
    expect(read('components/workspace/BusinessRulesEditor.tsx')).toContain("BUSINESS_RULES_ID = 'business-rules'");
    const tco = read('app/(app)/project/[projectId]/tco/page.tsx');
    for (const id of ['economics-step-rates', 'economics-step-effort', 'economics-step-result', 'economics-compare']) {
      expect(tco, id).toContain(id);
    }
    expect(read('components/requirements/SpecDocument.tsx')).toContain('id={`req-${r.id}`}');
    expect(read('components/requirements/SpecDocument.tsx')).toContain('id={`decision-${d.id}`}');
  });

  test('a tool keeps the reader\'s view; a view surface takes its own; without a view nothing is invented', () => {
    for (const view of ['business', 'it', 'management'] as const) {
      expect(choiceHref({ base: BASE, choice: 'economics.rates', view })).toBe(`${BASE}/tco?view=${view}#economics-step-rates`);
      // The decision lives in Management, whichever view asked.
      expect(choiceHref({ base: BASE, choice: 'management.confirm', view })).toBe(`${BASE}?view=management#decision-card`);
    }
    expect(choiceHref({ base: BASE, choice: 'economics.rates' })).toBe(`${BASE}/tco#economics-step-rates`);
    expect(choiceHref({ base: BASE, choice: 'economics.rates', view: 'admin' })).toBe(`${BASE}/tco#economics-step-rates`);
    expect(choiceHref({ base: BASE, choice: 'economics.rates', origin: 'delivery.next' })).toBe(
      `${BASE}/tco?origin=delivery.next#economics-step-rates`,
    );
  });

  test('the demo: tools under /demo, the views under /demo/workspace', () => {
    expect(choiceHref({ base: '/demo', choice: 'design.target-signoff', view: 'management', origin: 'management.rests-on.contract' })).toBe(
      '/demo/design?view=management&origin=management.rests-on.contract#architect-sign-off',
    );
    expect(choiceHref({ base: '/demo', choice: 'management.options', origin: 'delivery.still-needed' })).toBe(
      '/demo/workspace?view=management&origin=delivery.still-needed#decision-options',
    );
  });

  test('?add= is a query, and the origin stands before it', () => {
    expect(choiceHref({ base: BASE, choice: 'analyze.add-usage', view: 'business', origin: 'business.open-questions' })).toBe(
      `${BASE}/analyze?view=business&origin=business.open-questions&add=usage`,
    );
    expect(choiceHref({ base: BASE, choice: 'analyze.add-atc' })).toBe(`${BASE}/analyze?add=atc`);
  });

  test('an id is encoded nowhere because it can only be an id', () => {
    // A parameterised key whose id could not stand in a fragment is not a key.
    for (const bad of [
      'economics.option.',
      'economics.option.a b',
      'economics.option.%2F',
      'economics.option.a/b',
      'economics.option.1abc',
      'economics.option.<script>',
      'economics.option.' + 'x'.repeat(80),
      'requirements.req.a#b',
      'it.open-questions.not-an-action',
      'it.open-questions.',
      'sales.open-questions.add-atc',
      'design.target-signoff ',
      'DESIGN.TARGET-SIGNOFF',
      '__proto__',
      'constructor',
      'toString',
    ]) {
      expect(choiceAddress(bad), bad).toBeNull();
      expect(isChoiceKey(bad), bad).toBe(false);
    }
    // …and its link degrades to the surface, never to a fragment of the bad id.
    expect(choiceHref({ base: BASE, choice: 'economics.option.a b' as ChoiceKey, view: 'it' })).toBe(`${BASE}?view=it`);
    // Every open-question action has its group.
    for (const action of OPEN_QUESTION_ACTIONS) {
      expect(choiceAddress(`business.open-questions.${action}`)?.anchor, action).toBe(`oq-${action}`);
    }
  });

  test('every choice has its words, from the navigation catalogue', () => {
    const words = new Set<string>(Object.values(NAVIGATION_MESSAGES));
    for (const key of Object.keys(EXPECTED)) {
      const address = choiceAddress(key)!;
      expect(words.has(address.label), `${key}: "${address.label}"`).toBe(true);
      expect(address.place.length, key).toBeGreaterThan(0);
    }
    expect(CHOICES['design.target-signoff'].place).toBe('Design');
    expect(CHOICES['economics.rates'].place).toBe('Economics');
    expect(CHOICES['management.options'].place).toBe('Management view');
  });
});

test.describe('the origin is a key of a closed list, or nothing', () => {
  const REJECTED: [string, string][] = [
    ['?origin=https://evil.example', 'an absolute URL'],
    ['?origin=https:', 'a scheme'],
    ['?origin=javascript:alert(1)', 'a script URL'],
    ['?origin=//evil.example', 'protocol-relative'],
    ['?origin=/project/p-2/delivery', 'a path'],
    ['?origin=%2F%2Fevil.example', 'percent-encoded slashes'],
    ['?origin=delivery.still-needed%2F', 'a key with a percent-encoded slash'],
    ['?origin=delivery.still-needed%00', 'a null byte'],
    ['?origin=delivery.still-needed#x', 'a key cut by a fragment — the fragment is not the origin'],
    ['?origin=delivery.chain.payroll', 'a chain link that does not exist'],
    ['?origin=management.rests-on.', 'a pillar left out'],
    ['?origin=Delivery.Still-Needed', 'another case'],
    ['?origin=%20delivery.still-needed', 'a leading space'],
    ['?origin=__proto__', 'a property of every object'],
    ['?origin=constructor', 'another one'],
    ['?origin=' + 'a'.repeat(200), 'an absurd length'],
    ['?origin=', 'the empty string'],
    ['?origin=delivery.still-needed&origin=delivery.next', 'the parameter twice'],
    ['?origin=delivery.still-needed&origin=delivery.still-needed', 'the same key twice'],
    ['', 'nothing at all'],
  ];
  for (const [search, why] of REJECTED) {
    test(`discards ${why}`, () => {
      expect(originOf(search), search).toBeNull();
    });
  }

  test('a known key is read as written', () => {
    for (const key of Object.keys(ORIGINS)) expect(originOf(`?origin=${key}`), key).toBe(key);
    expect(originOf(new URLSearchParams({ view: 'it', origin: 'it.next-step' }))).toBe('it.next-step');
    expect(originOf(null)).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });

  test('the list is the one the plan names, with every link of the evidence chain', () => {
    expect([...CHAIN_LINKS]).toEqual([...HANDOVER_LINKS]);
    const keys = Object.keys(ORIGINS).sort();
    expect(keys).toEqual([...STATIC_ORIGIN_KEYS, ...CHAIN_LINKS.map((k) => `delivery.chain.${k}`)].sort());
    for (const [key, address] of Object.entries(ORIGINS)) {
      expect(address.anchor, key).toMatch(/^[A-Za-z][\w-]{0,63}$/);
      expect(address.label.length, key).toBeGreaterThan(0);
    }
  });

  test('a link never carries an origin that is not on the list', () => {
    for (const bad of ['//evil', 'https://evil.example', 'delivery.chain.payroll', '']) {
      const href = choiceHref({ base: BASE, choice: 'economics.rates', view: 'it', origin: bad as OriginKey });
      expect(href, bad).toBe(`${BASE}/tco?view=it#economics-step-rates`);
      expect(stageHref({ base: BASE, path: 'tco', view: 'it', origin: bad as OriginKey }), bad).toBe(`${BASE}/tco?view=it`);
    }
  });
});

test.describe('the way back goes one level, to the place that asked', () => {
  test('to a view, to a tool, to the workspace in the reader\'s view', () => {
    expect(originBackHref({ base: BASE, origin: 'management.options' })).toBe(`${BASE}?view=management#decision-options`);
    expect(originBackHref({ base: BASE, origin: 'management.rests-on.contract', search: '?view=management&origin=management.rests-on.contract' })).toBe(
      `${BASE}?view=management#decision-rests-on-contract`,
    );
    expect(originBackHref({ base: BASE, origin: 'delivery.still-needed', search: '?view=it&origin=delivery.still-needed' })).toBe(
      `${BASE}/delivery?view=it#still-needed`,
    );
    expect(originBackHref({ base: BASE, origin: 'delivery.chain.tests', search: '' })).toBe(`${BASE}/delivery#evidence-chain-tests`);
    expect(originBackHref({ base: BASE, origin: 'workspace.tools', search: '?view=business&origin=workspace.tools' })).toBe(
      `${BASE}?view=business#workspace-tools`,
    );
    expect(originBackHref({ base: BASE, origin: 'workspace.status', search: '' })).toBe(`${BASE}#workspace-status`);
    expect(originBackHref({ base: '/demo', origin: 'management.options' })).toBe('/demo/workspace?view=management#decision-options');
    expect(originBackHref({ base: '/demo', origin: 'delivery.next', search: '?view=it' })).toBe('/demo/delivery?view=it#delivery-next');
    expect(originBackHref({ base: BASE, origin: 'evil' as OriginKey })).toBeNull();
  });

  test('no way back carries an origin of its own', () => {
    for (const key of Object.keys(ORIGINS) as OriginKey[]) {
      const href = originBackHref({ base: BASE, origin: key, search: `?view=it&origin=${key}&from=workspace-tools` })!;
      expect(href, key).not.toContain('origin=');
      expect(originOf(href.slice(href.indexOf('?')).split('#')[0]), key).toBeNull();
    }
  });

  test('the words: "Back to" and the place', () => {
    expect(originBackLabel('management.options')).toEqual({ lead: 'Back to', place: 'Management view, Options' });
    expect(originBackLabel('delivery.still-needed')).toEqual({ lead: 'Back to', place: 'Delivery, Still needed' });
    expect(originBackLabel('management.rests-on.cost')?.place).toBe('Management view, What it rests on: Costs');
    expect(originBackLabel('workspace.tools', '?view=it')?.place).toBe('IT view, Tools');
    expect(originBackLabel('workspace.tools', '')?.place).toBe('Tools');
    expect(originBackLabel('design.requirements-entry')?.place).toBe('Design, Requirements');
    expect(originBackLabel('evil' as OriginKey)).toBeNull();
    expect(NAVIGATION_MESSAGES['nav.backTo']).toBe('Back to');
  });

  test('a stage reads its origin through stageBackLink, and keeps the workspace link beside it', () => {
    const back = stageBackLink({ projectId: 'p-1', search: '?view=management&origin=management.rests-on.contract' });
    expect(back).toEqual({
      kind: 'link',
      href: '/project/p-1?view=management',
      origin: {
        key: 'management.rests-on.contract',
        href: '/project/p-1?view=management#decision-rests-on-contract',
        label: { lead: 'Back to', place: 'Management view, What it rests on: Architecture contract' },
      },
    });
    // No origin, or one not on the list: exactly what it was.
    expect(stageBackLink({ projectId: 'p-1', search: '?view=it' })).toEqual({ kind: 'link', href: '/project/p-1?view=it' });
    expect('origin' in stageBackLink({ projectId: 'p-1', search: '?view=it&origin=//evil' })).toBe(false);
    expect(stageBackLink({ projectId: 'p 1', search: '?origin=delivery.next' })).toMatchObject({
      origin: { href: '/project/p%201/delivery#delivery-next' },
    });
    // The demo's way back to an origin stays in the demo.
    expect(stageBackLink({ projectId: '', search: '?view=it&origin=management.options', demo: true })).toMatchObject({
      origin: { href: '/demo/workspace?view=management#decision-options' },
    });
  });
});

test.describe('the helpers name the next choice', () => {
  test('per phase', () => {
    expect(phaseChoice('design', 'empty')).toBe('design.target-signoff');
    expect(phaseChoice('design', 'partial')).toBe('design.target-signoff');
    expect(phaseChoice('design', 'done')).toBeNull();
    expect(phaseChoice('testing', 'empty')).toBe('testing.write');
    expect(phaseChoice('testing', 'partial')).toBe('testing.run');
    expect(phaseChoice('testing', 'stale')).toBe('testing.run');
    expect(phaseChoice('tco', 'empty')).toBe('economics.rates');
    expect(phaseChoice('tco', 'partial')).toBe('economics.result');
    expect(phaseChoice('delivery', 'partial')).toBe('delivery.still-needed');
    for (const tool of ['analyze', 'transformation', 'documentation'] as const) expect(phaseChoice(tool, 'empty'), tool).toBeNull();
  });

  test('in Economics, in the order its steps ask', () => {
    const all = { rates: true, cadence: true, options: [{ id: 'rebuild', effort: true }, { id: 'do-nothing', effort: true, deferral: true }], result: true };
    expect(economicsChoice({ ...all, rates: false })).toBe('economics.rates');
    expect(economicsChoice({ ...all, cadence: false })).toBe('economics.cadence');
    expect(economicsChoice({ ...all, options: [{ id: 'rebuild', effort: false }] })).toBe('economics.option.rebuild');
    expect(economicsChoice({ ...all, options: [{ id: 'do-nothing', effort: true, deferral: false }] })).toBe('economics.deferral.do-nothing');
    expect(economicsChoice({ ...all, options: [{ id: 'a b', effort: false }] })).toBe('economics.effort');
    expect(economicsChoice({ ...all, result: false })).toBe('economics.result');
    expect(economicsChoice(all)).toBe('economics.compare');
  });

  test('in Testing', () => {
    expect(testingChoice({ abapCloud: true, hasScenarios: false })).toBe('testing.write');
    expect(testingChoice({ abapCloud: false, hasScenarios: false })).toBe('testing.write');
    expect(testingChoice({ abapCloud: true, hasScenarios: true })).toBe('testing.sap-result');
    expect(testingChoice({ abapCloud: false, hasScenarios: true })).toBe('testing.run');
  });
});

test('the address module is pure, and the origin is never stored or sent', () => {
  const src = read('lib/choice-addresses.ts');
  expect(src, 'imports a component').not.toMatch(/from '@\/components|from 'react'|from 'next\//);
  expect(src).not.toMatch(/window\.|document\.|localStorage|sessionStorage|fetch\(/);
  // Nothing that reads the origin writes it anywhere.
  for (const rel of ['lib/workspace-back-href.ts', 'hooks/useFollowHash.ts', 'components/ChoiceBackLink.tsx', 'components/StageHeader.tsx']) {
    const code = read(rel);
    expect(code, rel).not.toMatch(/localStorage|sessionStorage|fetch\(|setDoc|updateDoc|addDoc/);
  }
});
