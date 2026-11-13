import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NAMING_ASKED_IN_THIS_BUILD, NAMING_WITHOUT_FACTS_PAUSED } from '../lib/process-naming';
import { automaticStagesInThisBuild } from '../lib/auto-steps-notice';
import { LEGAL_TEXTS_NAMES_AUTOMATIC, namesWording } from '../lib/legal/names-wording';
import { CONSENT_TEXTS, consentText } from '../lib/legal/consent-texts';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';
import { TRUST_EN } from '../lib/legal/texts/trust.en';

/**
 * Legal review, document 19: business names start by themselves again once the build hands the model the engine's
 * facts, and the legal texts say so in that build and in no other.
 *
 * The texts and the build read one rule each — the texts `LEGAL_TEXTS_NAMES_AUTOMATIC` (`lib/legal/names-wording.ts`),
 * the build `NAMING_ASKED_IN_THIS_BUILD` (`lib/process-naming.ts`) — and this spec holds them together, both ways:
 * names asked ⇔ privacy section 3, the Trust page and C14 say names run by themselves. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** What each text says in the build that asks for names, and what it said while they were paused. */
const SAYS = {
  privacyDe: {
    automatic: 'Zwei starten wir beim Öffnen eines Projekts selbst: verständliche Formulierungen (Fachsätze) und fachliche Namen im Business-Bereich',
    paused: 'Fachliche Namen, die wir ebenso von selbst starteten, sind ausgesetzt',
  },
  privacyEn: {
    automatic: 'Two we start ourselves when a project is opened: plain-language wording (business sentences) and business names in the business area',
    paused: 'Business names, which we also started ourselves, are paused',
  },
  trust: {
    automatic: 'Two stages — plain-language wording and business names — start by themselves',
    paused: 'business names, which also did, are paused',
  },
  c14De: { automatic: 'zwei Schritte – Fachsätze und fachliche Namen –', paused: 'ein Schritt – Fachsätze –' },
  c14En: { automatic: 'two steps — plain business sentences and business names —', paused: 'one step — plain business sentences —' },
} as const;

const RENDERED: Record<keyof typeof SAYS, string> = {
  privacyDe: PRIVACY_DE,
  privacyEn: PRIVACY_EN,
  trust: TRUST_EN,
  c14De: consentText(CONSENT_TEXTS.autoStepsNotice.lead, 'de'),
  c14En: consentText(CONSENT_TEXTS.autoStepsNotice.lead, 'en'),
};

test('the texts and the build read the same answer: names asked ⇔ texts say they run by themselves', () => {
  expect(LEGAL_TEXTS_NAMES_AUTOMATIC, 'the legal texts and the naming build disagree on whether names start by themselves').toBe(NAMING_ASKED_IN_THIS_BUILD);
  // The pause itself stays for every context without the engine's facts.
  expect(NAMING_WITHOUT_FACTS_PAUSED).toBe(true);
  expect(automaticStagesInThisBuild().includes('naming')).toBe(NAMING_ASKED_IN_THIS_BUILD);
});

for (const key of Object.keys(SAYS) as Array<keyof typeof SAYS>) {
  test(`${key}: says exactly what this build does`, () => {
    const text = RENDERED[key];
    expect(text.includes(SAYS[key].automatic), `${key} names business names as automatic`).toBe(NAMING_ASKED_IN_THIS_BUILD);
    expect(text.includes(SAYS[key].paused), `${key} says business names are paused`).toBe(!NAMING_ASKED_IN_THIS_BUILD);
  });
}

test('both wordings stand in the sources, so the build that does not render one still carries it', () => {
  const sources = [
    read('lib/legal/texts/privacy.de.ts'),
    read('lib/legal/texts/privacy.en.ts'),
    read('lib/legal/texts/trust.en.ts'),
    read('lib/legal/consent-texts.ts'),
  ].join('\n');
  for (const key of Object.keys(SAYS) as Array<keyof typeof SAYS>) {
    expect(sources, `${key}: automatic wording`).toContain(SAYS[key].automatic);
    expect(sources, `${key}: paused wording`).toContain(SAYS[key].paused);
  }
  // Each switching text goes through the one rule, not a version check of its own.
  for (const rel of ['lib/legal/texts/privacy.de.ts', 'lib/legal/texts/privacy.en.ts', 'lib/legal/texts/trust.en.ts', 'lib/legal/consent-texts.ts']) {
    const src = read(rel);
    expect(src, rel).toContain("import { namesWording } from '");
    expect(src, rel).not.toMatch(/APP_VERSION|engineReads310Apply/);
  }
  expect(namesWording('a', 'p')).toBe(LEGAL_TEXTS_NAMES_AUTOMATIC ? 'a' : 'p');
});

test('the switch changes nothing else: the paragraph around it is the same in both builds', () => {
  // Privacy section 3 keeps the sentences around the switched passage in both builds.
  expect(PRIVACY_DE).toContain('Die meisten davon starten Sie selbst. ');
  expect(PRIVACY_DE).toContain(' Bevor Sie zum ersten Mal eigenen Code hochladen, weisen wir Sie einmal darauf hin');
  expect(PRIVACY_EN).toContain('You start most of them yourself. ');
  expect(PRIVACY_EN).toContain(' Before you upload code of your own for the first time, we point this out once');
  expect(TRUST_EN).toContain('{{autoStepsSwitch}}. Switching the model stages off in the settings stops all of them.');
});
