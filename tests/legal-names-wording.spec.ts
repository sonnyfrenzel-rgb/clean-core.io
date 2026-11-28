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
  PRIVACY_14_DATE_ISO,
  PRIVACY_15_DATE_ISO,
  PRIVACY_16_DATE_ISO,
  PRIVACY_ARCHIVE_DIR,
  PRIVACY_POLICY_CURRENT,
  PRIVACY_POLICY_VERSIONS,
  privacyDateOf,
  privacyVersion,
  privacyVersionAddress,
  privacyVersionFor,
  type PrivacyVersionId,
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
  de: 'Geändert am 15.11.2026: Fachliche Namen der Prozessschritte schlägt wieder automatisch ein Modell vor (Abschnitt 3). Die vorige Fassung vom 09.11.2026 finden Sie unter clean-core.io/datenschutz/versions/1.1/de.',
  en: 'Changed on 15 November 2026: business names of the process steps are again proposed automatically by a model (section 3). The previous version of 9 November 2026 is at clean-core.io/datenschutz/versions/1.1.',
} as const;

/** Version 1.3 (16 November 2026): the approved passages of document 21 (legal review, approved unchanged 15.11.2026). */
const CHANGE_NOTE_13 = {
  de: 'Geändert am 16.11.2026: Abschnitt 9 beschreibt den wöchentlichen Bericht mit Zahlen zur Nutzung; die Abschnitte 2, 5, 6 und 7 verweisen darauf, und Abschnitt 7 nennt weitere Einträge der lokalen und der Sitzungsspeicherung. Die vorige Fassung vom 15.11.2026 finden Sie unter clean-core.io/datenschutz/versions/1.2/de.',
  en: 'Changed on 16 November 2026: section 9 describes the weekly report with usage figures; sections 2, 5, 6 and 7 refer to it, and section 7 names further entries in local and session storage. The previous version of 15 November 2026 is at clean-core.io/datenschutz/versions/1.2.',
} as const;

