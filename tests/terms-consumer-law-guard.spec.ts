import { test, expect } from '@playwright/test';
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

const TERMS = 'app/terms/page.tsx';
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** The readable prose of the page: JSX tags, entities and line breaks flattened. */
function prose(rel: string): string {
  return normalise(
    read(rel)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .replace(/<[^<>]*>/g, ' '),
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

/** What the rewrite put in, and the provision each sentence answers to. */
const REQUIRED: { what: string; needle: string }[] = [
  // --- § 4.1 / 4.2: the agreed characteristics, and the consumer's escape hatch.
  {
    what: '4.1 agrees the output is draft material rather than disclaiming warranty wholesale',
    needle:
      'The parties expressly agree that the output owed under this contract consists of automatically synthesized draft artifacts',
  },
  {
    what: '4.2 makes that agreement conditional on the separate § 327h consent',
    needle: 'have expressly and separately agreed to it at that time (§ 327h BGB)',
  },
  {
    what: '4.2 leaves the §§ 327 ff. BGB rights untouched',
    needle: 'sections 2, 4.1, 4.3 and 6 neither are intended to nor do limit those rights',
  },

  // --- § 4.3(a): the four heads of unlimited liability, plus the statutory ones.
  {
    what: '4.3(a) intent and gross negligence',
    needle: 'The operator is liable without limitation for damages caused intentionally or by gross negligence',
  },
  {
    what: '4.3(a) life, body or health',
    needle: 'for damages arising from injury to life, body or health caused by a breach of duty by the operator',
  },
  {
    what: '4.3(a) fraudulent concealment of a defect',
    needle: 'for the fraudulent concealment of a defect',
  },
  {
    what: '4.3(a) an assumed guarantee',
    needle: 'where the operator has assumed a guarantee',
  },
  {
    what: '4.3(a) the Product Liability Act',
    needle: 'and under the German Product Liability Act (Produkthaftungsgesetz)',
  },

  // --- § 4.3(b): the essential contractual obligation, defined and not merely named.
  {
    what: '4.3(b) slight negligence reaches only essential contractual obligations',
    needle:
      'In the case of slight negligence, the operator is liable only for the breach of an essential contractual obligation',
  },
  {
    what: '4.3(b) defines what an essential contractual obligation is (§ 307 (1) sentence 2 BGB)',
    needle:
      'An essential contractual obligation is an obligation whose fulfilment makes the proper performance of this ' +
      'contract possible in the first place, whose breach jeopardises the achievement of the purpose of the contract, ' +
      'and on whose observance you may therefore regularly rely',
  },
  {
    what: '4.3(b) caps that liability at the foreseeable, contract-typical damage',
    needle: 'liability is limited to the damage that is foreseeable and typical for a contract of this kind',
  },
  {
    what: '4.3(d) the data-loss cap names the backup the user was expected to have',
    needle:
      'Liability for the loss of data is limited to the expense that would have been necessary to restore the data ' +
      'had you made backup copies appropriate to the risk',
  },
  {
    what: '4.3(f) the burden of proof is not shifted',
    needle: 'The above provisions do not alter the statutory allocation of the burden of proof',
  },

  // --- § 2.3 / 2.5: term, notice, and the § 327r right.
  {
    what: '2.3 lets the user end the contract at any time',
    needle: 'You may terminate it at any time and without notice',
  },
  {
    what: "2.3 binds the operator to 30 days' notice in text form",
    needle:
      "by giving at least 30 days' notice in text form to the e-mail address associated with your account",
  },
  {
    what: '2.3 leaves an export window before the content goes',
    needle: 'Until the contract ends you may export your projects',
  },
  {
    what: '2.4 restricts suspension to good cause and undoes it when the cause is gone',
    needle: 'will lift the measure as soon as the reason ceases to apply',
  },
  {
    what: '2.5 carries the § 327r BGB right to terminate free of charge',
    needle:
      'you may terminate the contract free of charge within 30 days of receiving that information or of the change ' +
      'taking effect, whichever is later (cf. § 327r BGB)',
  },

  // --- § 6: a quota that may move forward, not backwards.
  {
    what: '6 changes quotas only with effect for the future',
    needle: 'The operator may adjust, introduce or remove quotas with effect for the future',
  },
  {
    what: '6 does not take back an allotment already granted',
    needle:
      'A one-time allotment already granted to your existing account and not yet used will not be reduced retroactively',
  },

  // --- § 7: the measure catalogue of § 2.4, applied to moderation.
  {
    what: '7 requires an objective reason for a removal or a suspension',
    needle:
      'The operator may remove content and restrict, suspend or terminate access where there is an objective reason ' +
      'for doing so',
  },
  {
    what: '7 is coupled to the measure catalogue in section 2.4',
    needle: 'Any such measure follows section 2.4',
  },
  {
    what: '7 gives the reason without undue delay, in text form',
    needle: 'the operator will inform you of the reason for it without undue delay in text form',
  },
  {
    what: '7 offers a hearing and reinstates when the reason ceases',
    needle:
      'you will be given an opportunity to respond, and the measure will be lifted as soon as the reason for it ceases ' +
      'to apply',
  },

  // --- § 10: express acceptance instead of a consent fiction (BGH XI ZR 26/20).
  {
    what: '10.1 announces an amendment six weeks ahead, in text form',
    needle: 'at least six weeks before the date on which it is proposed to take effect',
  },
  {
    what: '10.2 requires express acceptance',
    needle: 'An amendment becomes binding on you only if you accept it expressly',
  },
  {
    what: '10.2 says silence and continued use are not acceptance',
    needle: 'Your silence, and your continued use of the Platform, do not constitute acceptance of an amendment',
  },
  {
    what: '10.3 lets a user who declines carry on under the old Terms',
    needle:
      'you may continue to use the Platform on the basis of the Terms as they stood before the proposed amendment',
  },
  {
    what: '10.4 keeps the core of the contract out of unilateral amendment',
    needle: 'are never implemented unilaterally and always require your express acceptance under section 10.2',
  },

  // --- § 12: severability without geltungserhaltende Reduktion.
  {
    what: '12 puts the statute, not a rewritten clause, in the place of an invalid term',
    needle: 'In place of an invalid or unenforceable provision, the statutory provisions apply',
  },

  // --- § 13: the withdrawal right that § 312 (1a) BGB extends to data-paid products.
  {
    what: '13 grants the fourteen-day withdrawal right',
    needle: 'You have the right to withdraw from this contract within fourteen days without giving any reason',
  },
  {
    what: '13 names where to send the withdrawal',
    needle: 'e-mail info@clean-core.io',
  },
  {
    what: '13 states the effects of withdrawal for a contract with no price',
    needle: 'so there are no payments to be reimbursed',
  },
  {
    what: '13 reproduces the § 356 (5) BGB conditions for early expiry',
    needle: 'have acknowledged that you thereby lose your right of withdrawal',
  },
  {
    what: '13 carries the model withdrawal form',
    needle: 'Model withdrawal form',
  },
  {
    what: '13 gives the form a body a consumer can actually send',
    needle:
      'I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following ' +
      'service: use of the Clean-Core.io Platform',
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
    return new Set([...read(TERMS).matchAll(/<strong>(\d+\.\d+)\b/g)].map((m) => m[1]));
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
    const headings = [...read(TERMS).matchAll(/<h2[^>]*>\s*(\d+)\.\s([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
    expect(headings.at(-1)?.[0], 'the withdrawal section is not the last numbered one').toBe('13');
    expect(headings.at(-1)?.[1]).toMatch(/Right of Withdrawal/i);
    // The two the trust card cites by number, unmoved (`lib/trust-claims.ts`).
    expect(headings.find(([n]) => n === '5')?.[1]).toMatch(/Third-Party AI/i);
    expect(headings.find(([n]) => n === '8')?.[1]).toMatch(/Your Content/i);
    expect(read(TERMS), 'the anchor the trust card links to is gone').toContain('id="free-community-edition"');
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

  test('the withdrawal form is a form, not a paragraph about one', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#right-of-withdrawal');
    await expect(section, 'the withdrawal section has no anchor of its own').toBeVisible();
    const items = section.locator('li');
    expect(await items.count(), 'the model form lost its fields').toBeGreaterThanOrEqual(7);
    const text = normalise(await section.innerText());
    for (const field of [
      'Name of the consumer(s)',
      'Address of the consumer(s)',
      'Signature of the consumer(s)',
      'Date:',
    ]) {
      expect(text, `the model withdrawal form has no field for: ${field}`).toContain(field);
    }
    expect(text, 'the form no longer says which alternatives to delete').toContain('(*) Delete as appropriate');
  });
});
