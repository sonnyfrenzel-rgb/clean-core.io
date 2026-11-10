import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';

/**
 * What the lawyer's rewrite of 18.09.2026 put into the Terms — and what it took
 * out.
 *
 * `tests/terms-duties-guard.spec.ts` guards the two rules of the morning (the
 * age and the personal-data prohibition). This file guards the afternoon: the
 * three findings that could not be fixed by tidying sentences, because each of
 * them was a clause that would not survive being read out in front of a German
 * court.
 *
 *   1. **One liability cascade, not two.** The old § 4 excluded slight
 *      negligence in one sentence and admitted it for essential contractual
 *      obligations in the next. Under § 305c (2) BGB the customer-friendly
 *      reading wins, and under § 307 (2) No. 2 BGB the harsher one is void
 *      anyway — so the clause was both unclear and, read strictly, invalid. The
 *      new § 4.3 runs (a) unlimited heads, (b) slight negligence for essential
 *      obligations *with the definition spelled out* (§ 307 (1) sentence 2 BGB
 *      wants it defined, not merely named), (c) the exclusion, (d) data loss,
 *      (e) representatives and tort, (f) burden of proof and mandatory law.
 *
 *   2. **A free platform is still a digital product.** Consumers pay with
 *      personal data, so §§ 327 ff. BGB apply (§ 327 (3) BGB). That rules out a
 *      blanket warranty disclaimer, and it turns "we may discontinue this at any
 *      time" into § 327r BGB: a reason, 30 days' notice in text form, no cost,
 *      and a right to terminate when the change hurts more than negligibly.
 *
 *   3. **Silence is not a signature.** BGH, judgment of 27.04.2021 – XI ZR 26/20
 *      killed the "continued use constitutes acceptance" construction. § 10 now
 *      asks for express acceptance, six weeks ahead, out of a closed list of
 *      reasons — and says out loud that saying nothing is not saying yes.
 *
 * The negative half matters as much as the positive one. Every sentence in
 * `GONE` is one a court would strike; a merge that quietly restores one of them
 * is exactly the regression this file exists to catch.
 */

// Since Fassung 1.1 (3.0.21) the Terms' words are in lib/legal/texts/terms.en.ts.
const TERMS = 'lib/legal/texts/terms.en.ts';
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The readable prose of the page: JSX tags, entities and line breaks flattened. */
function prose(rel: string): string {
  return normalise(
    read(rel)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .replace(/<[^<>]*>/g, ' ')
      // the legal-text markup's emphasis (lib/legal/markup.ts)
      .replace(/\*\*/g, ''),
  );
}

