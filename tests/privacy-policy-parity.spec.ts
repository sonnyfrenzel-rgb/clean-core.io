import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The two language versions of the privacy policy say the same thing.
 *
 * Since 18.09.2026 the policy exists twice: English at `/datenschutz`, German at
 * `/datenschutz/de`. Both pages tell the reader they are "equally
 * authoritative", which is a promise about the *content*, and content in two
 * files drifts — somebody fixes a sentence in the language they were reading and
 * the other version quietly becomes the older law.
 *
 * A translation cannot be compared word for word, so this guard compares the
 * skeleton, which is what a drift actually shows up in: the same number of
 * sections, numbered the same way, with the same anchors. A section added to one
 * version and not the other fails here, and that is the case worth catching —
 * the one where a reader is told something in one language that the other
 * language does not say at all.
 *
 * It also pins the things a legal review asked for on 18.09.2026, in both
 * versions, because each of them is a duty rather than a preference: the right
 * to object under Art. 21 in its own highlighted block (Art. 21(4) wants it
 * presented separately), the competent supervisory authority by name, the
 * statement on automated decision-making (Art. 22), the concrete retention of
 * the audit record, and the Data Privacy Framework as the transfer mechanism.
 */

const EN = 'app/datenschutz/page.tsx';
const DE = 'app/datenschutz/de/page.tsx';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

/** The numbers of the `h2` headings, in the order they appear. */
function sectionNumbers(source: string): number[] {
  return [...source.matchAll(/^\s+(\d+)\.\s+\S/gm)].map((m) => Number(m[1]));
}

/** Every `id` on a `<section>`, in order — these are the anchors other pages link to. */
function sectionAnchors(source: string): string[] {
  return [...source.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
}

test.describe('the privacy policy in two languages', () => {
  test('both versions have the same sections, numbered the same way', () => {
    const en = sectionNumbers(read(EN));
    const de = sectionNumbers(read(DE));

    expect(en.length, 'the English version lost or gained a section').toBeGreaterThan(0);
    expect(
      de,
      `the two versions do not have the same sections — English ${en.join(', ')}, German ${de.join(', ')}. ` +
        'Both pages promise they are equally authoritative; a section in one and not the other breaks that.',
    ).toEqual(en);
    // 1..n with no gap and no repetition. A renumbering is what breaks the
    // cross-references: the text of section 8 points at "section 4", and section
    // 3 points at section 8.
    expect(en, 'the sections are not numbered 1..n in order').toEqual(en.map((_, i) => i + 1));
  });

  test('both versions carry the same anchors', () => {
    const en = sectionAnchors(read(EN));
    const de = sectionAnchors(read(DE));
    expect(de, 'an anchor exists in one language and not the other').toEqual(en);
    // The trust card and section 3 link straight to this one.
    expect(en, 'the project-access anchor is gone').toContain('project-access');
  });

  test('each version links to the other, with the right hreflang', () => {
    const en = read(EN);
    const de = read(DE);
    expect(en, 'the English page does not offer the German version').toContain('data-privacy-language-switch="de"');
    expect(en).toContain('/datenschutz/de');
    expect(de, 'the German page does not offer the English version').toContain('data-privacy-language-switch="en"');
    expect(de).toMatch(/href="\/datenschutz"/);
    expect(en, 'hreflang is what tells a search engine these are translations').toContain('hrefLang="de"');
    expect(de).toContain('hrefLang="en"');
    // The alternates in the metadata, which is what actually reaches the crawler.
    expect(en).toContain("de: 'https://clean-core.io/datenschutz/de'");
    expect(de).toContain("en: 'https://clean-core.io/datenschutz'");
  });

  /**
   * One row per duty the legal review of 18.09.2026 named. Each is checked in
   * both versions, because a duty met in one language is not met.
   */
  const duties: { what: string; en: RegExp; de: RegExp }[] = [
    { what: 'the right to object (Art. 21) in its own block', en: /Your right to object \(Art\. 21 GDPR\)/, de: /Ihr Widerspruchsrecht \(Art\. 21 DSGVO\)/ },
    { what: 'the right to object listed among the rights', en: /Right to Object \(Art\. 21 GDPR\)/, de: /Widerspruchsrecht \(Art\. 21 DSGVO\)/ },
    { what: 'the competent supervisory authority by name', en: /Bayerisches Landesamt für Datenschutzaufsicht/, de: /Bayerische Landesamt für Datenschutzaufsicht/ },
    { what: 'the data protection officer question answered', en: /Data protection officer/, de: /Datenschutzbeauftragter/ },
    { what: 'whether providing the data is required (Art. 13(2)(e))', en: /Do you have to provide this data\?/, de: /Müssen Sie diese Daten bereitstellen\?/ },
    { what: 'no automated decision-making (Art. 22)', en: /No automated decision-making \(Art\. 22 GDPR\)/, de: /Keine automatisierte Entscheidung im Einzelfall \(Art\. 22 DSGVO\)/ },
    { what: 'a concrete retention for the audit record', en: /Security audit records are kept for 24 months/, de: /Sicherheits-Protokolleinträge werden 24 Monate/ },
    { what: 'the Data Privacy Framework as the transfer basis', en: /EU-U\.S\. Data Privacy Framework/, de: /EU-U\.S\. Data Privacy Framework/ },
    { what: 'the minimum age', en: /at least 16 years old/, de: /mindestens 16 Jahre alt/ },
    { what: 'the Art. 14 notice to invited people', en: /Art\. 14 GDPR/, de: /Art\. 14 DSGVO/ },
  ];

  for (const duty of duties) {
    test(`both versions state ${duty.what}`, () => {
      expect(read(EN), `missing in the English version: ${duty.what}`).toMatch(duty.en);
      expect(read(DE), `missing in the German version: ${duty.what}`).toMatch(duty.de);
    });
  }

  test('neither version claims sharing does not exist', () => {
    // The sentence this replaced said "There is no sharing feature today". It was
    // true until phase 5 shipped, and a policy that still said it would be the
    // document that governs telling the reader the opposite of what the product
    // does.
    expect(read(EN).toLowerCase()).not.toContain('there is no sharing feature');
    expect(read(DE).toLowerCase()).not.toContain('keine möglichkeit, ein projekt zu teilen');
    // And section 3 must not say the owner is alone, which it did until today.
    expect(read(EN), 'section 3 still says only the creating account can read').not.toMatch(
      /only the account that created it\s*\n?\s*&mdash; not other accounts/,
    );
  });
});
