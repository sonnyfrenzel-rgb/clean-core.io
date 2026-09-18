import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The two rules the Terms took on after the legal review of 18.09.2026.
 *
 * Both are promises to a reader, and a promise nobody tests is one somebody
 * deletes on a tidy-up afternoon:
 *
 *   1. **Eighteen, not sixteen.** Art. 8 GDPR and contractual capacity are
 *      different questions. Consent at sixteen is a data-protection matter; the
 *      Terms are a contract, and a minor has only limited capacity to conclude
 *      one (§§ 106 ff. BGB), so an acceptance without a parent would stay
 *      provisionally invalid. The Privacy Policy carries the data-protection
 *      half; this is the contractual half, and it names the reason rather than
 *      only the number.
 *
 *   2. **No personal data in uploads, and no processing agreement.** ABAP source
 *      carries other people's data whether or not anyone meant it to. If a
 *      professional user uploads it, they are the controller and we would be the
 *      processor — which Art. 28(3) GDPR requires a contract for. The decision
 *      (Sonny, 18.09.2026) is not to offer that contract but to prohibit the
 *      upload, so the Terms have to say both, plainly.
 *
 * The third test is the one that matters most, and it is a negative. The honest
 * part of the prohibition is that it is a rule we ask users to keep and not
 * something the Platform detects, filters or blocks — nothing in the product
 * inspects an upload for personal data. A later edit that quietly upgrades the
 * rule into a claim of control ("we remove personal data", "uploads are
 * screened") would be exactly the sentence this repository removes rather than
 * adds, and it fails here.
 *
 * Numbering is guarded too. The document cross-references its own sections in
 * prose ("see section 5", "section 8 answers it"), so a new numbered section
 * that renumbers the rest silently turns those pointers into lies — and the
 * trust card on the upload screen cites "Terms §5" and "Terms §8" by name
 * (`lib/trust-claims.ts`).
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

/** What the Terms have to say, and why each sentence is in the document. */
const REQUIRED: { what: string; needle: string }[] = [
  {
    what: 'the minimum age is 18',
    needle: 'You must be at least 18 years old to register for or use the Platform',
  },
  {
    what: 'the reason is contractual capacity, not consent',
    needle: 'a minor has only limited capacity to do so (§§ 106 ff. BGB)',
  },
  {
    what: 'we do not check age, and what happens when we are told',
    needle: 'we will delete an account on notice that it belongs to someone younger',
  },
  {
    what: 'personal data of third parties may not be uploaded',
    needle: 'Do not submit personal data of third parties to the Platform in any form',
  },
  {
    what: 'there is no processing agreement under Art. 28 GDPR',
    needle: 'does not offer a data processing agreement under Art. 28 GDPR',
  },
  {
    what: 'and none will be concluded on request either',
    needle: 'there is no contract under which the operator could act as your processor',
  },
  {
    what: 'the prohibition is a rule, not a control the Platform exercises',
    needle: 'This is a rule we ask you to keep, not a control we exercise',
  },
  {
    what: 'nothing in the product inspects an upload for personal data',
    needle:
      'The Platform does not detect, screen, filter or block personal data in an upload, and nothing in it checks whether you have stripped anything',
  },
];

/** The concrete things a reader is told to strip. A rule with no examples is advice. */
const EXAMPLES = [
  /developer user IDs/i,
  /names of colleagues or customers in comments/i,
  /customer, vendor or employee numbers/i,
  /production records pasted in as test data/i,
];

test.describe('the Terms carry the two rules decided on 18.09.2026', () => {
  for (const { what, needle } of REQUIRED) {
    test(`it states ${what}`, () => {
      expect(
        prose(TERMS),
        `${TERMS} no longer says: "${needle}". This sentence was added on 18.09.2026 after a legal ` +
          'review; if it has to change, change it here too rather than dropping it.',
      ).toContain(normalise(needle));
    });
  }

  test('it names what to strip out of the code, not just the rule', () => {
    const text = prose(TERMS);
    for (const example of EXAMPLES) {
      expect(text, `the Terms stopped naming an example of personal data in ABAP: ${example}`).toMatch(example);
    }
  });

  test('the age rule is 18 everywhere in the document', () => {
    // The Privacy Policy said 16 until today and the Terms said nothing at all.
    // Two documents with two ages would be worse than one document with none.
    const text = prose(TERMS);
    expect(text, 'the Terms carry an older minimum age').not.toMatch(/at least 16 years old/i);
    expect((text.match(/at least 18 years old/gi) ?? []).length, 'the age is stated exactly once').toBe(1);
  });

  test('the Terms claim no control over uploads that the product does not have', () => {
    // The product does not look inside an upload for personal data. Every phrase
    // below would say it does. They are written as active claims on purpose:
    // "we do not detect" and "does not screen" are the negations and must stay
    // possible.
    const forbidden: RegExp[] = [
      /\bwe (?:detect|screen|filter|scan|block|remove|redact|anonymi[sz]e|strip)\b/i,
      /\bthe Platform (?:detects|screens|filters|scans|blocks|removes|redacts|anonymi[sz]es|strips)\b/i,
      /automatically (?:detect|detects|screen|screens|filter|filters|remove|removes|redact|redacts|strip|strips)\b/i,
      /\b(?:scanned|screened|filtered|redacted|anonymi[sz]ed) (?:for |before |automatically)/i,
      /\bpersonal data is (?:detected|removed|redacted|filtered|blocked|stripped)\b/i,
      // The passive voice is the easiest way to claim a control without naming
      // who exercises it: "uploads are automatically redacted". Note the verb
      // list — "produced by the Platform are automatically synthesized drafts"
      // in section 3 is a statement about output and has to stay possible.
      /\b(?:are|is|gets?) (?:automatically |always )?(?:scanned|screened|filtered|redacted|anonymi[sz]ed|stripped|saniti[sz]ed)\b/i,
    ];
    const text = prose(TERMS);
    for (const pattern of forbidden) {
      expect(
        text,
        `${TERMS} claims the Platform inspects or cleans uploads (${pattern}). It does not. ` +
          'A rule we ask users to keep must not be written as a control we exercise.',
      ).not.toMatch(pattern);
    }
  });
});

test.describe('the document still points at its own sections', () => {
  /** The numbers of the numbered `h2` headings, in the order they appear. */
  function sectionNumbers(): number[] {
    return [...read(TERMS).matchAll(/<h2[^>]*>\s*(\d+)\.\s/g)].map((m) => Number(m[1]));
  }

  test('the sections are numbered 1..n, with no gap and no repetition', () => {
    const numbers = sectionNumbers();
    expect(numbers.length, 'the Terms have no numbered sections any more').toBeGreaterThan(10);
    expect(numbers, 'a section was inserted or removed without renumbering the rest').toEqual(
      numbers.map((_, i) => i + 1),
    );
  });

  test('every "section N" in the prose reaches a section that exists', () => {
    const last = Math.max(...sectionNumbers());
    const referenced = [...prose(TERMS).matchAll(/section (\d+)/gi)].map((m) => Number(m[1]));
    expect(referenced.length, 'the document cross-references nothing — it used to').toBeGreaterThan(2);
    for (const n of referenced) {
      expect(n, `the Terms point at section ${n}, and there are only ${last} sections`).toBeLessThanOrEqual(last);
      expect(n, `the Terms point at section ${n}`).toBeGreaterThan(0);
    }
    // The two the trust card names by number (`lib/trust-claims.ts`): §5 is the
    // third-party AI section, §8 is the one about your content. If either moves,
    // the card on the upload screen sends the reader to the wrong place.
    const headings = [...read(TERMS).matchAll(/<h2[^>]*>\s*(\d+)\.\s([^<]+)</g)].map((m) => [m[1], m[2].trim()]);
    expect(headings.find(([n]) => n === '5')?.[1]).toMatch(/Third-Party AI/i);
    expect(headings.find(([n]) => n === '8')?.[1]).toMatch(/Your Content/i);
  });
});

test.describe('and a reader opening the page finds them', () => {
  test('the age rule and the upload rule are on the rendered page', async ({ page }) => {
    // The source check above is the fast one. A sentence can sit in a `.tsx`
    // file without ever reaching a screen — in a branch that does not render, in
    // a constant nothing reads. Only the rendered page settles it.
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
});