function normalise(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;| /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What the rewrite put in, and the provision each sentence answers to — in the
 * wording of Terms v2.3.0 (Fassung 1.1 of the legal texts, 3.0.21). The
 * provisions are the same as in the rewrite of 18.09.2026; the sentences are
 * the lawyer-reviewed ones of v2.3.0. Section 13 changed by decision: there is
 * no statutory right of withdrawal (§ 312(1), (1a) sentence 2 BGB, operator
 * decision 17.10.2026), so the withdrawal clause and its model form went and a
 * termination clause took their place.
 */
const REQUIRED: { what: string; needle: string }[] = [
  // --- § 4.1 / 4.2: the service description, and the consumer's escape hatch.
  {
    what: '4.1 describes the service owed instead of disclaiming warranty wholesale',
    needle: 'They are evidence for your own assessment, not a guarantee',
  },
  {
    what: '4.2 makes any deviation conditional on the separate § 327h consent',
    needle:
      'it applies to you only if you were specifically informed of it before making your contractual declaration and ' +
      'expressly and separately agreed to the deviation (§ 327h BGB)',
  },
  {
    what: '4.2 leaves the §§ 327 ff. BGB rights untouched',
    needle: 'sections 2, 4.1, 4.3 and 6 are not intended to and do not limit those rights',
  },

  // --- § 4.3(a): the four heads of unlimited liability, plus the statutory ones.
  { what: '4.3(a) intent and gross negligence', needle: 'The operator is liable without limitation for damage caused intentionally or by gross negligence' },
  { what: '4.3(a) life, body or health', needle: 'for damage arising from injury to life, body or health based on a breach of duty by the operator' },
  { what: '4.3(a) fraudulent concealment of a defect', needle: 'for fraudulent concealment of a defect' },
  { what: '4.3(a) an assumed guarantee', needle: 'to the extent the operator has assumed a guarantee' },
  { what: '4.3(a) the Product Liability Act', needle: 'and under the German Product Liability Act' },

  // --- § 4.3(b): the material contractual obligation, defined and not merely named.
  {
    what: '4.3(b) slight negligence reaches only material contractual obligations',
    needle: 'In cases of slight negligence the operator is liable only for the breach of a material contractual obligation',
  },
  {
    what: '4.3(b) defines what a material contractual obligation is (§ 307 (1) sentence 2 BGB)',
    needle:
      'A contractual obligation is material if its fulfilment is what makes the proper performance of this contract ' +
      'possible in the first place, if its breach endangers the achievement of the purpose of the contract and if you ' +
      'may regularly rely on its being observed',
  },
  {
    what: '4.3(b) caps that liability at the foreseeable, contract-typical damage',
    needle: 'In these cases liability is limited to the foreseeable damage typical of the contract',
  },
  {
    what: '4.3(d) the data-loss cap names the backup the user was expected to have',
    needle:
      'Liability for loss of data is limited to the effort that would have been required to restore the data had you ' +
      'made backup copies appropriate to the risk',
  },
  { what: '4.3(f) the burden of proof is not shifted', needle: 'The statutory allocation of the burden of proof remains unaffected by the foregoing' },

  // --- § 2.3 / 2.5: term, notice, and the § 327r right.
  { what: '2.3 lets the user end the contract at any time', needle: 'You may terminate it at any time and without notice' },
  {
    what: "2.3 binds the operator to 30 days' notice in text form",
    needle: "by giving at least 30 days' notice in text form to the e-mail address associated with your account",
  },
  { what: '2.3 leaves an export window before the content goes', needle: 'Until the contract ends you may export your projects' },
  {
    what: '2.4 restricts suspension to good cause and undoes it when the cause is gone',
    needle: 'lift the measure as soon as the reason ceases to apply',
  },
  {
    what: '2.5 carries the § 327r BGB right to terminate free of charge',
    needle:
      'you may terminate the contract free of charge within 30 days of receiving that information or of the change ' +
      'taking effect, whichever is later (cf. § 327r BGB, where applicable)',
  },

  // --- § 6: a quota that may move forward, not backwards.
  { what: '6 changes quotas only with effect for the future', needle: 'The operator may adjust, introduce or remove quotas with effect for the future' },
  {
    what: '6 does not take back an allotment already granted',
    needle: 'A one-time allotment already granted to your existing account and not yet used will not be reduced retroactively',
  },

  // --- § 7: the measure catalogue of § 2.4, applied to moderation.
  { what: '7 requires an objective reason for a removal', needle: 'The operator may remove content where there is an objective reason for doing so' },
  { what: '7 is coupled to the measure catalogue in section 2.4', needle: 'Any such measure follows section 2.4' },
  { what: '7 gives the reason without undue delay, in text form', needle: 'the operator will inform you of the reason for it without undue delay in text form' },
  {
    what: '7 offers a hearing and reinstates when the reason ceases',
    needle: 'you will be given an opportunity to respond, and the measure will be lifted as soon as the reason for it ceases to apply',
  },

  // --- § 10: express acceptance instead of a consent fiction (BGH XI ZR 26/20).
  { what: '10.1 announces an amendment six weeks ahead, in text form', needle: 'at least six weeks before the date on which it is proposed to take effect' },
  { what: '10.2 requires express acceptance', needle: 'An amendment becomes binding on you only if you accept it expressly' },
  {
    what: '10.2 says silence and continued use are not acceptance',
    needle: 'Your silence, and your continued use of the Platform, do not constitute acceptance of an amendment',
  },
  {
    what: '10.3 lets a user who declines carry on under the old Terms',
    needle: 'you may continue to use the Platform on the basis of the Terms as they stood before the proposed amendment',
  },
  {
    what: '10.4 keeps the core of the contract out of unilateral amendment',
    needle: 'section 10.2 applies without exception, and section 10.4(e) does not apply to them',
  },

  // --- § 12: severability without geltungserhaltende Reduktion.
  {
    what: '12 puts the statute, not a rewritten clause, in the place of an invalid term',
    needle: 'The statutory provisions take the place of the invalid or unenforceable provision',
  },

  // --- § 13 (v2.3.0): termination instead of withdrawal; consent stays revocable.
  { what: '13 states that there is no statutory right of withdrawal', needle: 'There is no statutory right of withdrawal for consumers under this contract' },
  {
    what: '13 keeps termination at any time, without reasons',
    needle: 'you may terminate the contract at any time, without notice and without giving reasons (section 2.3)',
  },
  {
    what: '13 keeps the withdrawal of a data-protection consent apart',
    needle: 'the withdrawal of a consent under data-protection law (Art. 7(3) GDPR)',
  },
];

/**
 * Sentences the review removed. Each one is void or unclear, and a document that
 * carries a void clause is worse than one that carries none: the reader believes
 * it.
 */
const GONE: { why: string; needle: string }[] = [
  {
    why: 'the consent fiction (BGH, 27.04.2021 – XI ZR 26/20) is replaced by express acceptance in § 10.2',
    needle: 'Continued use of the Platform after changes take effect constitutes acceptance',
  },
  {
    why: 'the second liability sentence contradicted the essential-obligation sentence that followed it',
    needle: 'the operator is otherwise liable only for intent and gross negligence',
  },
  {
    why: 'a blanket warranty disclaimer cannot stand against § 327s BGB, and the "permitted by law" hedge made it opaque',
    needle: 'or compilation status of any output, to the extent permitted by law',
  },
  {
    why: 'discontinuation "at any time" ignores § 327r BGB and § 308 No. 4 BGB; § 2.3 and § 2.5 replace it',
    needle: 'The operator may modify, suspend, or discontinue the Platform, in whole or in part, at any time',
  },
  {
    why: 'a quota may move forward, not backwards over an allotment already granted',
    needle: 'remove quotas at any time',
  },
  {
    why: 'moderation "at its discretion and without notice" fails § 308 No. 3 and No. 4 BGB; § 7 now follows § 2.4',
    needle: 'at its discretion and without notice',
  },
  {
    why: 'the replacement clause amounts to geltungserhaltende Reduktion, which consumer terms do not get',
    needle: 'shall be replaced by a valid provision that comes as close as legally possible',
  },
  // Terms v2.3.0: no statutory right of withdrawal (operator decision 17.10.2026,
  // § 312(1), (1a) sentence 2 BGB) — a withdrawal right granted in the text
  // without a withdrawal function behind it would be the larger risk.
  {
    why: 'there is no statutory right of withdrawal for this free contract; section 13 is a termination clause now',
    needle: 'You have the right to withdraw from this contract within fourteen days',
  },
  {
    why: 'the model withdrawal form went with the withdrawal right',
    needle: 'Model withdrawal form',
  },
];

test.describe('the Terms carry the legal rewrite of 18.09.2026', () => {
  for (const { what, needle } of REQUIRED) {
    test(`it states ${what}`, () => {
      expect(
        prose(TERMS),
        `${TERMS} no longer says: "${needle}". The sentence is drafted to satisfy a specific German ` +
          'provision; a shorter or better-sounding one can be an invalid one.',
      ).toContain(normalise(needle));
    });
  }

  for (const { why, needle } of GONE) {
    test(`it no longer says "${needle.slice(0, 48)}…"`, () => {
      expect(
        prose(TERMS),
        `${TERMS} carries a clause the legal review removed: "${needle}". Reason it went: ${why}.`,
      ).not.toContain(normalise(needle));
    });
  }
});

test.describe('the sub-numbering the new clauses point at exists', () => {
  /** Every `N.M` that the document declares as a paragraph of its own. */
  function declaredSubsections(): Set<string> {
    return new Set([...read(TERMS).matchAll(/\*\*(\d+\.\d+)\*\*/g)].map((m) => m[1]));
  }

  test('§§ 2, 4 and 10 are actually split into the paragraphs they are cited by', () => {
    const declared = declaredSubsections();
    for (const label of ['2.1', '2.2', '2.3', '2.4', '2.5', '4.1', '4.2', '4.3', '10.1', '10.2', '10.3', '10.4', '10.5']) {
      expect(declared, `the Terms lost paragraph ${label}`).toContain(label);
    }
  });

  test('every "section N.M" in the prose reaches a paragraph that exists', () => {
    // The whole-number references are guarded in `terms-duties-guard.spec.ts`.
    // These are the new ones the rewrite introduced — § 2.5 points at § 10.4,
    // § 6 points at § 2.5, § 7 points at § 2.4, § 10.3 and § 13 point at § 2.3 —
    // and a renumbering inside a section would break them silently.
    const declared = declaredSubsections();
    const refs = [...prose(TERMS).matchAll(/section (\d+\.\d+)/gi)].map((m) => m[1]);
    expect(refs.length, 'the new clauses cross-reference nothing — they used to').toBeGreaterThan(4);
    for (const ref of refs) {
      expect(declared, `the Terms point at section ${ref}, which is not a paragraph of this document`).toContain(ref);
    }
  });

  test('the liability cascade runs (a) to (f) without a gap', () => {
    const text = prose(TERMS);
    const cascade = text.slice(text.indexOf('4.3 Liability of the operator'));
    expect(cascade.length, '§ 4.3 is gone').toBeGreaterThan(500);
    for (const letter of ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)']) {
      expect(cascade.indexOf(letter), `§ 4.3 lost limb ${letter}`).toBeGreaterThan(-1);
    }
    // In order, so a limb cannot be moved into a different clause.
    const positions = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'].map((l) => cascade.indexOf(l));
    expect(positions, '§ 4.3 limbs are out of order').toEqual([...positions].sort((x, y) => x - y));
  });

  test('§ 13 is appended, and nothing above it was renumbered', () => {
    const headings = [...read(TERMS).matchAll(/^## (\d+)\.\s(.+?)(?:\s+\{#[a-z0-9-]+\})?$/gm)].map((m) => [m[1], m[2].trim()]);
    expect(headings.at(-1)?.[0], 'section 13 is not the last numbered one').toBe('13');
    expect(headings.at(-1)?.[1]).toMatch(/Termination Instead of Withdrawal/i);
    // The two the trust card cites by number, unmoved (`lib/trust-claims.ts`).
    expect(headings.find(([n]) => n === '5')?.[1]).toMatch(/Third-Party AI/i);
    expect(headings.find(([n]) => n === '8')?.[1]).toMatch(/Your Content/i);
    expect(read(TERMS), 'the anchor the trust card links to is gone').toContain('{#free-community-edition}');
  });
});

test.describe('and a reader opening the page finds all of it', () => {
  test('every new obligation is on the rendered page, not merely in the source', async ({ page }) => {
    // The source checks above are the fast ones. A clause can sit in a `.tsx`
    // file without ever reaching a screen, and a clause nobody can read is not a
    // term of the contract.
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    const rendered = normalise(await page.locator('body').innerText());
    expect(rendered.length, '/terms rendered nothing').toBeGreaterThan(2000);
    for (const { what, needle } of REQUIRED) {
      expect(
        rendered,
        `a reader opening /terms does not find ${what}: "${needle}". It is in the source but not on the page.`,
      ).toContain(normalise(needle));
    }
  });

  test('and none of the removed clauses is still on it', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    const rendered = normalise(await page.locator('body').innerText());
    for (const { why, needle } of GONE) {
      expect(
        rendered,
        `a reader opening /terms still finds a clause the review removed: "${needle}" (${why}).`,
      ).not.toContain(normalise(needle));
    }
  });

  test('section 13 has its anchor and says termination, not withdrawal', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#termination');
    await expect(section, 'section 13 has no anchor of its own').toBeVisible();
    const text = normalise(await section.innerText());
    expect(text).toContain('There is no statutory right of withdrawal for consumers under this contract');
    expect(text, 'a withdrawal form is back on the page').not.toContain('Model withdrawal form');
  });
});
