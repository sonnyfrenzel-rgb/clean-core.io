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
import { privacyDeFor } from '../lib/legal/texts/privacy.de';
import { privacyEnFor } from '../lib/legal/texts/privacy.en';
import { TERMS_DE } from '../lib/legal/texts/terms.de';
import { TERMS_EN } from '../lib/legal/texts/terms.en';
import { blockText, legalBlocks, toArchiveMarkdown } from '../lib/legal/markup';
import {
  PRIVACY_ARCHIVE_DIR,
  PRIVACY_POLICY_CURRENT,
  PRIVACY_POLICY_VERSIONS,
  privacyVersionAddress,
  privacyVersionFor,
  privacyVersionPath,
  publishedPrivacyVersions,
} from '../lib/legal/privacy-versions';
import { PENDING_TERMS_CHANGES } from '../lib/legal/terms-next-version';
import {
  AUTO_STEPS_NOTICE_PENDING_CODE,
  AUTO_STEPS_NOTICE_WORDING,
  AUTO_STEPS_NOTICE_WORDING_FIELD,
  automaticNamingAwaitsNotice,
  autoStepsNoticePendingMessage,
  autoStepsNoticeSeenBody,
  autoStepsNoticeWanted,
  autoStepsSwitchBody,
  confirmedNoticeWordingOf,
  namesWaitForNotice,
  noticeWordingFor,
} from '../lib/auto-steps-notice';
import { modelStagesOf } from '../lib/model-stages';
import { PROVIDER_LABEL } from '../lib/model-providers';
import { recordConsent } from '../lib/consent';
import { aiLaneMark, aiMarkTooltip, aiNameMark, aiNamesLegend, aiOriginWords, namesWaitForNoticeNote } from '../lib/messages/ai-names';
import { UI_LANGUAGE } from '../lib/messages/model-consent';
import { createHash } from 'crypto';

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

/* --------------------------------------------------------------------------------------------------------------------
 * The statement on document 19 ("19c", 13.11.2026): the conditions for releasing 3.1.0. Each text is checked for the
 * build that asks for names and for the build before it, whichever this one is, so both directions hold on every
 * build. The approved state is commit ac829ec8; this spec runs again against the release commit (docs/OPERATIONS.md).
 * ------------------------------------------------------------------------------------------------------------------ */

const B1 = {
  de: 'Die fachlichen Namen bildet die Plattform zuerst ohne Modell aus den Fakten des Codes. Danach schlägt ein Modell aus diesen Fakten Namen vor; dafür erhält es je Schritt dessen Art, die Bezeichnung aus dem Code, die Bedingungen der Verzweigungen und die Fakten, darunter wörtliche Kommentare und Meldungstexte des Programms, nicht aber den vollständigen Quellcode. Ein vorgeschlagener Name ersetzt den ersten nur, wenn seine fachlichen Begriffe in diesen Fakten stehen und er die Aussage des Schritts nicht verändert.',
  en: "The Platform first builds the business names from the code's facts without a model. A model then proposes names from those facts; for this it receives, for each step, its kind, its name in the code, the conditions of its branches and the facts, including verbatim comments and message texts of the program, but not the complete source code. A proposed name replaces the first one only if its business terms appear in those facts and it does not change what the step says.",
} as const;

const CHANGE_NOTE = {
  de: 'Geändert am 20.11.2026: Fachliche Namen der Prozessschritte schlägt wieder automatisch ein Modell vor (Abschnitt 3). Die vorige Fassung vom 09.11.2026 finden Sie unter clean-core.io/datenschutz/versions/1.1/de.',
  en: 'Changed on 20 November 2026: business names of the process steps are again proposed automatically by a model (section 3). The previous version of 9 November 2026 is at clean-core.io/datenschutz/versions/1.1.',
} as const;

const privacyFor = (lang: 'de' | 'en', namesAutomatic: boolean) => (lang === 'de' ? privacyDeFor(namesAutomatic) : privacyEnFor(namesAutomatic));
const renderedPolicy = (lang: 'de' | 'en', namesAutomatic: boolean) =>
  legalBlocks(privacyFor(lang, namesAutomatic), lang).map(blockText).join('\n');

