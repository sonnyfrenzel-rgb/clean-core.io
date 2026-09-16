import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import {
  ACCESS_CLAIM_ID,
  ACCESS_NAMES_ADMIN,
  ACCESS_OWNER_ONLY,
  SECURITY_MODEL_URL,
  TRUST_CARD_DISCLOSURE,
  TRUST_CARD_SHOW,
  TRUST_CARD_TITLE,
  TRUST_CLAIMS,
  TRUST_PLEDGE,
  TRUST_SOURCE_FILES,
  type TrustClaim,
} from '../lib/trust-claims';

/**
 * The card "Your code and your trust" is a set of claims, not copy — roadmap
 * step 0.11, `DESIGN.md` §6.1.3.
 *
 * Someone about to hand over their company's ABAP is owed statements they can
 * check. So each line on the upload screen names the document that carries it,
 * and this spec is what makes that true rather than intended:
 *
 *   - statically: every claim's `evidence` has to occur, verbatim, in the Terms,
 *     the Privacy Policy or `SECURITY.md`, and its link has to reach that place;
 *   - conditionally: the access line names the administrator account for exactly
 *     as long as `firestore.rules` grants the admin read access to `projects` —
 *     and stops naming it when the rule stops;
 *   - rendered: the card on the screen shows the registry's statements and
 *     *nothing else*. A source guard can be satisfied by a component that quietly
 *     adds a reassuring sentence in JSX; the rendered text cannot.
 *
 * Adding a line to the card means writing it into a document first. That is the
 * point of the step.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/**
 * The readable prose of a document: JSX tags, markdown emphasis, HTML entities
 * and line breaks removed, so a sentence that a page splits across four indented
 * lines and two `<strong>` tags is still one sentence.
 */
