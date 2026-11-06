import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  AUTO_STEPS_NOTICE_FIELD,
  automaticStagesInThisBuild,
  autoStepsNoticeValues,
  autoStepsNoticeWanted,
  autoStepsSwitchBody,
  autoStepsSwitchOn,
} from '../lib/auto-steps-notice';
import { MODEL_STAGE_LABELS, modelStagesOf } from '../lib/model-stages';
import { NAMING_WITHOUT_FACTS_PAUSED } from '../lib/process-naming';
import { CONSENT_TEXTS, consentText } from '../lib/legal/consent-texts';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';
import { TERMS_DE } from '../lib/legal/texts/terms.de';
import { TERMS_EN } from '../lib/legal/texts/terms.en';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { BYOK_ADDENDUM_DE } from '../lib/legal/texts/byok-addendum.de';
import { BYOK_ADDENDUM_EN } from '../lib/legal/texts/byok-addendum.en';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTermsFileFor } from '../lib/terms-versions';
import { ARCHIVED_BYOK_ADDENDUM_VERSIONS } from '../lib/legal/byok-addendum-versions';
import { publishedWordingPath } from '../lib/contract-confirmation-email';

/**
 * Release 3.0.21, legal texts Fassung 1.1 — two items, server-free:
 *
 *   A10  the one-time notice before the first automatic model call (C14),
 *        with the switch inside it, and the texts that say one automatic step
 *        while business names are paused;
 *   A9   Terms 1.3: the confirmation mail carries a link to the wording of the
 *        accepted version, at an address bound to version and language.
 *
 * The rendered half (the notice on /admin/new-project/upload, the archive
 * pages) needs the dev server and is listed in the change's report.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ALL_ON = modelStagesOf(null);
const off = (...stages: Array<keyof typeof ALL_ON>) => ({ ...ALL_ON, ...Object.fromEntries(stages.map((s) => [s, false])) });

// ── A10 ─────────────────────────────────────────────────────────────────────

test.describe('A10 — one automatic step on opening a project while names are paused', () => {
  test('the plain wording is the only step the product starts by itself', () => {
    expect(NAMING_WITHOUT_FACTS_PAUSED).toBe(true);
    expect(automaticStagesInThisBuild()).toEqual(['statements']);
    // Only the plain wording sends `automatic: true`; the naming hook passes its flag, but asks nothing while paused.
    const senders: string[] = [];
    for (const dir of ['hooks', 'components', 'app']) {
      const walk = (d: string) => {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
          const rel = path.join(d, e.name);
          if (e.isDirectory()) walk(rel);
          else if (/\.(ts|tsx)$/.test(e.name) && /\{ automatic: true \}|\{ automatic \}/.test(read(rel))) senders.push(rel.replace(/\\/g, '/'));
        }
      };
      walk(dir);
    }
    // Since the legal review of 06.11.2026 (item 1) Transformation and Documentation start
    // only on a click, on every key, and mark nothing (tests/auto-steps-tools-on-open-3021.spec.ts).
    expect(senders.sort()).toEqual([
      'hooks/useAutoProcessNaming.ts',
      'hooks/usePlainWording.ts',
    ]);
    expect(read('lib/process-naming.ts')).toContain('if (NAMING_WITHOUT_FACTS_PAUSED && !input.withFacts) return false;');
  });

  test('shown once, only when something would run by itself', () => {
    const base = { known: true, keyAvailable: true, autoSteps: true, stages: ALL_ON, seen: false };
    expect(autoStepsNoticeWanted(base)).toBe(true);
    expect(autoStepsNoticeWanted({ ...base, seen: true }), 'answered or closed before').toBe(false);
    expect(autoStepsNoticeWanted({ ...base, known: false }), 'never on a guess').toBe(false);
    expect(autoStepsNoticeWanted({ ...base, reader: true }), 'never to an invited reader').toBe(false);
    expect(autoStepsNoticeWanted({ ...base, autoSteps: false }), 'own key with "Automatic steps" off: nothing runs by itself').toBe(false);
    expect(autoStepsNoticeWanted({ ...base, keyAvailable: false }), 'no key, or a suspended provider').toBe(false);
    expect(autoStepsNoticeWanted({ ...base, stages: off('statements') }), 'the step is already off').toBe(false);
    // The paused names alone do not make anything run.
    expect(autoStepsNoticeWanted({ ...base, stages: off('statements', 'naming') })).toBe(false);
    expect(autoStepsNoticeWanted({ ...base, stages: off('naming') })).toBe(true);
  });

  test('the server says the same: on an own key the automatic flag needs "Automatic steps"', () => {
    const route = read('app/api/model-stages/route.ts');
    // Since 06.11.2026 (item 2) the main switch comes first, on every key (tests/auto-model-steps-3021.spec.ts).
    expect(route).toContain('const autoSteps = automaticStepsAllowed({ mainSwitch: autoModelSteps, keySource, ownKeyAutoSteps: ownKey !== null && ownKey.autoSteps });');
    expect(read('app/api/gemini/route.ts')).toContain('if (automatic && ownKey && !ownKey.autoSteps) {');
  });

  test('the switch writes the main switch Settings shows, and records the notice as answered', () => {
    // Since 06.11.2026 (item 2): one stored setting, `users/{uid}.autoModelSteps` (tests/auto-model-steps-3021.spec.ts).
    expect(autoStepsSwitchBody(false)).toEqual({ autoModelSteps: false, autoStepsNotice: 'seen' });
    expect(autoStepsSwitchBody(true)).toEqual({ autoModelSteps: true, autoStepsNotice: 'seen' });
    expect(autoStepsSwitchOn({ autoModelSteps: true })).toBe(true);
    expect(autoStepsSwitchOn({ autoModelSteps: false })).toBe(false);
  });

  test('the route writes the notice field through the Admin SDK only; no rules change', () => {
    const route = read('app/api/model-stages/route.ts');
    expect(route).toContain('const noticeSeen = notice === AUTO_STEPS_NOTICE_SEEN;');
    expect(route).toContain('if (noticeSeen) only[AUTO_STEPS_NOTICE_FIELD] = FieldValue.serverTimestamp();');
    expect(route).toContain('if (noticeSeen) fields[AUTO_STEPS_NOTICE_FIELD] = FieldValue.serverTimestamp();');
    expect(route).toContain('const autoStepsNoticeSeen = profile?.[AUTO_STEPS_NOTICE_FIELD] != null;');
    expect(AUTO_STEPS_NOTICE_FIELD).toBe('autoStepsNoticeAt');
    const rules = read('firestore.rules');
    expect(rules).not.toContain(AUTO_STEPS_NOTICE_FIELD);
    const keys = rules.slice(rules.indexOf('function userClientUpdateKeys()'), rules.indexOf('function isCreationTime('));
    expect(keys).not.toMatch(/modelStages|autoSteps/);
  });

  test('it sits on the own-code upload, above the source, and nowhere a reader goes', () => {
    const page = read('components/workspace/OwnCodeImport.tsx');
    expect(page).toContain('<AutoStepsNotice model={model} />');
    expect(page.indexOf('<AutoStepsNotice')).toBeLessThan(page.indexOf('data-own-code-drop'));
    for (const rel of ['components/workspace/WorkspaceShell.tsx', 'app/(app)/project/[projectId]/page.tsx']) {
      expect(read(rel), rel).not.toContain('AutoStepsNotice');
    }
    const notice = read('components/AutoStepsNotice.tsx');
    // In the page, not over it: a strip, not a dialog.
    expect(notice).toContain('<CcMessageStrip');
    expect(notice).not.toMatch(/CcDialog|role="dialog"|fixed inset/);
    expect(notice).toContain('<CcSwitch');
  });

  test('C14, the words: one step, the provider of the key, and the exact Settings label', () => {
    const t = CONSENT_TEXTS.autoStepsNotice;
    const { model, company } = autoStepsNoticeValues('gemini');
    expect(consentText(t.lead, 'en').replace('{Modell}', model).replace('{Anbieter}', company)).toBe(
      'When you open a project, one step — plain business sentences — is written automatically by an AI model (Google Gemini). The code it needs goes to Google for that. If your code must not leave the platform, switch this off now:',
    );
    expect(consentText(t.lead, 'de').replace('{Modell}', model).replace('{Anbieter}', company)).toBe(
      'Beim Öffnen eines Projekts schreibt ein Schritt – Fachsätze – automatisch mit einem KI-Modell (Google Gemini). Dafür geht der benötigte Code an Google. Darf Ihr Code die Plattform nicht verlassen, schalten Sie das jetzt ab:',
    );
    expect(autoStepsNoticeValues('anthropic')).toEqual({ model: 'Anthropic Claude', company: 'Anthropic' });
    expect(consentText(t.switchLabel, 'en')).toBe('Automatic AI steps');
    expect(consentText(t.after, 'en')).toBe('You can change this any time in Settings under “Where the AI model is used”.');
    expect(consentText(t.after, 'de')).toContain('„Where the AI model is used“');
    expect(read('components/ModelStagesCard.tsx')).toContain('title="Where the AI model is used"');
  });

  test('C14 no longer needs to name the two tools: since 06.11.2026 they start on a click only', () => {
    // Legal review 06.11.2026, item 1: Transformation and Documentation never call the model on
    // opening, on any key (tests/auto-steps-tools-on-open-3021.spec.ts); the sentence about them
    // is removed from C14 by the legal-text change. The notice shows it only while the text has it.
    const transformation = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(transformation).not.toContain('generateTransformation(true)');
    const documentation = read('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(documentation).not.toContain('writeBusinessLayer(true)');
    const notice = read('components/AutoStepsNotice.tsx');
    expect(notice).toContain('{toolsOnOpen ? (');
    expect(notice.indexOf('data-auto-steps-notice-tools')).toBeGreaterThan(notice.indexOf('<CcSwitch'));
    expect(notice.indexOf('data-auto-steps-notice-tools')).toBeLessThan(notice.indexOf('data-auto-steps-notice-after'));
    // The switch labels Settings shows stay as they are.
    expect(MODEL_STAGE_LABELS.transformation).toBe('Transformed code');
    expect(MODEL_STAGE_LABELS.documentation).toBe('Documentation and business blueprint');
  });

  test('privacy 3, Terms 5.4 and the Trust page say one automatic step, and that names are paused', () => {
    expect(PRIVACY_DE).toContain('Einen starten wir beim Öffnen eines Projekts selbst: verständliche Formulierungen (Fachsätze)');
    expect(PRIVACY_EN).toContain('One we start ourselves when a project is opened: plain-language wording (business sentences)');
    expect(PRIVACY_DE).toContain('Fachliche Namen, die wir ebenso von selbst starteten, sind ausgesetzt');
    expect(PRIVACY_EN).toContain('Business names, which we also started ourselves, are paused');
    expect(PRIVACY_DE).toContain('weisen wir Sie einmal darauf hin, mit einem Schalter');
    expect(PRIVACY_EN).toContain('we point this out once, with a switch');
    expect(TERMS_DE).toContain('startet die Plattform beim Öffnen eines Projekts einen Schritt von selbst');
    expect(TERMS_EN).toContain('the Platform starts one step by itself when a project is opened');
    expect(TRUST_EN).toContain('One stage — plain-language wording — starts by itself');
    for (const text of [PRIVACY_DE, PRIVACY_EN, TERMS_DE, TERMS_EN, TRUST_EN]) {
      expect(text).not.toMatch(/Zwei starten wir|Two we start|zwei Schritte von selbst|two steps by itself|Two stages — plain/);
    }
  });
});

// ── A9 ──────────────────────────────────────────────────────────────────────

test.describe('A9 — Terms 1.3: a link to the accepted wording, bound to version and language', () => {
  const DE_13 =
    'Nach der Registrierung erhalten Sie an Ihre Kontoadresse eine Bestätigung per E-Mail mit der Versionskennung, der Sprache, dem SHA-256-Hashwert des Wortlauts, dem Annahmezeitpunkt und einem Link auf den Wortlaut der angenommenen Fassung, der unter dieser Adresse dauerhaft abrufbar bleibt; sie umfasst auch die gesondert angenommenen Vereinbarungen. Die Bestätigung dient dem Nachweis für beide Seiten und ist keine Voraussetzung des Vertragsschlusses';
  const EN_13 =
    'After you sign up, you receive a confirmation by e-mail to your account address containing the version identifier, the language, the SHA-256 digest of the wording, the time of your acceptance and a link to the wording of the accepted version, which remains permanently available at that address; it also includes any agreements you accepted separately. The confirmation serves as a record for both sides and is not a condition of the conclusion of the contract';

  test('1.3 has the new wording in both languages, under its heading, and in the archived files', () => {
    expect(TERMS_DE).toContain(`**1.3** Speicherung des Vertragstextes, Nachweis und Vertragsbestätigung.`);
    expect(TERMS_DE).toContain(`${DE_13}{{t03ConfirmationMail}}.`);
    expect(TERMS_EN).toContain(`${EN_13}{{t03ConfirmationMail}}.`);
    expect(read(archivedTermsFileFor(TERMS_VERSION, 'de')!)).toContain(`${DE_13}.`);
    expect(read(archivedTermsFileFor(TERMS_VERSION, 'en')!)).toContain(`${EN_13}.`);
  });

  test('every address is bound to version and language', () => {
    expect(publishedWordingPath('sign-up', TERMS_VERSION, 'en')).toBe(`/terms/versions/${TERMS_VERSION}/en`);
    expect(publishedWordingPath('amendment', TERMS_VERSION, 'de')).toBe(`/terms/versions/${TERMS_VERSION}/de`);
    expect(publishedWordingPath('byok-addendum', 'ZV-BYOK-1.0', 'en')).toBe('/terms/byok-addendum/versions/ZV-BYOK-1.0/en');
    expect(publishedWordingPath('byok-addendum', 'ZV-BYOK-1.0', 'de')).toBe('/terms/byok-addendum/versions/ZV-BYOK-1.0/de');
  });

  test('the pages behind them serve the archived file, prerendered, and nothing else', () => {
    const en = read('app/terms/versions/[version]/en/page.tsx');
    expect(en).toContain("from '../page'");
    expect(en).toContain('export const dynamicParams = false;');
    const addendum = read('app/terms/byok-addendum/versions/[id]/[lang]/page.tsx');
    expect(addendum).toContain('export const dynamicParams = false;');
    expect(addendum).toContain('ARCHIVED_BYOK_ADDENDUM_VERSIONS.flatMap((v) => v.files.map((f) => ({ id: v.id, lang: f.lang })))');
    expect(addendum).toContain("fs.readFileSync(path.join(process.cwd(), file.file), 'utf8')");
    expect(addendum).toContain('{file.sha256}');
    for (const v of ARCHIVED_BYOK_ADDENDUM_VERSIONS) for (const f of v.files) expect(fs.existsSync(path.join(ROOT, f.file)), f.file).toBe(true);
    // The archive page of the version in force does not call it superseded.
    expect(read('app/terms/versions/[version]/page.tsx')).toContain('entry.version === TERMS_VERSION ? (');
  });

  test('no text promises the wording in the mail any more', () => {
    const promises = /(vollständigen Wortlaut|full wording)[^.]{0,80}(E-Mail|e-mail)|(E-Mail|e-mail)[^.]{0,80}(vollständigen Wortlaut|full wording)/;
    for (const [name, text] of [
      ['terms.de', TERMS_DE],
      ['terms.en', TERMS_EN],
      ['ZV de', BYOK_ADDENDUM_DE],
      ['ZV en', BYOK_ADDENDUM_EN],
      ['privacy.de', PRIVACY_DE],
      ['privacy.en', PRIVACY_EN],
    ] as const) {
      expect(text, name).not.toMatch(promises);
    }
    for (const group of ['signup', 'amendment', 'anthropicKey', 'confirmationMail'] as const) {
      const json = JSON.stringify(CONSENT_TEXTS[group]);
      expect(json, group).not.toMatch(promises);
      expect(json, group).not.toMatch(/\{Wortlaut\}|Vollständiger Wortlaut —|Full wording —/);
    }
    expect(BYOK_ADDENDUM_DE).toContain('einem Link auf ihren Wortlaut, der unter dieser Adresse dauerhaft abrufbar bleibt');
    expect(BYOK_ADDENDUM_EN).toContain('a link to its wording, which remains permanently available at that address');
  });
});