test.describe('B1: privacy section 3 names what the naming model receives', () => {
  for (const lang of ['de', 'en'] as const) {
    test(`${lang}: the lawyer's middle sentence where names start by themselves, the pause before`, () => {
      expect(renderedPolicy(lang, true)).toContain(B1[lang]);
      expect(renderedPolicy(lang, false)).not.toContain(B1[lang]);
      expect(renderedPolicy(lang, false)).toContain(lang === 'de' ? SAYS.privacyDe.paused : SAYS.privacyEn.paused);
      // No judgement the platform cannot prove: the model proposes names, not better ones.
      expect(privacyFor(lang, true)).not.toMatch(lang === 'de' ? /bessere Namen/ : /better names/);
      // The build renders its own side.
      expect(lang === 'de' ? PRIVACY_DE : PRIVACY_EN).toBe(privacyFor(lang, LEGAL_TEXTS_NAMES_AUTOMATIC));
    });
  }
});

test.describe('B2: the business names wait for the notice in the wording that names them', () => {
  const ALL_ON = modelStagesOf(null);
  const base = { known: true, keyAvailable: true, autoSteps: true, stages: ALL_ON, mainSwitch: true };

  test('the wording ids: C14-2 in the build that asks for names, C14-1 before; a bare timestamp is C14-1', () => {
    expect(noticeWordingFor(true)).toBe('C14-2');
    expect(noticeWordingFor(false)).toBe('C14-1');
    expect(AUTO_STEPS_NOTICE_WORDING).toBe(noticeWordingFor(LEGAL_TEXTS_NAMES_AUTOMATIC));
    expect(confirmedNoticeWordingOf(null)).toBeNull();
    expect(confirmedNoticeWordingOf({})).toBeNull();
    expect(confirmedNoticeWordingOf({ autoStepsNoticeAt: { seconds: 1 } }), 'confirmed before the id was recorded').toBe('C14-1');
    expect(confirmedNoticeWordingOf({ autoStepsNoticeAt: { seconds: 1 }, autoStepsNoticeWording: 'C14-2' })).toBe('C14-2');
    expect(confirmedNoticeWordingOf({ autoStepsNoticeAt: { seconds: 1 }, autoStepsNoticeWording: 'forged' })).toBe('C14-1');
    // A wording id without the timestamp is no confirmation.
    expect(confirmedNoticeWordingOf({ autoStepsNoticeWording: 'C14-2' })).toBeNull();
  });

  test('an automatic naming call waits until the new wording is confirmed, and only in the build that names it', () => {
    expect(automaticNamingAwaitsNotice(null, true)).toBe(true);
    expect(automaticNamingAwaitsNotice('C14-1', true), 'confirmed "one step" only').toBe(true);
    expect(automaticNamingAwaitsNotice('C14-2', true)).toBe(false);
    for (const w of [null, 'C14-1', 'C14-2'] as const) expect(automaticNamingAwaitsNotice(w, false), 'nothing waits before 3.1.0').toBe(false);
  });

  test('shown once more only to accounts that confirmed the old wording and left the main switch on', () => {
    const old = { ...base, seen: true, wording: 'C14-1' as const };
    expect(autoStepsNoticeWanted(old, true), 'old wording, main switch on: shown again').toBe(true);
    expect(autoStepsNoticeWanted({ ...old, wording: null }, true), 'a bare timestamp is the old wording').toBe(true);
    expect(autoStepsNoticeWanted({ ...old, mainSwitch: false, autoSteps: false }, true), 'main switch off: unaffected').toBe(false);
    expect(autoStepsNoticeWanted({ ...old, mainSwitch: false }, true), 'main switch off, whatever else says').toBe(false);
    expect(autoStepsNoticeWanted({ ...old, stages: { ...ALL_ON, naming: false } }, true), 'names switched off: nothing new runs').toBe(false);
    expect(autoStepsNoticeWanted({ ...old, autoSteps: false }, true), 'own key with automatic steps off: nothing runs by itself').toBe(false);
    expect(autoStepsNoticeWanted({ ...old, reader: true }, true), 'never an invited reader').toBe(false);
    expect(autoStepsNoticeWanted({ ...old, wording: 'C14-2' }, true), 'confirmed the new wording: not again').toBe(false);
    expect(autoStepsNoticeWanted(old, false), 'before 3.1.0 nothing comes back').toBe(false);
    // Never seen: shown as before, in whatever wording the build has, which from 3.1.0 is the new one.
    expect(autoStepsNoticeWanted({ ...base, seen: false }, true)).toBe(true);
    expect(autoStepsNoticeWanted({ ...base, seen: false }, false)).toBe(true);
    // The names wait for exactly the accounts the notice comes back to (or meets for the first time).
    expect(namesWaitForNotice(old, true)).toBe(true);
    expect(namesWaitForNotice({ ...old, mainSwitch: false }, true)).toBe(false);
    expect(namesWaitForNotice({ ...old, wording: 'C14-2' }, true)).toBe(false);
    expect(namesWaitForNotice(old, false)).toBe(false);
  });

  test('the notice records the wording it showed; the route writes it through the Admin SDK only', () => {
    expect(autoStepsNoticeSeenBody()).toEqual({ autoStepsNotice: 'seen', autoStepsNoticeWording: AUTO_STEPS_NOTICE_WORDING });
    expect(autoStepsSwitchBody(true).autoStepsNoticeWording).toBe(AUTO_STEPS_NOTICE_WORDING);
    const notice = read('components/AutoStepsNotice.tsx');
    expect(notice).toContain('await post(autoStepsNoticeSeenBody());');
    expect(notice).toContain('wording: model.autoStepsNoticeWording,');
    expect(notice).toContain('mainSwitch: model.autoModelSteps,');
    const route = read('app/api/model-stages/route.ts');
    expect(route).toContain('if (wordingConfirmed) only[AUTO_STEPS_NOTICE_WORDING_FIELD] = AUTO_STEPS_NOTICE_WORDING;');
    expect(route).toContain('if (wordingConfirmed) fields[AUTO_STEPS_NOTICE_WORDING_FIELD] = AUTO_STEPS_NOTICE_WORDING;');
    // Another wording than the build's is refused, so a page from before a release cannot confirm words it did not show.
    expect(route).toContain('shownWording !== undefined && (!noticeSeen || shownWording !== AUTO_STEPS_NOTICE_WORDING)');
    expect(route).toMatch(/code: 'notice-wording-outdated' \},\n\s+\{ status: 409 \}/);
    expect(route).toContain('const autoStepsNoticeWording = confirmedNoticeWordingOf(profile);');
    expect(AUTO_STEPS_NOTICE_WORDING_FIELD).toBe('autoStepsNoticeWording');
    // No field a browser writes: firestore.rules does not change.
    expect(read('firestore.rules')).not.toContain(AUTO_STEPS_NOTICE_WORDING_FIELD);
  });

  test('/api/gemini refuses an automatic naming call without the confirmation, before any key is loaded', () => {
    const route = read('app/api/gemini/route.ts');
    const check = route.indexOf('&& automaticNamingAwaitsNotice(');
    expect(check, 'the route holds the automatic naming call for the notice').toBeGreaterThan(0);
    expect(route.slice(route.lastIndexOf('if (', check), check)).toMatch(/automatic\n\s+&& stage === NAMING_STAGE\n\s+$/);
    expect(route).toContain(
      'confirmedNoticeWordingOf(profile.exists ? (profile.data() as { autoStepsNoticeAt?: unknown; autoStepsNoticeWording?: unknown }) : null)',
    );
    expect(route).toContain(
      'return NextResponse.json({ error: autoStepsNoticePendingMessage(), code: AUTO_STEPS_NOTICE_PENDING_CODE }, { status: 403 });',
    );
    expect(check, 'refused before any key is loaded').toBeLessThan(route.indexOf('ownKey = await loadOwnModelKey('));
    expect(check, 'and before the stand-in or the provider').toBeLessThan(route.indexOf('const stubbed = geminiTestStubActive('));
    expect(AUTO_STEPS_NOTICE_PENDING_CODE).toBe('auto-steps-notice-pending');
    expect(autoStepsNoticePendingMessage()).toContain('Nothing was sent');
  });

  test('the page asks nothing by itself and offers no click while the names wait, and says so above the map', () => {
    const page = read('components/workspace/WorkspaceProcess.tsx');
    expect(page).toMatch(/const noticePending = !!owner && namesWaitForNotice\(\{/);
    expect(page).toContain('awaitNotice: noticePending,');
    expect(page).toContain('{naming.waitsForNotice ? (');
    expect(page).toContain('<AutoStepsNotice model={availability} reader={!owner} />');
    expect(page).toContain('{namesWaitForNoticeNote()}');
    const hook = read('hooks/useAutoProcessNaming.ts');
    // Waiting for the notice: no mode at all, so neither the automatic ask nor the click.
    expect(hook).toContain('const mode = projectId && digest && !awaitNotice ? askModeOf({ wanted, autoAllowed }) : null;');
    expect(hook).toContain('waitsForNotice: awaitNotice && wanted && !!projectId && !!digest,');
    expect(namesWaitForNoticeNote('en')).toBe(
      'The steps keep the names the engine read from the code. AI-generated names start only once you have confirmed the notice above.',
    );
    expect(namesWaitForNoticeNote('de')).toBe(
      'Die Schritte tragen die Namen, die die Engine aus dem Code gelesen hat. KI-generierte Namen starten erst, wenn Sie den Hinweis oben bestätigt haben.',
    );
  });
});

test.describe('B3: the privacy policy has its own version, an archive and a change note', () => {
  test('version 1.2 of 20 November 2026 with the change note; version 1.1 as published', () => {
    expect(renderedPolicy('en', true)).toContain('Version 1.2, as of 20 November 2026.');
    expect(renderedPolicy('de', true)).toContain('Fassung 1.2, Stand 20.11.2026.');
    for (const lang of ['de', 'en'] as const) {
      expect(renderedPolicy(lang, true)).toContain(CHANGE_NOTE[lang]);
      expect(renderedPolicy(lang, false)).not.toContain(CHANGE_NOTE[lang]);
      // The note stands at the top: right after the version line.
      const blocks = legalBlocks(privacyFor(lang, true), lang).map(blockText);
      expect(blocks[2]).toBe(CHANGE_NOTE[lang]);
    }
    expect(renderedPolicy('en', false)).toContain('Version of 9 November 2026.');
    expect(renderedPolicy('de', false)).toContain('Stand: 9. November 2026.');
    expect(PRIVACY_POLICY_CURRENT.id).toBe(LEGAL_TEXTS_NAMES_AUTOMATIC ? '1.2' : '1.1');
    expect(privacyVersionFor(true).date).toEqual({ en: '20 November 2026', de: '20.11.2026' });
    expect(privacyVersionFor(false).dateIso).toBe('2026-11-09');
  });

  test('every version is archived: the file is the source rendered for it, and its digest is the one on record', () => {
    for (const v of PRIVACY_POLICY_VERSIONS) {
      for (const lang of ['de', 'en'] as const) {
        const file = read(v.files[lang]);
        expect(file, `${v.files[lang]} is not the source rendered for ${v.id}: scripts/legal/archive-privacy.ts (before publication only)`).toBe(
          toArchiveMarkdown(legalBlocks(privacyFor(lang, v.namesAutomatic), lang)),
        );
        expect(createHash('sha256').update(file, 'utf8').digest('hex'), `${v.files[lang]} digest`).toBe(v.sha256[lang]);
      }
    }
    const onDisk = fs.readdirSync(path.join(ROOT, PRIVACY_ARCHIVE_DIR)).map((n) => `${PRIVACY_ARCHIVE_DIR}/${n}`).sort();
    expect(onDisk).toEqual(PRIVACY_POLICY_VERSIONS.flatMap((v) => [v.files.en, v.files.de]).sort());
  });

  test('each version has its fixed address, and only a version in force or before it is public', () => {
    for (const v of PRIVACY_POLICY_VERSIONS) {
      expect(privacyVersionPath(v.id, 'en')).toBe(`/datenschutz/versions/${v.id}`);
      expect(privacyVersionPath(v.id, 'de')).toBe(`/datenschutz/versions/${v.id}/de`);
      for (const lang of ['de', 'en'] as const) {
        const page = read(`app${privacyVersionPath(v.id, lang)}/page.tsx`);
        expect(page).toContain(`<ArchivedPrivacyPage id="${v.id}" lang="${lang}" />`);
        expect(page).toContain("export const dynamic = 'force-static';");
      }
    }
    expect(publishedPrivacyVersions(privacyVersionFor(false)).map((v) => v.id)).toEqual(['1.1']);
    expect(publishedPrivacyVersions(privacyVersionFor(true)).map((v) => v.id)).toEqual(['1.1', '1.2']);
    const archive = read('components/legal/ArchivedPrivacyPage.tsx');
    expect(archive).toContain('if (!publishedPrivacyVersions().some((v) => v.id === id)) notFound();');
    expect(archive).toContain('robots: { index: false, follow: true }');
    // The change note names the real address of the previous version.
    expect(CHANGE_NOTE.en).toContain(`${privacyVersionAddress('1.1', 'en')}.`);
    expect(CHANGE_NOTE.de).toContain(`${privacyVersionAddress('1.1', 'de')}.`);
  });

  test('the sign-up box names the policy version, not the date of the Terms', () => {
    const src = read('lib/legal/consent-texts.ts');
    const v = privacyVersionFor(true);
    const de = `Ich habe die Datenschutzerklärung (Fassung ${v.id}, Stand ${v.date.de}, Wortlaut: ${privacyVersionAddress(v.id, 'de')}) zur Kenntnis genommen.`;
    const en = `I have taken note of the Privacy Policy (version ${v.id}, as of ${v.date.en}, wording: ${privacyVersionAddress(v.id, 'en')}).`;
    expect(src).toContain(de);
    expect(src).toContain(en);
    expect(consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'de') === de, 'the German box names version 1.2 exactly in the build that has it').toBe(
      LEGAL_TEXTS_NAMES_AUTOMATIC,
    );
    expect(consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'en') === en, 'the English box names version 1.2 exactly in the build that has it').toBe(
      LEGAL_TEXTS_NAMES_AUTOMATIC,
    );
  });

  test('the consent record stores the policy version of the build, derived on the server', async () => {
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    let n = 0;
    const deps = {
      db: {
        collection: (name: string) => ({ doc: (id?: string) => ({ path: `${name}/${id ?? `auto${++n}`}` }) }),
        batch: () => {
          const staged: typeof writes = [];
          return {
            create: (ref: unknown, data: Record<string, unknown>) => staged.push({ path: (ref as { path: string }).path, data }),
            update: (ref: unknown, data: Record<string, unknown>) => staged.push({ path: (ref as { path: string }).path, data }),
            commit: async () => {
              writes.push(...staged);
            },
          };
        },
      },
      FieldValue: { serverTimestamp: () => 'SERVER_TIME' },
    };
    await recordConsent({ uid: 'u-privacy', email: null, source: 'spec', now: new Date('2026-11-21T10:00:00Z') }, deps);
    const event = writes.find((w) => w.path.startsWith('consent_events/'));
    expect(event?.data.privacyVersion).toBe(PRIVACY_POLICY_CURRENT.recordId);
    expect(privacyVersionFor(true).recordId).toBe('1.2');
    expect(privacyVersionFor(false).recordId, 'version 1.1 keeps the id it was recorded with').toBe('2026-11-09');
  });
});

