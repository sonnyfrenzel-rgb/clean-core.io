import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTerms } from '../lib/terms-versions';
import { ARCHIVED_BYOK_ADDENDUM_VERSIONS } from '../lib/legal/byok-addendum-versions';
import { LEGAL_DOCUMENTS } from '../lib/legal/documents';
import { resolveLegalSource } from '../lib/legal/markup';
import { LEGAL_RELEASE_DATE_ISO, OPEN_VALUES, unconfirmedOpenValues } from '../lib/legal/open-values';
import { TRUST_EN, TRUST_INTRO_EN } from '../lib/legal/texts/trust.en';
import { allConsentStrings } from '../lib/legal/consent-texts';

/**
 * RELEASE GATE for the legal texts of Fassung 1.1 (3.0.21). **Red on purpose
 * until the owner has answered every open value.**
 *
 * The build check the lawyer-side review asks for (section 8): no published
 * legal text may go live while it still contains "[Ä", "PLATZHALTER",
 * "PLACEHOLDER", "⚠", "[Variante" or "Anwalt" — or, in this repository, an
 * open value the owner has not confirmed (`ownerConfirmed: false` in
 * `lib/legal/open-values.ts`), which the page shows as "[offen: …]" /
 * "[open: …]" or, for a check, as a sentence whose truth nobody has confirmed.
 *
 * It reads the texts as they are published — rendered with the open values,
 * plus the archived files a consent record hashes — and not only the sources.
 *
 * How it is meant to be run is the merge's decision: as a release gate on
 * `main` only (dev may carry unanswered values while the owner tests). It is
 * listed in the report of the 3.0.21 legal-texts package as red by design.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const FORBIDDEN = ['[Ä', 'PLATZHALTER', 'PLACEHOLDER', '⚠', '[Variante', 'Anwalt', '[offen:', '[open:'];

const PUBLISHED: Array<{ name: string; text: string }> = [
  ...LEGAL_DOCUMENTS.map((d) => ({ name: `${d.route} (${d.lang})`, text: resolveLegalSource(d.source, d.lang) })),
  { name: '/trust', text: resolveLegalSource(`${TRUST_INTRO_EN}\n\n${TRUST_EN}`, 'en') },
  ...allConsentStrings().flatMap((c) => [
    { name: `consent ${c.path} (de)`, text: resolveLegalSource(c.text.de, 'de') },
    { name: `consent ${c.path} (en)`, text: resolveLegalSource(c.text.en, 'en') },
  ]),
];

const ARCHIVED: string[] = [
  archivedTerms(TERMS_VERSION)?.file,
  ...(archivedTerms(TERMS_VERSION)?.translations ?? []).map((t) => t.file),
  ...ARCHIVED_BYOK_ADDENDUM_VERSIONS.flatMap((v) => v.files.map((f) => f.file)),
].filter((f): f is string => typeof f === 'string');

test.describe('legal texts release gate (red until the owner confirms the open values)', () => {
  test('every open value is confirmed by the owner', () => {
    const open = unconfirmedOpenValues();
    expect(
      open.map((v) => `${v.key} — ${v.questionDe}`),
      `${open.length} of ${OPEN_VALUES.length} open values are not confirmed. Answer them in lib/legal/open-values.ts ` +
        '(set the value, set ownerConfirmed: true), then run scripts/legal/archive-terms.ts.',
    ).toEqual([]);
  });

  test('the release date is set and is the version id of the Terms', () => {
    expect(LEGAL_RELEASE_DATE_ISO, 'LEGAL_RELEASE_DATE_ISO is not set').not.toBeNull();
    expect(TERMS_VERSION, 'TERMS_VERSION is not the release date of Fassung 1.1').toBe(LEGAL_RELEASE_DATE_ISO);
  });

  for (const doc of PUBLISHED) {
    test(`published: ${doc.name}`, () => {
      const hits = FORBIDDEN.filter((m) => doc.text.includes(m));
      expect(hits, `${doc.name} would go live containing ${hits.join(', ')}`).toEqual([]);
    });
  }

  for (const file of ARCHIVED) {
    test(`archived: ${file}`, () => {
      const text = read(file);
      const hits = FORBIDDEN.filter((m) => text.includes(m));
      expect(hits, `${file} — the wording a consent record hashes — contains ${hits.join(', ')}`).toEqual([]);
    });
  }
});
