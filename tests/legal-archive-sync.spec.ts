import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTerms } from '../lib/terms-versions';
import { ARCHIVED_BYOK_ADDENDUM_VERSIONS, archivedAddendum } from '../lib/legal/byok-addendum-versions';
import { BYOK_ADDENDUM_ID, LEGAL_DOCUMENTS, legalDocumentBlocks } from '../lib/legal/documents';
import { toArchiveMarkdown, tokensIn } from '../lib/legal/markup';
import { OPEN_VALUES, renderOpenValue } from '../lib/legal/open-values';
import { TRUST_EN, TRUST_INTRO_EN } from '../lib/legal/texts/trust.en';
import { allConsentStrings } from '../lib/legal/consent-texts';

/**
 * The legal texts of Fassung 1.1 (3.0.21) come from one source each, and the
 * archive, the page and the open-value register have to agree with it.
 *
 * Green now, and has to stay green: unlike `legal-texts-release-gate.spec.ts`
 * nothing here waits for the owner. It fails when
 *   - an archived file (the wording a consent record hashes) no longer is the
 *     source as rendered — the archive script was not run after an edit;
 *   - a draft marker of the lawyer's working copy reached a source ("[Ä…]",
 *     "[PLATZHALTER …]", "[Variante …]", "⚠", "Anwalt") — those are resolved
 *     before a text is committed, not by the owner;
 *   - a token names no open value, or an open value is asked that no text uses;
 *   - the German and the English version of a document differ in structure;
 *   - a text points to a clean-core.io address that is no page.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const SOURCES: Array<{ name: string; text: string }> = [
  ...LEGAL_DOCUMENTS.map((d) => ({ name: `${d.id}.${d.lang}`, text: d.source })),
  { name: 'trust.en', text: TRUST_EN },
  { name: 'trust-intro.en', text: TRUST_INTRO_EN },
  ...allConsentStrings().flatMap((c) => [
    { name: `consent ${c.path} (de)`, text: c.text.de },
    { name: `consent ${c.path} (en)`, text: c.text.en },
  ]),
];

const DRAFT_MARKERS = ['[Ä', 'PLATZHALTER', 'PLACEHOLDER', '[Variante', '⚠', 'Anwalt', 'ANWALT', 'Empf. Nr.'];

test.describe('the sources carry no draft markers', () => {
  for (const s of SOURCES) {
    test(s.name, () => {
      for (const marker of DRAFT_MARKERS) {
        expect(s.text.includes(marker), `${s.name} still contains "${marker}" from the working draft`).toBe(false);
      }
    });
  }
});

test.describe('the archive is the source, rendered', () => {
  test('Terms of Service in force, English', () => {
    const entry = archivedTerms(TERMS_VERSION);
    expect(entry, `${TERMS_VERSION} is not archived`).toBeTruthy();
    expect(
      read(entry!.file),
      `${entry!.file} is not what lib/legal/texts/terms.en.ts renders — run scripts/legal/archive-terms.ts (before publication only)`,
    ).toBe(toArchiveMarkdown(legalDocumentBlocks('terms', 'en')));
  });

  test('Terms of Service in force, German', () => {
    const de = archivedTerms(TERMS_VERSION)?.translations?.find((t) => t.lang === 'de');
    expect(de, `${TERMS_VERSION} has no archived German version`).toBeTruthy();
    expect(read(de!.file), `${de!.file} is not what lib/legal/texts/terms.de.ts renders`).toBe(
      toArchiveMarkdown(legalDocumentBlocks('terms', 'de')),
    );
  });

  test('the Additional Agreement in force, both languages', () => {
    const entry = archivedAddendum(BYOK_ADDENDUM_ID);
    expect(entry, `${BYOK_ADDENDUM_ID} is not archived`).toBeTruthy();
    for (const lang of ['en', 'de'] as const) {
      const file = entry!.files.find((f) => f.lang === lang);
      expect(file, `${BYOK_ADDENDUM_ID} has no ${lang} file`).toBeTruthy();
      expect(read(file!.file), `${file!.file} is not what the source renders`).toBe(
        toArchiveMarkdown(legalDocumentBlocks('byok-addendum', lang)),
      );
    }
  });

  test('the effective dates in the archive index are the release date the texts render', () => {
    const entry = archivedTerms(TERMS_VERSION)!;
    expect(entry.effectiveOn).toBe(renderOpenValue('releaseDate', 'en'));
    expect(entry.translations?.find((t) => t.lang === 'de')?.effectiveOn).toBe(renderOpenValue('releaseDate', 'de'));
    const addendum = archivedAddendum(BYOK_ADDENDUM_ID)!;
    expect(addendum.effectiveOn).toEqual({ en: renderOpenValue('releaseDate', 'en'), de: renderOpenValue('releaseDate', 'de') });
  });

  test('the addendum archive directory holds exactly the listed files', () => {
    const listed = ARCHIVED_BYOK_ADDENDUM_VERSIONS.flatMap((v) => v.files.map((f) => f.file)).sort();
    const onDisk = fs
      .readdirSync(path.resolve(ROOT, 'docs/byok-addendum'))
      .map((n) => `docs/byok-addendum/${n}`)
      .sort();
    expect(onDisk).toEqual(listed);
  });
});

test.describe('tokens and open values agree', () => {
  const used = new Set(SOURCES.flatMap((s) => tokensIn(s.text)));

  test('every token names an open value', () => {
    const known = new Set(OPEN_VALUES.map((v) => v.key));
    for (const key of used) expect(known.has(key), `{{${key}}} is used but not defined in lib/legal/open-values.ts`).toBe(true);
  });

  test('every open value is used by a text', () => {
    for (const v of OPEN_VALUES) expect(used.has(v.key), `${v.key} is asked but no text uses it`).toBe(true);
  });

  test('a fact is never pre-filled unless the owner confirmed it', () => {
    for (const v of OPEN_VALUES) {
      // A fact entered on the owner's instruction names where it was read (enteredFrom) and stays unconfirmed until he checks it.
      if (v.isFact && v.value && v.key !== 'claudeModelId' && !v.enteredFrom?.trim()) {
        expect(v.ownerConfirmed, `${v.key} is a fact with a value nobody confirmed`).toBe(true);
      }
    }
  });

  test('a check renders nothing; an unfilled value renders a visible marker', () => {
    for (const v of OPEN_VALUES) {
      for (const lang of ['de', 'en'] as const) {
        const out = renderOpenValue(v.key, lang);
        if (v.kind === 'check') expect(out).toBe('');
        else if (!v.value) expect(out).toMatch(lang === 'de' ? /^\[offen: / : /^\[open: /);
        else expect(out).toBe(v.value[lang]);
      }
    }
  });
});

test.describe('the German and the English version have the same structure', () => {
  for (const id of ['privacy', 'terms', 'byok-addendum', 'report'] as const) {
    test(id, () => {
      const shape = (lang: 'de' | 'en') =>
        legalDocumentBlocks(id, lang)
          .filter((b) => b.kind === 'heading')
          .map((b) => (b.kind === 'heading' ? `${b.level}:${b.id ?? ''}:${b.text.split(' ')[0]}` : ''));
      const de = shape('de').map((s) => s.replace(/:[^:]*$/, ''));
      const en = shape('en').map((s) => s.replace(/:[^:]*$/, ''));
      expect(de).toEqual(en);
      const count = (lang: 'de' | 'en') => legalDocumentBlocks(id, lang).length;
      expect(count('de'), `${id}: the German version has a different number of blocks`).toBe(count('en'));
    });
  }
});

test('every clean-core.io address a text names is a page', () => {
  const pageFor = (route: string) => {
    const dir = route === '' ? 'app' : `app${route}`;
    return ['page.tsx', 'route.ts'].some((f) => fs.existsSync(path.resolve(ROOT, dir, f))) ||
      fs.existsSync(path.resolve(ROOT, `app/(app)${route}/page.tsx`));
  };
  const all = SOURCES.map((s) => s.text).join('\n');
  for (const m of all.matchAll(/(?<![\w./@-])clean-core\.io(\/[a-z0-9/-]*[a-z0-9])/g)) {
    expect(pageFor(m[1]), `the texts name clean-core.io${m[1]}, which is no page`).toBe(true);
  }
});