test.describe("B5: the AI mark and legend in the interface language, with the receipt's model", () => {
  const origin = { provider: 'google-gemini', modelId: 'gemini-receipt-model' };

  test("mark and legend in the lawyer's wording, per interface language", () => {
    expect(aiNameMark('de')).toBe('KI-generierter Name');
    expect(aiNameMark('en')).toBe('AI-generated name');
    expect(aiNamesLegend('de')).toBe('Namen: KI-generiert aus den Fakten des Codes; Begriffe mit diesen Fakten abgeglichen, nicht fachlich geprüft.');
    expect(aiNamesLegend('en')).toBe("Names: AI-generated from the code's facts; terms matched against those facts, not reviewed.");
    // The interface language of the build decides what the map shows.
    expect(aiNameMark()).toBe(aiNameMark(UI_LANGUAGE));
    expect(aiNamesLegend()).toBe(aiNamesLegend(UI_LANGUAGE));
    // The claim the check cannot carry is gone from the catalogue.
    expect(read('lib/messages/process-map.ts')).not.toContain('checked against them');
  });

  test('the tooltip names provider and model from the receipt, never a model written in the code', () => {
    expect(aiMarkTooltip(aiNameMark('en'), origin)).toBe('AI-generated name · Google Gemini gemini-receipt-model');
    expect(aiMarkTooltip(aiNameMark('de'), { provider: 'anthropic', modelId: 'claude-receipt-model' })).toBe(
      `KI-generierter Name · ${PROVIDER_LABEL.anthropic} claude-receipt-model`,
    );
    expect(aiMarkTooltip(aiNameMark('en'), null), 'nothing recorded: the mark alone, no guess').toBe('AI-generated name');
    expect(read('components/process-map/ProcessMap.tsx')).toContain('penTitle: aiMarkTooltip(aiNameMark(), model.naming.origin),');
    expect(read('components/process-map/naming-swap.ts')).toContain('const pen = penMark(names!.penTitle);');
    expect(read('components/process-map/NamingStatusLine.tsx')).toContain('{aiNamesLegend()}');
    expect(read('lib/messages/ai-names.ts')).not.toMatch(/gemini-[0-9]|claude-[a-z]+-[0-9]|GEMINI_MODEL|NAMING_GEMINI_MODEL/);
  });

  test('role lanes are marked the same way, and their exports carry provider and model', () => {
    expect(aiLaneMark('de')).toBe('KI-generierte Rollen-Bahn');
    expect(aiLaneMark('en')).toBe('AI-generated role lane');
    expect(aiMarkTooltip(aiLaneMark('en'), origin)).toBe('AI-generated role lane · Google Gemini gemini-receipt-model');
    const map = read('components/process-map/ProcessMap.tsx');
    expect(map).toContain('title={aiMarkTooltip(aiLaneMark(), model.naming.origin)}');
    expect(map).toContain('{aiLaneMark()}');
    expect(read('lib/process-document-build.ts')).toContain('— AI-generated (${aiModelWords(engine.naming.origin ?? UNRECORDED_AI)}).');
    // The Markdown export marks every proposed lane with the naming's model (`named`, lib/process-documentation.ts).
    expect(read('lib/process-documentation.ts')).toContain("out.push(`- ${named(lane.name)}${lane.authorityObject ? ` (${lane.authorityObject})` : ''} — ${evidence}`);");
    expect(aiOriginWords(origin)).toBe('Google Gemini gemini-receipt-model');
  });
});

test('B6: the Terms do not change now; the future half-sentence of 4.1 (b) waits for their next version', () => {
  const change = PENDING_TERMS_CHANGES.find((c) => c.section === '4.1 (b)');
  expect(change?.wording).toEqual({
    de: '… soweit Sie diese Funktionen nutzen oder sie nach Ziffer 5.4 von selbst starten; …',
    en: '… where you use those functions or they start by themselves under section 5.4; …',
  });
  expect(TERMS_DE).not.toContain('oder sie nach Ziffer 5.4 von selbst starten');
  expect(TERMS_EN).not.toContain('or they start by themselves under section 5.4');
});

test('the legal record names the approved commit and the rerun of this spec before the release', () => {
  const ops = read('docs/OPERATIONS.md');
  expect(ops).toContain('## Legal record: business names start by themselves again (document 19, release 3.1.0)');
  expect(ops).toContain('commit `ac829ec8`');
  expect(ops).toContain('run `npx playwright test tests/legal-names-wording.spec.ts` against the release commit');
});