/** Passages 2.2–2.9 of document 21 as the rendered text reads them (bold markers gone). */
const DOC21 = {
  de: [
    'die standardmäßig nicht erteilt ist. Außerdem bilden wir aus Kontodaten Summen zur Nutzung, die ohne Kennung gespeichert werden (Abschnitt 9).',
    'die Sperrlisten, das Sicherheits-Protokoll, das Zählen für die Zahlen zur Nutzung (Abschnitt 9), die von Ihnen versandten Einladungen,',
    'der Löschvermerk, die Sperrlisten, die Zahlen zur Nutzung (Abschnitt 9) und personenbezogene Daten anderer Personen in hochgeladenem Code (Abschnitt 3) als berechtigtes Interesse (Art. 6 Abs. 1 lit. f)',
    'Zahlen zur Nutzung (Abschnitt 9): nur Summen ohne Kennung; 24 Monate, danach gelöscht.',
    'je Projekt, ob Sie die Führung durch die Analyse zu Ende gesehen oder ihren Hinweis weggeklickt haben, damit er nicht erneut erscheint (cc.analyze.walked.…), ob Sie die Karte „What you can do next“ ausgeblendet haben, damit sie ausgeblendet bleibt (cc.analyze.nextHidden.…), und ob Sie nach der Analyse schon ein Werkzeug geöffnet haben, damit die Hinweise zum nächsten Schritt dazu passen (cc.analyze.toolOpened.…);',
    '(cc:rules-draft:…), dass Sie im Design eines Projekts die Fragen übersprungen haben (cc:design-skip-questions:…),',
    'ob die Gliederung der Prozesskarte offen ist (cc.processMap.outline; auf der Analyse in der Business-Sicht getrennt davon: cc.processMap.outline.page),',
    'dass in diesem Browser ein Konto angemeldet ist, damit öffentliche Seiten die Anmeldung von Google nur dann laden (cc.auth.signedIn; der Eintrag enthält nichts über Ihr Konto und wird bei der Abmeldung gelöscht),',
    '9. Serverprotokolle und Zahlen zur Nutzung',
    'Zahlen zur Nutzung: Um zu sehen, ob die Plattform die Menschen erreicht, für die sie gebaut ist, und wo sie vor der ersten eigenen Analyse aufhören, bildet unser Server einmal in der Woche Summen aus Daten, die er für den Betrieb ohnehin hat: wie viele Konten angelegt wurden und aktiv waren, wie viele Konten ihren ersten signierten Lauf erhalten haben, wie viele Projekte und Läufe es gab, wie viele Kontingenteinheiten verbraucht wurden, wie viele Konten ihr Limit erreicht haben und wie viele unserer E-Mails zugestellt wurden und wie viele je Art nicht ankamen. Testkonten nehmen wir aus; dazu liest der Server die E-Mail-Adressen nur während des Zählens. Gespeichert und dem Betreiber per E-Mail geschickt werden nur die Summen, ohne Kontokennung, Projektkennung, E-Mail-Adresse, IP-Adresse oder Hashwert. Für das Zählen setzen wir kein Cookie, speichern nichts in Ihrem Browser, lesen nichts daraus und zählen keine Klicks. Wir führen die Summen mit keinen anderen Daten zusammen und löschen sie nach 24 Monaten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Sie können widersprechen (Abschnitt 5); dann zählen wir Ihr Konto von da an nicht mehr mit.',
  ],
  en: [
    'which is not given by default. We also form usage totals from account data, which are stored without any identifier (section 9).',
    'the suppression lists, the security audit record, the counting for the usage figures (section 9), the invitations you send,',
    'the deletion note, the suppression lists, the usage figures (section 9) and personal data of other people that is in uploaded code (section 3), under our legitimate interest (Art. 6(1)(f))',
    'Usage figures (section 9): totals only, without any identifier; 24 months, then deleted.',
    'per project, whether you finished the walk-through of the analysis or dismissed its hint, so that it does not appear again (cc.analyze.walked.…), whether you hid the “What you can do next” card, so that it stays hidden (cc.analyze.nextHidden.…), and whether you have already opened a tool after the analysis, so that the hints on the next step fit (cc.analyze.toolOpened.…);',
    "(cc:rules-draft:…), that you skipped the questions in a project's Design (cc:design-skip-questions:…),",
    'whether the outline of the process map is open (cc.processMap.outline; on the analysis in the Business view kept separately: cc.processMap.outline.page),',
    "that an account is signed in in this browser, so that public pages load Google's sign-in only then (cc.auth.signedIn; the entry holds nothing about your account and is removed when you sign out),",
    '9. Server Logs & Usage Figures',
    'Usage figures: to see whether the platform reaches the people it is built for, and where they stop before their first own analysis, our server forms totals once a week from records it already keeps to run the service: how many accounts were created and were active, how many accounts received their first signed run, how many projects and runs there were, how many quota units were used, how many accounts reached their limit, and how many of our emails were delivered and how many of each kind did not arrive. We leave out test accounts; for this the server reads email addresses only while counting. Only the totals are stored and emailed to the operator, without account ID, project ID, email address, IP address or hash. For this counting we set no cookie, store nothing in your browser, read nothing from it and count no clicks. We combine the totals with no other data and delete them after 24 months. The legal basis is Art. 6(1)(f) GDPR. You can object (section 5); we then no longer count your account from that point on.',
  ],
} as const;

/**
 * Version 1.4: the passages of statement 20c, word for word — the two My workspace entries of section 7 (document 20,
 * 2.1/2.2, approved in E1), the sentence on the view (E2) and the sentence on the project summary in section 3 (E3,
 * with the title line, since the summary carries `processTitle`).
 */
