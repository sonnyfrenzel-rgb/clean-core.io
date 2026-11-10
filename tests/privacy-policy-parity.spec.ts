import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { legalPlainText, legalSections } from './helpers/legal-text';

/**
 * The two language versions of the privacy policy say the same thing.
 *
 * The policy exists twice: English at `/datenschutz`, German at
 * `/datenschutz/de`, and the German one prevails if they ever differ. That is a
 * promise about the *content*, and content in two texts drifts — somebody fixes
 * a sentence in the language they were reading and the other version quietly
 * becomes the older law.
 *
 * A translation cannot be compared word for word, so this guard compares the
 * skeleton, which is what a drift actually shows up in: the same number of
 * sections, numbered the same way, with the same anchors, and the same purposes
 * resting on the same legal basis. It also pins the duties a legal review asked
 * for, in both versions, because each of them is a duty rather than a preference.
 *
 * Since Fassung 1.1 (3.0.21) the words live in `lib/legal/texts/privacy.{en,de}.ts`
 * and the pages render them; this guard reads the texts as rendered
 * (`tests/helpers/legal-text.ts`) and the page files only for the frame (the
 * language switch and the metadata).
 */

const EN_PAGE = 'app/datenschutz/page.tsx';
const DE_PAGE = 'app/datenschutz/de/page.tsx';
const FRAME = 'components/legal/LegalPage.tsx';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const EN = () => legalPlainText('privacy', 'en');
const DE = () => legalPlainText('privacy', 'de');

/** The numbers of the section headings, in order. */
const sectionNumbers = (lang: 'en' | 'de') =>
  legalSections('privacy', lang).map((s) => Number(/^(\d+)\./.exec(s.heading)?.[1] ?? NaN));

/** Every section anchor, in order — these are the anchors other pages link to. */
const sectionAnchors = (lang: 'en' | 'de') =>
  legalSections('privacy', lang)
    .map((s) => s.id)
    .filter((id): id is string => !!id);

