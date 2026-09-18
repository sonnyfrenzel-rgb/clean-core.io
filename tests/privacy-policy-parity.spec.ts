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
    { what: 'a concrete retention for the audit record', en: /24 months from the recorded action/, de: /24 Monate ab der protokollierten Handlung/ },
    { what: 'the Data Privacy Framework as the transfer basis', en: /EU-U\.S\. Data Privacy Framework/, de: /EU-U\.S\. Data Privacy Framework/ },
    { what: 'the minimum age', en: /at least 18 years old/, de: /mindestens 18 Jahre alt/ },
    // Added 18.09.2026 after the second legal review.
    { what: 'which version prevails if they differ', en: /the German version prevails/, de: /deutsche Fassung ma&szlig;geblich/ },
    { what: 'that no processing agreement is offered', en: /do not offer a data processing agreement/, de: /keinen Auftragsverarbeitungsvertrag/ },
    { what: 'the request not to upload personal data', en: /do not upload personal data/, de: /keine personenbezogenen Daten hoch/ },
    { what: 'that no cookies are set at all', en: /We set no cookies at all/, de: /überhaupt keine Cookies/ },
    { what: 'where the session actually lives', en: /IndexedDB/, de: /IndexedDB/ },
    { what: 'a section on server logs', en: /Server Logs/, de: /Serverprotokolle/ },
    { what: 'how long server logs are kept', en: /Google Cloud Logging/, de: /Google Cloud Logging/ },
    { what: 'what outlives an account deletion', en: /Art\. 17\(3\)\(e\)/, de: /Art\. 17 Abs\. 3 lit\. e/ },
    { what: 'the Art. 14 notice to invited people', en: /Art\. 14 GDPR/, de: /Art\. 14 DSGVO/ },
  ];

  for (const duty of duties) {
    test(`both versions state ${duty.what}`, () => {
      expect(read(EN), `missing in the English version: ${duty.what}`).toMatch(duty.en);
      expect(read(DE), `missing in the German version: ${duty.what}`).toMatch(duty.de);
    });
  }

  /**
   * Art. 13(1)(c) wants the basis stated for each processing, and the two
   * versions have to state it for the *same* set. Counting is crude and it is
   * exactly what was needed: the English "Google Authentication" bullet went out
   * without its basis while the German one had it, six against seven, and the
   * guard above — sections, anchors, keywords — saw nothing (QA review of
   * 1c3476dfb92e). A disclosure duty met in one language is not met.
   */
  test('both versions state a legal basis for the same number of purposes', () => {
    const en = read(EN).match(/Legal basis:/g)?.length ?? 0;
    const de = read(DE).match(/Rechtsgrundlage:/g)?.length ?? 0;
    expect(en, 'the English version states no legal basis per purpose at all').toBeGreaterThan(0);
    expect(
      de,
      `the two versions name a different number of legal bases — English ${en}, German ${de}. ` +
        'One of them is missing a purpose, and a reader in that language is told less than the other.',
    ).toBe(en);
  });

  /**
   * Purpose for purpose, not only in total.
   *
   * The count above is blind to a swap: take the basis off one English purpose,
   * add a sentence to a different one, and the two totals still agree while the
   * two languages no longer state the basis for the same processing. A QA review
   * flagged exactly that shape (7dabb1930a07).
   *
   * There is no cross-language key on a purpose — the labels are prose in each
   * language — so this pairs them by position inside the one list that carries
   * legal bases. That is a deliberate assumption, and the right one: the two
   * versions are translations of a single document, and a purpose reordered or
   * added in one language only is itself the parity break this guard exists for.
   */
  test('the same purposes carry a legal basis in both versions, pairwise', () => {
    const purposes = (src: string, basisMarker: RegExp) => {
      // The purposes list is the <ul> that contains the basis marker; every
      // <li> in it starts with a <strong> label.
      const lists = src.split(/<ul[^>]*>/).slice(1).map((chunk) => chunk.split('</ul>')[0]);
      const list = lists.find((l) => basisMarker.test(l));
      expect(list, 'no list carrying a legal basis was found').toBeDefined();
      return (list as string)
        .split(/<li>/)
        .slice(1)
        .map((item) => ({
          label: (item.match(/<strong[^>]*>([^<]*)<\/strong>/)?.[1] ?? '').replace(/:\s*$/, '').trim(),
          hasBasis: basisMarker.test(item),
        }));
    };

    const en = purposes(read(EN), /Legal basis:/);
    const de = purposes(read(DE), /Rechtsgrundlage:/);

    expect(
      de.length,
      `the two versions list a different number of purposes — English ${en.length}, German ${de.length}: ` +
        `EN [${en.map((p) => p.label).join(' | ')}] vs DE [${de.map((p) => p.label).join(' | ')}]`,
    ).toBe(en.length);

    for (let i = 0; i < en.length; i++) {
      expect(
        de[i].hasBasis,
        `purpose ${i + 1} — English "${en[i].label}" ${en[i].hasBasis ? 'states' : 'lacks'} a basis, ` +
          `German "${de[i].label}" ${de[i].hasBasis ? 'states' : 'lacks'} one`,
      ).toBe(en[i].hasBasis);
    }

    // Not vacuous: the list actually has purposes, and every one of them names
    // its basis today — a guard that passed on an empty list would prove nothing.
    expect(en.length).toBeGreaterThan(5);
    expect(en.every((p) => p.hasBasis), 'an English purpose carries no legal basis').toBe(true);
  });

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