const STATEMENT_20C = {
  de: [
    'welche Analysen Sie gelesen haben (cc.workspace.analysis.read), durch welche Sicht – Business, IT oder Management – Sie „My workspace“ lesen (cc.workspace.lens) und ob Sie Ihre Programme dort als Kacheln oder als Liste sehen (cc.workspace.mode); ob die Gliederung der Prozesskarte offen ist',
    'Die Sicht in „My workspace“ bestimmt nur, welche Angabe auf den Kacheln hervorgehoben wird; sie sagt nichts über Ihre Rolle aus und wird nirgends sonst gespeichert.',
    'Für die Übersicht „My workspace“ legt unser Server zu jedem Projekt eine Kurzfassung des letzten signierten Laufs ab: Zahlen, Score und Empfehlung, den Umriss der Prozesskarte ohne Beschriftung und die Titelzeile aus dem Kopfkommentar Ihres Codes; ein Modell wirkt daran nicht mit. Sie wird mit jedem neuen Lauf ersetzt und mit dem Projekt gelöscht.',
  ],
  en: [
    'which analyses you have read (cc.workspace.analysis.read), which view — Business, IT or Management — you read My workspace through (cc.workspace.lens) and whether you see your programs there as tiles or as a list (cc.workspace.mode); whether the outline of the process map is open',
    'The view in My workspace only decides which figure the tiles highlight; it says nothing about your role and is stored nowhere else.',
    "For the My workspace overview our server keeps a short summary of the last signed run of every project: figures, score and recommendation, the outline of the process map without labels and the title line of your code's header comment; no model is involved. It is replaced with every new run and deleted with the project.",
  ],
} as const;

/**
 * The change note of 1.4: document 20, passage 2.4, adapted to what 1.4 changes (no session storage entry; the
 * section 3 sentence of statement 20c E3). Approved by the owner on 22.11.2026.
 */
const DOC20_HEAD = {
  de: 'Abschnitt 7 nennt die Sicht und die Darstellung von „My workspace“; Abschnitt 3 nennt die Kurzfassung, die unser Server für diese Übersicht zu jedem Projekt ablegt.',
  en: 'section 7 names the view and the layout of My workspace; section 3 names the short summary our server keeps of every project for this overview.',
} as const;

const privacyFor = (lang: 'de' | 'en', id: PrivacyVersionId) => (lang === 'de' ? privacyDeFor(id) : privacyEnFor(id));
const renderedPolicy = (lang: 'de' | 'en', id: PrivacyVersionId) => legalBlocks(privacyFor(lang, id), lang).map(blockText).join('\n');