test.describe('the privacy policy in two languages', () => {
  test('both versions have the same sections, numbered the same way', () => {
    const en = sectionNumbers('en');
    const de = sectionNumbers('de');
    expect(en.length, 'the English version lost or gained a section').toBeGreaterThan(0);
    expect(de, `the two versions do not have the same sections — English ${en.join(', ')}, German ${de.join(', ')}`).toEqual(en);
    // 1..n with no gap and no repetition: the text of section 8 points at
    // "section 4", and section 3 points at section 8.
    expect(en, 'the sections are not numbered 1..n in order').toEqual(en.map((_, i) => i + 1));
  });

  test('both versions carry the same anchors', () => {
    const en = sectionAnchors('en');
    const de = sectionAnchors('de');
    expect(de, 'an anchor exists in one language and not the other').toEqual(en);
    // The trust card and section 3 link straight to this one.
    expect(en, 'the project-access anchor is gone').toContain('project-access');
  });

  test('each version links to the other, with the right hreflang', () => {
    const en = read(EN_PAGE);
    const de = read(DE_PAGE);
    expect(en, 'the English page does not offer the German version').toContain('switchHref="/datenschutz/de"');
    expect(de, 'the German page does not offer the English version').toContain('switchHref="/datenschutz"');
    expect(en).toContain('switchDataAttr="data-privacy-language-switch"');
    expect(de).toContain('switchDataAttr="data-privacy-language-switch"');
    expect(de).toContain('lang="de"');
    // The frame draws the switch: hrefLang describes the target, and the link
    // text is in the other language, so it carries `lang` as well (QA 36c5c5b3ec14).
    const frame = read(FRAME);
    expect(frame).toMatch(/hrefLang=\{other\}\s+lang=\{other\}/);
    // The alternates in the metadata, which is what actually reaches the crawler.
    expect(en).toContain("de: 'https://clean-core.io/datenschutz/de'");
    expect(de).toContain("en: 'https://clean-core.io/datenschutz'");
  });

  /** One row per duty a legal review named. Each is checked in both versions. */
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
    { what: 'which version prevails if they differ', en: /the German version prevails/, de: /ist die deutsche Fassung maßgeblich/ },
    // Fassung 1.1: "we offer no data processing agreement under Art. 28 GDPR for it".
    { what: 'that no processing agreement is offered', en: /no data processing agreement under Art\. 28 GDPR/, de: /Auftragsverarbeitungsvertrag nach Art\. 28 DSGVO bieten wir dafür nicht an/ },
    { what: 'the request not to upload personal data', en: /do not upload personal data/, de: /keine personenbezogenen Daten hoch/ },
    { what: 'that no cookies are set at all', en: /We set no cookies at all/, de: /überhaupt keine Cookies/ },
    { what: 'where the session actually lives', en: /IndexedDB/, de: /IndexedDB/ },
    { what: 'a section on server logs', en: /Server Logs/, de: /Serverprotokolle/ },
    { what: 'how long server logs are kept', en: /Google Cloud Logging/, de: /Google Cloud Logging/ },
    { what: 'what outlives an account deletion', en: /Art\. 17\(3\)\(e\)/, de: /Art\. 17 Abs\. 3 lit\. e/ },
    { what: 'the Art. 14 notice to invited people', en: /Art\. 14 GDPR/, de: /Art\. 14 DSGVO/ },
    // Fassung 1.1 additions.
    { what: 'the proof log kept to the end of the third calendar year', en: /end of the third calendar year after the contract ended/, de: /Ende des dritten Kalenderjahres nach dem Vertragsende/ },
    { what: 'the operator notice without name, address or motivation', en: /without your name, email address or motivation/, de: /ohne Ihren Namen, Ihre E-Mail-Adresse und Ihre Motivation/ },
    { what: 'the own Anthropic key for business accounts only', en: /only for a business account/, de: /nur für ein Geschäftskonto/ },
  ];

  for (const duty of duties) {
    test(`both versions state ${duty.what}`, () => {
      expect(EN(), `missing in the English version: ${duty.what}`).toMatch(duty.en);
      expect(DE(), `missing in the German version: ${duty.what}`).toMatch(duty.de);
    });
  }

  /**
   * Art. 13(1)(c) wants the basis stated for each processing, and the two
   * versions have to state it for the *same* set (QA review of 1c3476dfb92e).
   */
  test('both versions state a legal basis for the same number of purposes', () => {
    const en = EN().match(/Legal basis:/g)?.length ?? 0;
    const de = DE().match(/Rechtsgrundlage:/g)?.length ?? 0;
    expect(en, 'the English version states no legal basis per purpose at all').toBeGreaterThan(0);
    expect(de, `the two versions name a different number of legal bases — English ${en}, German ${de}`).toBe(en);
  });

  /**
   * Purpose for purpose, not only in total (QA 7dabb1930a07, 5cbc8deaa23c).
   * The purposes are the blocks of section 2, paired by position — the two
   * versions are translations of one document, so a purpose reordered or added
   * in one language only is itself the parity break this guard exists for.
   */
  type Purpose = { label: string; hasBasis: boolean; bases: string[] };
  const EN_BASIS = /Legal basis:/;
  const DE_BASIS = /Rechtsgrundlage:/;
  const EN_LETTER = /Art\. 6\(1\)\(([a-f])\)/g;
  const DE_LETTER = /Art\. 6 Abs\. 1 lit\. ([a-f])/g;
  const basisLetters = (item: string, pattern: RegExp): string[] => [...new Set([...item.matchAll(pattern)].map((m) => m[1]))].sort();

  const section2 = (lang: 'en' | 'de') => legalSections('privacy', lang)[1].body;
  const purposes = (blocks: string[], marker: RegExp, letter: RegExp): Purpose[] =>
    blocks.map((b) => ({ label: (/^([^:]{2,90}):/.exec(b)?.[1] ?? b.slice(0, 40)).trim(), hasBasis: marker.test(b), bases: basisLetters(b, letter) }));

  const firstPairwiseMismatch = (en: Purpose[], de: Purpose[]): string | null => {
    if (en.length !== de.length) return `the two versions list a different number of purposes: English ${en.length}, German ${de.length}`;
    for (let i = 0; i < en.length; i++) {
      if (en[i].hasBasis !== de[i].hasBasis) {
        return `purpose ${i + 1}: English "${en[i].label}" ${en[i].hasBasis ? 'states' : 'lacks'} a basis, German "${de[i].label}" ${de[i].hasBasis ? 'states' : 'lacks'} one`;
      }
      if (en[i].bases.join(',') !== de[i].bases.join(',')) {
        return `purpose ${i + 1}: English "${en[i].label}" rests on Art. 6(1)(${en[i].bases.join(', ') || '?'}), German "${de[i].label}" on Art. 6 Abs. 1 lit. ${de[i].bases.join(', ') || '?'} - not the same basis`;
      }
    }
    return null;
  };

  test('the same purposes carry a legal basis in both versions, pairwise', () => {
    const en = purposes(section2('en'), EN_BASIS, EN_LETTER);
    const de = purposes(section2('de'), DE_BASIS, DE_LETTER);
    expect(en.filter((p) => p.hasBasis).length, 'section 2 names hardly any purpose with a basis').toBeGreaterThan(10);
    expect(firstPairwiseMismatch(en, de)).toBeNull();
  });

  test('and the pairwise check catches a basis moved between purposes, which the count does not', () => {
    const blocks = [...section2('en')];
    const first = blocks.findIndex((b) => EN_BASIS.test(b));
    const last = blocks.map((b) => EN_BASIS.test(b)).lastIndexOf(true);
    expect(first, 'the English list has no basis to move').toBeGreaterThanOrEqual(0);
    const firstLabel = purposes([blocks[first]], EN_BASIS, EN_LETTER)[0].label;
    blocks[first] = blocks[first].replace(/Legal basis:/g, 'Basis:');
    blocks[last] = `${blocks[last]} Legal basis: Art. 6(1)(b) GDPR.`;
    const count = (bs: string[]) => bs.join(' ').match(/Legal basis:/g)?.length ?? 0;
    expect(count(blocks), 'the mutation changed the total, so it does not test the blind spot').toBe(count(section2('en')));
    const mismatch = firstPairwiseMismatch(purposes(blocks, EN_BASIS, EN_LETTER), purposes(section2('de'), DE_BASIS, DE_LETTER));
    expect(mismatch, 'the pairwise check let a moved legal basis through').not.toBeNull();
    expect(mismatch).toContain(firstLabel);
  });

  test('and it catches the same purpose resting on a different legal basis in the two languages', () => {
    const blocks = [...section2('en')];
    const at = blocks.findIndex((b) => b.includes('Art. 6(1)(b)'));
    expect(at, 'no purpose on Art. 6(1)(b) to alter').toBeGreaterThanOrEqual(0);
    blocks[at] = blocks[at].split('Art. 6(1)(b)').join('Art. 6(1)(f)');
    const en = purposes(blocks, EN_BASIS, EN_LETTER);
    const mismatch = firstPairwiseMismatch(en, purposes(section2('de'), DE_BASIS, DE_LETTER));
    expect(mismatch, 'a purpose on a different basis in the two languages went unnoticed').not.toBeNull();
    expect(mismatch).toMatch(/not the same basis/);
  });

  test('neither version claims sharing does not exist', () => {
    expect(EN().toLowerCase()).not.toContain('there is no sharing feature');
    expect(DE().toLowerCase()).not.toContain('keine möglichkeit, ein projekt zu teilen');
  });
});