function prose(rel: string): string {
  let text = read(rel);
  if (rel.endsWith('.tsx')) {
    text = text
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\{\s*(['"])([^'"]*)\1\s*\}/g, '$2')
      .replace(/<[^<>]*>/g, ' ');
  } else {
    text = text.replace(/```[\s\S]*?```/g, ' ').replace(/\*\*/g, '').replace(/`/g, '');
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALL_CLAIMS: TrustClaim[] = [TRUST_PLEDGE, ...TRUST_CLAIMS];

/** Where an in-app link points, as a file in this repository. */
const PAGE_FOR_ROUTE: Record<string, string> = {
  '/terms': 'app/terms/page.tsx',
  '/datenschutz': 'app/datenschutz/page.tsx',
};

test.describe('every statement on the card is written down somewhere', () => {
  test('the card is not empty and every claim carries a source', () => {
    expect(TRUST_CLAIMS.length, 'the card lost its claims').toBeGreaterThanOrEqual(8);
    for (const claim of ALL_CLAIMS) {
      expect(claim.sources.length, `${claim.id} cites nothing`).toBeGreaterThan(0);
      expect(claim.text.trim().length, `${claim.id} says nothing`).toBeGreaterThan(10);
    }
    const ids = ALL_CLAIMS.map((c) => c.id);
    expect(new Set(ids).size, 'two claims share an id').toBe(ids.length);
  });

  for (const claim of ALL_CLAIMS) {
    test(`"${claim.id}" — its source says it`, () => {
      for (const source of claim.sources) {
        expect(
          TRUST_SOURCE_FILES as readonly string[],
          `${claim.id} cites ${source.file}, which is not a document this card may cite`,
        ).toContain(source.file);

        const text = prose(source.file);
        expect(source.evidence.length, `${claim.id} → ${source.file} names no sentence`).toBeGreaterThan(0);
        for (const evidence of source.evidence) {
          expect(
            text,
            `${claim.id}: ${source.file} does not contain "${evidence}". ` +
              'Either write it into the document or take the statement off the card.',
          ).toContain(evidence);
        }
      }
    });
  }

  test('every link reaches the place that carries the claim', () => {
    for (const claim of ALL_CLAIMS) {
      for (const source of claim.sources) {
        if (source.href.startsWith('http')) {
          // The only external source is the security model in the public repository.
          expect(source.file, `${claim.id} links off-site to something other than SECURITY.md`).toBe('SECURITY.md');
          expect(source.href, `${claim.id} links to an unexpected URL`).toBe(SECURITY_MODEL_URL);
          continue;
        }
        const [route, anchor] = source.href.split('#');
        const page = PAGE_FOR_ROUTE[route];
        expect(page, `${claim.id} links to ${route}, which is not a legal page`).toBeTruthy();
        expect(page, `${claim.id} links to ${route} but cites ${source.file}`).toBe(source.file);
        expect(anchor, `${claim.id} links to ${route} without an anchor`).toBeTruthy();
        expect(read(page), `${route} has no id="${anchor}" to land on`).toContain(`id="${anchor}"`);
      }
    }
  });

  test('the security model it points at is the one this product publishes', () => {
    // "Our security model is public" is only true because the file is in the
    // repository the product names as its own, in public.
    const repo = 'https://github.com/sonnyfrenzel-rgb/clean-core.io';
    expect(SECURITY_MODEL_URL.startsWith(`${repo}/blob/`)).toBe(true);
    expect(SECURITY_MODEL_URL.endsWith('/SECURITY.md')).toBe(true);
    expect(read('README.md'), 'README does not name this repository').toContain(repo);
    expect(read('app/page.tsx'), 'the product does not publish this repository as its own').toContain(repo);
    expect(fs.existsSync(path.resolve(ROOT, 'SECURITY.md')), 'SECURITY.md is not in the repository').toBe(true);
  });
});

test.describe('the access line tracks the rule it describes', () => {
  /** The read rule on `projects`, taken out of whatever `firestore.rules` says today. */
  function projectsReadRule(rules: string = read('firestore.rules')): string {
    const after = rules.split('match /projects/{projectId} {')[1];
    expect(after, 'firestore.rules has no projects block any more').toBeTruthy();
    const block = after.split('match /')[0];
    const rule = block.split('allow read:')[1];
    expect(rule, 'the projects block has no read rule').toBeTruthy();
    return rule.split(';')[0];
  }

  const grantsAdminRead = (rules?: string) => /isAdmin\(\)/.test(projectsReadRule(rules));

  test('the reading of the rule is right in both directions', () => {
    // The branch below decides what the card may say, so it is tested on both
    // shapes of the rule rather than only on whichever one is in the tree today.
    const withAdmin = `match /projects/{projectId} {
      allow read: if isAuthenticated() && (isAdmin() || (resource != null && resource.data.userId == request.auth.uid));
      allow write: if false;
    }
    match /other/{id} { allow read: if isAdmin(); }`;
    const ownerOnly = `match /projects/{projectId} {
      allow read: if isAuthenticated() && (resource != null && resource.data.userId == request.auth.uid);
      allow write: if false;
    }
    match /other/{id} { allow read: if isAdmin(); }`;
    expect(grantsAdminRead(withAdmin), 'an admin read went unnoticed').toBe(true);
    // An `isAdmin()` further down the file must not be mistaken for one on projects.
    expect(grantsAdminRead(ownerOnly), 'an admin read was invented').toBe(false);
  });

  test('the card and the policy say the owner alone (Sonny, 16.09.2026)', () => {
    const claim = TRUST_CLAIMS.find((c) => c.id === ACCESS_CLAIM_ID);
    expect(claim, 'the access claim is gone').toBeTruthy();
    expect(claim!.text, 'the card must say the owner is alone').toContain(ACCESS_OWNER_ONLY);
    expect(
      claim!.text,
      'the admin has no standing read — the card must not present it as a reader',
    ).not.toContain(ACCESS_NAMES_ADMIN);
    expect(
      prose('app/datenschutz/page.tsx'),
      'the privacy policy has to say who can open a project before the card does',
    ).toContain('No other account has standing access, and our administrator account does not either');
    // And the one thing that is not a standing permission is written down too,
    // because the Admin SDK bypasses these rules by design and "nobody can read
    // it" would be false.
    expect(prose('app/datenschutz/page.tsx')).toContain(
      'Reaching a project then is a deliberate act by the operator on the server, not a permission that stands open, and it leaves a record',
    );
  });

  test('and firestore.rules grants exactly that', () => {
    // The card's sentence is true only while the rule behind it is. If the admin
    // read on `projects` ever comes back, this fails and the card, the Privacy
    // Policy §8 and this test change together — the card never quietly claims
    // more privacy than the database gives.
    expect(
      grantsAdminRead(),
      'firestore.rules still grants the administrator a read on every project, while the card says the owner is alone. ' +
        "Sonny's decision of 16.09.2026 removes that read; if this tree predates it, merge that change.",
    ).toBe(false);
  });
});

test.describe('the privacy policy says it first', () => {
  test('it names the community key as a paid Gemini API key', () => {
    // Roadmap 0.11: "die Datenschutzerklärung nennt den bezahlten Tarif des
    // Community-Schlüssels ausdrücklich, bevor die Karte es sagt." Without that
    // sentence the card's no-training line is a promise with nothing behind it.
    const policy = prose('app/datenschutz/page.tsx');
    expect(policy).toContain('The shared community key is a paid Gemini API key');
    expect(policy).toContain('Google does not use your code to train its models');
    expect(policy, 'BYOK still has to carry the free-tier caveat').toMatch(/free-tier/i);
  });
});

/* ---------------------------------------------------------------------- */
/* Rendered: what is actually on the screen before the upload.             */
/* ---------------------------------------------------------------------- */

const EMAIL = `trust-${Date.now()}@cleancore-test.io`;
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;
const PROJECT_ID = `trust-project-${Date.now()}`;

test.describe('the card on the upload screen', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, SIGN_IN);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Trust', lastName: 'Card', email: EMAIL, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    // A project that has not been analysed yet — the upload screen.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Trust card fixture', userId: cred.user.uid, createdAt: new Date(), status: 'uploaded',
    });
  });

  async function openUpload(page: import('@playwright/test').Page) {
    // `?auth=signin` is the link the header button carries (components/HeaderAuthButton.tsx)
    // and LandingModals reads. The fields are React-controlled: filling them
    // before hydration sets a value the first client render then wipes, and the
    // form posts an empty address — so the values are read back before submitting.
    await page.goto('/?auth=signin', { waitUntil: 'domcontentloaded' });
    // The sign-up form is in the DOM beside the sign-in one and carries its own
    // email field, hidden — so address the visible one, not the first one.
    const emailField = page.locator('input[type="email"]:visible').first();
    const passwordField = page.locator('input[type="password"]:visible').first();
    await emailField.waitFor({ state: 'visible', timeout: 60000 });
    await expect(async () => {
      await emailField.fill(EMAIL);
      await passwordField.fill(SIGN_IN);
      await expect(emailField).toHaveValue(EMAIL, { timeout: 3000 });
      await expect(passwordField).toHaveValue(SIGN_IN, { timeout: 3000 });
    }).toPass({ timeout: 30000 });
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(3500);
    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-stage-title]', { timeout: 60000 });
    await page.waitForSelector('[data-trust-card]', { timeout: 60000 });
  }

  test('it shows the registry claims, in order, and no sentence of its own', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openUpload(page);

    const rendered = await page.locator('[data-trust-claim]').evaluateAll((els) =>
      els.map((el) => ({ id: el.getAttribute('data-trust-claim'), text: (el.textContent || '').trim() })),
    );
    expect(rendered.map((r) => r.id)).toEqual(ALL_CLAIMS.map((c) => c.id));
    expect(rendered.map((r) => r.text)).toEqual(ALL_CLAIMS.map((c) => c.text));

    // And nothing that is not a claim, a source label or the card's own title.
    let rest = await page.locator('[data-trust-block]').innerText();
    const known = [
      TRUST_CARD_TITLE,
      ...ALL_CLAIMS.flatMap((c) => [c.text, ...c.sources.map((s) => s.label)]),
    ];
    for (const piece of known) {
      const at = rest.indexOf(piece);
      expect(at, `the upload screen does not show: "${piece}"`).toBeGreaterThanOrEqual(0);
      rest = rest.slice(0, at) + rest.slice(at + piece.length);
    }
    expect(
      rest.replace(/[\s·]/g, ''),
      'the trust block shows text that no document in this repository backs',
    ).toBe('');
  });

  test('every source link goes where the registry says', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openUpload(page);

    for (const claim of ALL_CLAIMS) {
      const links = page.locator(`[data-trust-source="${claim.id}"]`);
      await expect(links, `${claim.id} renders the wrong number of links`).toHaveCount(claim.sources.length);
      const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      expect(hrefs, `${claim.id} links elsewhere`).toEqual(claim.sources.map((s) => s.href));
    }
  });

  test('the pledge is a line, not a second tick box', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openUpload(page);

    await expect(page.locator('[data-trust-pledge]')).toContainText('Terms §5');
    await expect(page.locator('[data-trust-pledge]')).toContainText('Terms §8');
    expect(
      await page.locator('[data-trust-block] input[type="checkbox"]').count(),
      'the pledge grew a checkbox — the Terms are accepted at sign-up',
    ).toBe(0);
  });

  test('it promises no sharing, because there is none to promise', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openUpload(page);

    const block = (await page.locator('[data-trust-block]').innerText()).toLowerCase();
    // `DESIGN.md` §6.1.3 offers "Others see it only if you invite them." There is
    // no invitation in `firestore.rules` today; it arrives with roadmap 0.7.
    expect(block, 'the card offers sharing by invitation, which does not exist yet').not.toContain('invite');
    expect(block).not.toContain('share it with');
  });

  test('on a phone it is collapsed behind one control', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openUpload(page);

    const toggle = page.locator('[data-trust-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText(TRUST_CARD_DISCLOSURE);
    await expect(toggle).toContainText(TRUST_CARD_SHOW);
    await expect(page.locator('#trust-claim-list')).toBeHidden();

    await toggle.click();
    await expect(page.locator('#trust-claim-list')).toBeVisible();
    await expect(page.locator(`[data-trust-claim="${ACCESS_CLAIM_ID}"]`)).toBeVisible();
  });
});
