import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { STAGE_EXAMPLE_FILE } from '../lib/three-views-stage';
import { describeSnippet, exampleTiers, NEXT_EXAMPLES } from '../lib/example-catalog';
import { EXAMPLE_SNIPPETS } from '../lib/example-snippets';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * "Try it with an example" for a first-time reader — owner feedback 01.10.2026:
 * fourteen cards at once, two card styles, filters first, and two snippets
 * sharing one generic sentence. One recommended start, three next examples by
 * learning goal, everything else behind "More examples", one card for all.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('one start, three next, the rest behind More — and nothing lost', () => {
  const tiers = exampleTiers();
  expect(tiers.startHere.file).toBe(STAGE_EXAMPLE_FILE);
  expect(tiers.startHere.name).toBe('Z_MM_PO_APPROVAL');
  expect(tiers.next).toHaveLength(3);
  expect(new Set(tiers.next.map((n) => n.goal)).size).toBe(3);
  const all = [tiers.startHere, ...tiers.next.map((n) => n.example), ...tiers.more].map((e) => e.file);
  expect(new Set(all).size).toBe(all.length);
  expect([...all].sort()).toEqual(STARTER_EXAMPLES.map((e) => e.file).sort());
  for (const n of NEXT_EXAMPLES) expect(STARTER_EXAMPLES.some((e) => e.file === n.file), n.file).toBe(true);
});

test('each snippet is described by its own code, and no two read the same', () => {
  const generic = [
    'Classic reporting logic, output grids, and list formatting.',
    'Open SQL statements, internal tables manipulation, and database operations.',
    'Remote-enabled interfaces, RFC connections, and BAPI mappings.',
    'Object-oriented classes, interfaces, and local methods implementations.',
  ];
  const lines = EXAMPLE_SNIPPETS.map((s) => {
    const d = describeSnippet(s.code);
    expect(d.shows.length + (d.title ? 1 : 0), `${s.name} says nothing about itself`).toBeGreaterThan(0);
    return `${d.title ?? ''} | ${[d.kind, ...d.shows].join(' · ')}`;
  });
  expect(new Set(lines).size, lines.join('\n')).toBe(lines.length);
  const component = read('components/StarterExamples.tsx');
  for (const g of generic) expect(component).not.toContain(g);
  // Every fact is in the code it describes.
  const flight = EXAMPLE_SNIPPETS.find((s) => s.name.startsWith('ZCL_FLIGHT'))!;
  expect(describeSnippet(flight.code).shows).toContain('reads SPFLI');
  const bapi = EXAMPLE_SNIPPETS.find((s) => s.name.startsWith('Z_SALES_ORDER'))!;
  expect(describeSnippet(bapi.code).shows.join(' ')).toContain('BAPI_SALESORDER_CREATEFROMDAT2');
});

test('one gallery on every page that offers examples, one card, one action pattern', () => {
  const component = read('components/StarterExamples.tsx');
  // One card markup: exactly one element carries the card's kind.
  expect(component.match(/data-example-kind=/g)?.length, 'two card markups again').toBe(1);
  expect(component).not.toContain('Start project');
  expect(component).toContain('EXAMPLE_SNIPPETS');
  expect(read('app/(app)/dashboard/page.tsx')).toContain('<StarterExamples');
  expect(read('components/workspace/NewProject.tsx')).toContain('<StarterExamples');
  // The filters live behind "More examples", not in front of the first card.
  const more = component.indexOf('data-examples-more');
  expect(component.indexOf('<CcFilterBar')).toBeGreaterThan(more);
});

test('the help is a quiet text link, not a second question-mark button', () => {
  const component = read('components/StarterExamples.tsx');
  expect(component).not.toMatch(/HelpCircle|CircleHelp/);
  expect(component).toContain('What are these examples for?');
  expect(component).toContain('On data privacy: uploads are processed by the server and stored in your private workspace');
});

test('the welcome mail recommends the Start here example', () => {
  const mail = read('lib/welcome-email.ts');
  expect(mail).toContain('Z_MM_PO_APPROVAL');
  expect(mail).toContain('Start here');
  expect(mail).not.toContain('Z_MATERIAL_STOCK_CALC');
});

/* ------------------------------------------------------------- on the page */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
const PASSWORD = 'Examples123!';
const EMAIL = `examples-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

test.describe('the gallery on My workspace', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Ex', lastName: 'Amples', email: EMAIL, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 0, transformationsLimit: 5,
      createdAt: new Date(),
    });
  });

  test('the help opens from a text link, and on a phone the tags never leave a badge alone', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('starter-examples');
    await expect(panel).toBeVisible({ timeout: 60000 });

    await panel.locator('[data-examples-about]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('What are these examples for?');
    await expect(dialog).toContainText('On data privacy');
    await dialog.getByRole('button', { name: 'Got it' }).click();

    // Every tag group sits on one line: its tags share a top edge.
    const spread = await panel.locator('[data-example-tags]').evaluateAll((groups) =>
      groups.map((g) => {
        const tops = [...g.children].map((c) => Math.round(c.getBoundingClientRect().top));
        return Math.max(...tops) - Math.min(...tops);
      }),
    );
    expect(spread.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...spread), 'a badge wrapped onto a line of its own').toBeLessThanOrEqual(4);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