test.describe('B1: privacy section 3 names what the naming model receives', () => {
  for (const lang of ['de', 'en'] as const) {
    test(`${lang}: the lawyer's middle sentence where names start by themselves, the pause before`, () => {
      for (const id of ['1.2', '1.3'] as const) expect(renderedPolicy(lang, id)).toContain(B1[lang]);
      expect(renderedPolicy(lang, '1.1')).not.toContain(B1[lang]);
      expect(renderedPolicy(lang, '1.1')).toContain(lang === 'de' ? SAYS.privacyDe.paused : SAYS.privacyEn.paused);
      // No judgement the platform cannot prove: the model proposes names, not better ones.
      expect(privacyFor(lang, '1.3')).not.toMatch(lang === 'de' ? /bessere Namen/ : /better names/);
      // The build renders its own side.
      expect(lang === 'de' ? PRIVACY_DE : PRIVACY_EN).toBe(privacyFor(lang, privacyVersionFor(LEGAL_TEXTS_NAMES_AUTOMATIC).id));
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
  test('version 1.2 of 15 November 2026 with the change note; version 1.1 as published', () => {
    expect(renderedPolicy('en', '1.2')).toContain('Version 1.2, as of 15 November 2026.');
    expect(renderedPolicy('de', '1.2')).toContain('Fassung 1.2, Stand 15.11.2026.');
    for (const lang of ['de', 'en'] as const) {
      expect(renderedPolicy(lang, '1.2')).toContain(CHANGE_NOTE[lang]);
      expect(renderedPolicy(lang, '1.1')).not.toContain(CHANGE_NOTE[lang]);
      // The note stands at the top: right after the version line.
      const blocks = legalBlocks(privacyFor(lang, '1.2'), lang).map(blockText);
      expect(blocks[2]).toBe(CHANGE_NOTE[lang]);
    }
    expect(renderedPolicy('en', '1.1')).toContain('Version of 9 November 2026.');
    expect(renderedPolicy('de', '1.1')).toContain('Stand: 9. November 2026.');
    expect(privacyVersion('1.2').date).toEqual({ en: '15 November 2026', de: '15.11.2026' });
    expect(privacyVersionFor(false).dateIso).toBe('2026-11-09');
  });

  test('version 1.3 of 16 November 2026: the approved passages of document 21, and none of them before it', () => {
    expect(privacyVersion('1.3').date).toEqual({ en: '16 November 2026', de: '16.11.2026' });
    expect(privacyVersion('1.3').dateIso).toBe('2026-11-16');
    expect(renderedPolicy('en', '1.3')).toContain('Version 1.3, as of 16 November 2026.');
    expect(renderedPolicy('de', '1.3')).toContain('Fassung 1.3, Stand 16.11.2026.');
    for (const lang of ['de', 'en'] as const) {
      const blocks = legalBlocks(privacyFor(lang, '1.3'), lang).map(blockText);
      expect(blocks[2], 'the change note stands right after the version line').toBe(CHANGE_NOTE_13[lang]);
      expect(renderedPolicy(lang, '1.3')).not.toContain(CHANGE_NOTE[lang]);
      for (const passage of DOC21[lang]) {
        expect(renderedPolicy(lang, '1.3'), passage.slice(0, 60)).toContain(passage);
        for (const id of ['1.1', '1.2'] as const) expect(renderedPolicy(lang, id), `${id}: ${passage.slice(0, 60)}`).not.toContain(passage);
      }
      // Section 9 keeps its anchor.
      expect(privacyFor(lang, '1.3')).toMatch(/^## 9\. .+ \{#server-logs\}$/m);
    }
    // The change note names the real address of the previous version.
    expect(CHANGE_NOTE_13.en).toContain(`${privacyVersionAddress('1.2', 'en')}.`);
    expect(CHANGE_NOTE_13.de).toContain(`${privacyVersionAddress('1.2', 'de')}.`);
  });

  test('version 1.4: My workspace in the wording of statement 20c, in force from 3.3.0, and none of it before', () => {
    // One date for the whole version, provisional until the release day of 3.3.0 is fixed.
    const v = privacyVersion('1.4');
    expect(v.dateIso).toBe(PRIVACY_14_DATE_ISO);
    expect(v.date).toEqual(privacyDateOf(PRIVACY_14_DATE_ISO));
    expect(privacyDateOf('2026-11-22')).toEqual({ en: '22 November 2026', de: '22.11.2026' });
    expect(privacyDateOf('2026-12-03')).toEqual({ en: '3 December 2026', de: '03.12.2026' });
    expect(v.dateIso > privacyVersion('1.3').dateIso, '1.4 takes effect after 1.3').toBe(true);
    expect(renderedPolicy('en', '1.4')).toContain(`Version 1.4, as of ${v.date.en}.`);
    expect(renderedPolicy('de', '1.4')).toContain(`Fassung 1.4, Stand ${v.date.de}.`);
    for (const lang of ['de', 'en'] as const) {
      const blocks = legalBlocks(privacyFor(lang, '1.4'), lang).map(blockText);
      const note =
        lang === 'de'
          ? `Geändert am ${v.date.de}: ${DOC20_HEAD.de} Die vorige Fassung vom 16.11.2026 finden Sie unter ${privacyVersionAddress('1.3', 'de')}.`
          : `Changed on ${v.date.en}: ${DOC20_HEAD.en} The previous version of 16 November 2026 is at ${privacyVersionAddress('1.3', 'en')}.`;
      expect(blocks[2], 'the change note stands right after the version line').toBe(note);
      for (const passage of STATEMENT_20C[lang]) {
        expect(renderedPolicy(lang, '1.4'), passage.slice(0, 60)).toContain(passage);
        for (const id of ['1.1', '1.2', '1.3'] as const) expect(renderedPolicy(lang, id), `${id}: ${passage.slice(0, 60)}`).not.toContain(passage);
      }
      // Everything 1.3 said stays: the passages of document 21 are all still there.
      for (const passage of DOC21[lang]) expect(renderedPolicy(lang, '1.4'), passage.slice(0, 60)).toContain(passage);
      // The sentence on the summary closes the storage paragraph of section 3.
      const s3 = blocks.find((b) => b.startsWith(lang === 'de' ? 'Die von Ihnen hochgeladenen ABAP-Quelldateien' : 'The ABAP source files you upload'));
      expect(s3?.endsWith(STATEMENT_20C[lang][2])).toBe(true);
      // The view sentence closes the local-storage list, before session storage.
      const text = renderedPolicy(lang, '1.4');
      expect(text.indexOf(STATEMENT_20C[lang][1])).toBeLessThan(text.indexOf(lang === 'de' ? 'In der Sitzungsspeicherung' : 'In session storage'));
      expect(text.indexOf(STATEMENT_20C[lang][1])).toBeGreaterThan(text.indexOf('cc-business-layer-writing-…)'));
    }
  });

  test('version 1.5: exactly the two deletions of document 22, question 1, and the change note as drafted (statement 22c, 1)', () => {
    const v = privacyVersion('1.5');
    expect(v.dateIso).toBe(PRIVACY_15_DATE_ISO);
    expect(v.date).toEqual(privacyDateOf(PRIVACY_15_DATE_ISO));
    expect(v.dateIso > privacyVersion('1.4').dateIso, '1.5 takes effect after 1.4').toBe(true);
    expect(renderedPolicy('en', '1.5')).toContain(`Version 1.5, as of ${v.date.en}.`);
    expect(renderedPolicy('de', '1.5')).toContain(`Fassung 1.5, Stand ${v.date.de}.`);
    const DELETED = {
      de: ['welche Hinweise Sie weggeklickt haben (cc.workspace.coachMarks.dismissed), ', 'dass Sie im Design eines Projekts die Fragen übersprungen haben (cc:design-skip-questions:…), '],
      en: ['which hints you have dismissed (cc.workspace.coachMarks.dismissed), ', "that you skipped the questions in a project's Design (cc:design-skip-questions:…), "],
    } as const;
    const NOTE = {
      de: `Geändert am ${v.date.de}: Abschnitt 7 nennt zwei Einträge nicht mehr, die die Oberfläche seit Release 3.5.0 nicht mehr anlegt: die weggeklickten Hinweise (cc.workspace.coachMarks.dismissed) und die übersprungenen Fragen im Design (cc:design-skip-questions:…). Die vorige Fassung vom 23.11.2026 finden Sie unter clean-core.io/datenschutz/versions/1.4/de.`,
      en: `Changed on ${v.date.en}: section 7 no longer names two entries the interface stopped writing with release 3.5.0: the dismissed hints (cc.workspace.coachMarks.dismissed) and the skipped questions in Design (cc:design-skip-questions:…). The previous version of 23 November 2026 is at clean-core.io/datenschutz/versions/1.4.`,
    } as const;
    for (const lang of ['de', 'en'] as const) {
      const blocks = legalBlocks(privacyFor(lang, '1.5'), lang).map(blockText);
      expect(blocks[2], 'the change note stands right after the version line').toBe(NOTE[lang]);
      // The body is 1.4 with exactly the two passages removed: nothing added, nothing else taken out.
      const body = (id: PrivacyVersionId) => legalBlocks(privacyFor(lang, id), lang).map(blockText).slice(3).join('\n');
      let expected = body('1.4');
      for (const passage of DELETED[lang]) {
        expect(expected.split(passage).length - 1, `1.4 holds the passage once: ${passage}`).toBe(1);
        expected = expected.replace(passage, '');
      }
      expect(body('1.5')).toBe(expected);
      // The local-storage list now starts with the first look, as the lawyer's draft reads.
      expect(renderedPolicy(lang, '1.5')).toContain(
        lang === 'de'
          ? 'in der lokalen Speicherung: ob Sie den ersten Blick gesehen haben (cc.workspace.firstLook.seen)'
          : 'in local storage: whether you have seen the first look (cc.workspace.firstLook.seen)',
      );
      // No sentence of option C (statement 22c, 1 (4)): no promise to remove what earlier versions created.
      expect(renderedPolicy(lang, '1.5')).not.toMatch(lang === 'de' ? /frühere Fassungen der Oberfläche/ : /earlier versions of the interface/);
    }
  });

  test('version 1.6: exactly the entry and the sentence of the view in My workspace go, and its change note (owner 27.11.2026)', () => {
    const v = privacyVersion('1.6');
    expect(v.dateIso).toBe(PRIVACY_16_DATE_ISO);
    expect(v.date).toEqual(privacyDateOf(PRIVACY_16_DATE_ISO));
    expect(v.dateIso > privacyVersion('1.5').dateIso, '1.6 takes effect after 1.5').toBe(true);
    expect(PRIVACY_POLICY_CURRENT.id).toBe(LEGAL_TEXTS_NAMES_AUTOMATIC ? '1.6' : '1.1');
    expect(privacyVersionFor(true).id).toBe('1.6');
    expect(renderedPolicy('en', '1.6')).toContain(`Version 1.6, as of ${v.date.en}.`);
    expect(renderedPolicy('de', '1.6')).toContain(`Fassung 1.6, Stand ${v.date.de}.`);
    // 1.5's two passages on the view (statement 20c E1/E2), each replaced as below: the layout clause stands alone.
    const REPLACED = {
      de: [
        [STATEMENT_20C.de[0].slice(STATEMENT_20C.de[0].indexOf('durch welche Sicht'), STATEMENT_20C.de[0].indexOf('ob die Gliederung')), 'ob Sie Ihre Programme in „My workspace“ als Kacheln oder als Liste sehen (cc.workspace.mode); '],
        [` ${STATEMENT_20C.de[1]}`, ''],
      ],
      en: [
        [STATEMENT_20C.en[0].slice(STATEMENT_20C.en[0].indexOf('which view'), STATEMENT_20C.en[0].indexOf('whether the outline')), 'whether you see your programs in My workspace as tiles or as a list (cc.workspace.mode); '],
        [` ${STATEMENT_20C.en[1]}`, ''],
      ],
    } as const;
    const NOTE = {
      de: `Geändert am ${v.date.de}: Abschnitt 7 nennt den Eintrag für die Sicht in „My workspace“ (cc.workspace.lens) nicht mehr, weil die Oberfläche ihn seit Release 3.5.4 nicht mehr anlegt. Die vorige Fassung vom ${privacyVersion('1.5').date.de} finden Sie unter clean-core.io/datenschutz/versions/1.5/de.`,
      en: `Changed on ${v.date.en}: section 7 no longer names the entry for the view in My workspace (cc.workspace.lens), which the interface stopped keeping with release 3.5.4. The previous version of ${privacyVersion('1.5').date.en} is at clean-core.io/datenschutz/versions/1.5.`,
    } as const;
    for (const lang of ['de', 'en'] as const) {
      const blocks = legalBlocks(privacyFor(lang, '1.6'), lang).map(blockText);
      expect(blocks[2], 'the change note stands right after the version line').toBe(NOTE[lang]);
      // The body is 1.5 with exactly the two passages changed: nothing added, nothing else taken out.
      const body = (id: PrivacyVersionId) => legalBlocks(privacyFor(lang, id), lang).map(blockText).slice(3).join('\n');
      let expected = body('1.5');
      for (const [passage, replacement] of REPLACED[lang]) {
        expect(passage.length, 'not vacuous').toBeGreaterThan(40);
        expect(expected.split(passage).length - 1, `1.5 holds the passage once: ${passage}`).toBe(1);
        expected = expected.replace(passage, replacement);
      }
      expect(body('1.6')).toBe(expected);
      // Neither the key nor the sentence on the view is left anywhere in 1.6; the layout entry stays.
      const text = renderedPolicy(lang, '1.6').split('\n').slice(3).join('\n');
      expect(text).not.toContain('cc.workspace.lens');
      expect(text).not.toMatch(lang === 'de' ? /Die Sicht in „My workspace“/ : /The view in My workspace/);
      expect(text).toContain(
        lang === 'de'
          ? 'welche Analysen Sie gelesen haben (cc.workspace.analysis.read), ob Sie Ihre Programme in „My workspace“ als Kacheln oder als Liste sehen (cc.workspace.mode); ob die Gliederung der Prozesskarte offen ist'
          : 'which analyses you have read (cc.workspace.analysis.read), whether you see your programs in My workspace as tiles or as a list (cc.workspace.mode); whether the outline of the process map is open',
      );
      // No sentence on the clean-up, as in 1.5 (statement 22c, 1 (4)).
      expect(renderedPolicy(lang, '1.6')).not.toMatch(lang === 'de' ? /frühere Fassungen der Oberfläche/ : /earlier versions of the interface/);
    }
    // Every earlier version still names the view as it was published (the archive files are held byte for byte below).
    for (const id of ['1.4', '1.5'] as const) {
      for (const lang of ['de', 'en'] as const) for (const passage of STATEMENT_20C[lang].slice(0, 2)) expect(renderedPolicy(lang, id)).toContain(passage);
    }
  });

  test('every version is archived: the file is the source rendered for it, and its digest is the one on record', () => {
    for (const v of PRIVACY_POLICY_VERSIONS) {
      for (const lang of ['de', 'en'] as const) {
        const file = read(v.files[lang]);
        expect(file, `${v.files[lang]} is not the source rendered for ${v.id}: scripts/legal/archive-privacy.ts (before publication only)`).toBe(
          toArchiveMarkdown(legalBlocks(privacyFor(lang, v.id), lang)),
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
    expect(publishedPrivacyVersions(privacyVersion('1.2')).map((v) => v.id)).toEqual(['1.1', '1.2']);
    expect(publishedPrivacyVersions(privacyVersion('1.3')).map((v) => v.id)).toEqual(['1.1', '1.2', '1.3']);
    expect(publishedPrivacyVersions(privacyVersion('1.4')).map((v) => v.id)).toEqual(['1.1', '1.2', '1.3', '1.4']);
    expect(publishedPrivacyVersions(privacyVersion('1.5')).map((v) => v.id)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5']);
    expect(publishedPrivacyVersions(privacyVersionFor(true)).map((v) => v.id)).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']);
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
    // Version, date and address come from the version record, so the provisional date of 1.4 has one place.
    expect(src).toContain('const PRIVACY_IN_FORCE = privacyVersionFor(true);');
    expect(src).not.toMatch(/Fassung 1\.\d, Stand|version 1\.\d, as of/);
    expect(v.id).toBe('1.6');
    expect(consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'de') === de, 'the German box names version 1.6 exactly in the build that has it').toBe(
      LEGAL_TEXTS_NAMES_AUTOMATIC,
    );
    expect(consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'en') === en, 'the English box names version 1.6 exactly in the build that has it').toBe(
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
    expect(privacyVersionFor(true).recordId).toBe('1.6');
    expect(privacyVersion('1.5').recordId).toBe('1.5');
    expect(privacyVersion('1.4').recordId).toBe('1.4');
    expect(privacyVersion('1.3').recordId).toBe('1.3');
    expect(privacyVersion('1.2').recordId).toBe('1.2');
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
