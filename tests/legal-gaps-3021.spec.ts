import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TERMS_VERSION } from '../lib/constants';
import { archivedTerms, archivedTermsSha256For, normaliseTermsText } from '../lib/terms-versions';
import { recordConsent, acceptedTermsLanguageOf } from '../lib/consent';
import { signupNoticeBelow } from '../components/legal/SignupConsent';
import { CONSENT_TEXTS, consentText } from '../lib/legal/consent-texts';
import { BYOK_MIN_TERMS_VERSION, termsAllowAddendum, byokAddendumSha256 } from '../lib/byok-addendum';
import { archivedAddendum } from '../lib/legal/byok-addendum-versions';
import {
  acceptedWording,
  buildContractConfirmationMail,
  publishedWordingPath,
  wordingFromParagraphs,
  type ConfirmationOccasion,
} from '../lib/contract-confirmation-email';
import { providerSuspendedNotice, suspensionDetailsOf } from '../lib/provider-suspension';
import { providerSuspendedMessage } from '../lib/model-providers';

/**
 * Roadmap 3.0.21 — the product gaps behind the confirmations of the legal
 * texts, Fassung 1.1 (`lib/legal/open-values.ts`): T02 (the accepted language
 * version), T03 (the Additional Agreement gate and the confirmation mail C5)
 * and T01 (the C11 notice). The proof log (T05/T06) has its own spec,
 * `tests/proof-log-3021.spec.ts`. Server-free: pure modules, a stand-in for
 * the two Firestore calls a consent makes, and source guards on the routes.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

/** The two Firestore calls `recordConsent` makes, watched. */
function fakeConsentDb() {
  const writes: Array<{ op: 'create' | 'update'; path: string; data: Record<string, unknown> }> = [];
  let n = 0;
  const db = {
    collection: (name: string) => ({ doc: (id?: string) => ({ path: `${name}/${id ?? `auto${++n}`}` }) }),
    batch: () => {
      const staged: typeof writes = [];
      return {
        create: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'create', path: ref.path, data }),
        update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
        commit: async () => {
          writes.push(...staged);
        },
      };
    },
  };
  return { writes, deps: { db, FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } };
}

// ── T02: the accepted language version ───────────────────────────────────────

test.describe('T02 — the record holds the language version accepted and the digest of exactly that wording', () => {
  test('each language version has its own archived digest, and that digest is the file', () => {
    const entry = archivedTerms(TERMS_VERSION)!;
    const en = archivedTermsSha256For(TERMS_VERSION, 'en');
    const de = archivedTermsSha256For(TERMS_VERSION, 'de');
    expect(en).toBe(sha256(normaliseTermsText(read(entry.file))));
    expect(de).toBe(sha256(normaliseTermsText(read(entry.translations!.find((t) => t.lang === 'de')!.file))));
    expect(de).not.toBe(en);
    // A version archived only in English has no German wording: null, never the English digest.
    expect(archivedTermsSha256For('2026-10-03', 'de')).toBeNull();
  });

  test('a German acceptance records German and the German digest; the interface locale changes nothing', async () => {
    const { writes, deps } = fakeConsentDb();
    const out = await recordConsent({ uid: 'u1', email: 'a@example.org', source: 'spec', locale: 'en-US', termsLanguage: 'de' }, deps);
    const event = writes.find((w) => w.path.startsWith('consent_events/'))!;
    expect(event.op).toBe('create');
    expect(event.data.termsLanguage).toBe('de');
    expect(event.data.contentSha256).toBe(archivedTermsSha256For(TERMS_VERSION, 'de'));
    expect(event.data.locale).toBe('en-US');
    const profile = writes.find((w) => w.path === 'users/u1')!;
    expect(profile.data.termsLanguageAccepted).toBe('de');
    expect(out).toEqual({ termsVersion: TERMS_VERSION, termsLanguage: 'de', digest: archivedTermsSha256For(TERMS_VERSION, 'de') });
  });

  test('English, or anything that is not a published language, records English', async () => {
    for (const lang of ['en', undefined, 'fr', 'DE', 42]) {
      const { writes, deps } = fakeConsentDb();
      await recordConsent({ uid: 'u2', email: null, source: 'spec', locale: 'de-DE', termsLanguage: lang }, deps);
      const event = writes.find((w) => w.path.startsWith('consent_events/'))!;
      expect(event.data.termsLanguage, String(lang)).toBe('en');
      expect(event.data.contentSha256).toBe(archivedTermsSha256For(TERMS_VERSION, 'en'));
    }
    expect(acceptedTermsLanguageOf('de')).toBe('de');
  });

  test('both sign-up dialogs and the amendment dialog let the reader choose the contract language and send it', () => {
    for (const rel of ['components/LandingModals.tsx', 'components/UserOnboarding.tsx']) {
      const s = read(rel);
      expect(s, rel).toContain('<ContractLanguageChoice');
      expect(s, rel).toContain('<TermsConsentLabel lang={termsLanguage}');
    }
    expect(read('components/LandingModals.tsx')).toMatch(/acceptedPrivacy: agreedGDPR,\s*termsLanguage,/);
    expect(read('components/UserOnboarding.tsx')).toContain("createProfile(user, firstName, lastName, motivation, 'google', termsLanguage)");
    expect(read('hooks/useUserProfile.ts')).toContain("termsLanguage: input.termsLanguage === 'de' ? 'de' : 'en',");
    const gate = read('components/TermsReacceptGate.tsx');
    expect(gate).toContain('<ContractLanguageChoice');
    expect(gate).toContain('body: JSON.stringify({ termsVersion: TERMS_VERSION, termsLanguage })');
    expect(gate).toContain('consentText(C2.checkbox, lang)');
    // The routes forward the choice; the digest is derived on the server.
    expect(read('app/api/account/register/route.ts')).toContain('termsLanguage: body?.termsLanguage,');
    expect(read('app/api/consent/route.ts')).toContain('termsLanguage: body?.termsLanguage,');
  });

  test('the German boxes are the German C1 words, and their document names open the texts', () => {
    const terms = consentText(CONSENT_TEXTS.signup.termsCheckbox, 'de');
    const privacy = consentText(CONSENT_TEXTS.signup.privacyCheckbox, 'de');
    expect(terms).toContain('deutsche Fassung');
    // The phrase the label turns into the button that opens the full text must be in the German words.
    const src = read('components/legal/SignupConsent.tsx');
    expect(src).toContain("de: 'Nutzungsbedingungen und Community-Richtlinien'");
    expect(src).toContain("de: 'Datenschutzerklärung'");
    expect(terms).toContain('Nutzungsbedingungen und Community-Richtlinien');
    expect(privacy).toContain('Datenschutzerklärung');
    expect(src).toContain('consentText(C1.termsCheckbox, lang), TERMS_PHRASE[lang]');
    expect(signupNoticeBelow('a@example.org', 'de')).toContain('Vertragssprache ist Deutsch');
    expect(read('components/legal/LegalOverlayBody.tsx')).toContain('legalDocumentBlocks(id, lang)');
  });
});

// ── T03: the Additional Agreement gate and the contract confirmation C5 ──────

test.describe('T03 — an Anthropic key needs Terms v2.3.0 or later', () => {
  test('the rule: v2.3.0 and later pass, v2.2.0 and nothing do not', () => {
    expect(archivedTerms(BYOK_MIN_TERMS_VERSION)!.label).toBe('v2.3.0');
    expect(termsAllowAddendum(BYOK_MIN_TERMS_VERSION)).toBe(true);
    expect(termsAllowAddendum('2099-01-01')).toBe(true);
    expect(termsAllowAddendum('2026-10-03')).toBe(false);
    expect(termsAllowAddendum(null)).toBe(false);
    expect(termsAllowAddendum('v2.3.0')).toBe(false);
  });

  test('the save route refuses before testing or storing the key', () => {
    const route = read('app/api/secrets/gemini/route.ts');
    const gate = route.indexOf('if (!termsAllowAddendum(profile.termsVersionAccepted))');
    expect(gate).toBeGreaterThan(route.indexOf('if (addendumRequired(provider) && !addendum)'));
    expect(gate).toBeLessThan(route.indexOf('await testOwnModelKey('));
    expect(gate).toBeLessThan(route.indexOf('await saveOwnModelKey('));
    expect(route.slice(gate, gate + 500)).toContain('code: ADDENDUM_TERMS_REQUIRED_CODE');
  });

  test('every acceptance row carries the digest of the archived wording of its language', () => {
    for (const f of archivedAddendum('ZV-BYOK-1.0')!.files) {
      expect(byokAddendumSha256('ZV-BYOK-1.0', f.lang)).toBe(sha256(normaliseTermsText(read(f.file))));
    }
  });
});

test.describe('T03 — the contract confirmation C5', () => {
  const cases: Array<[ConfirmationOccasion, 'en' | 'de']> = [
    ['sign-up', 'en'],
    ['sign-up', 'de'],
    ['amendment', 'en'],
    ['amendment', 'de'],
    ['byok-addendum', 'en'],
    ['byok-addendum', 'de'],
  ];
  for (const [occasion, language] of cases) {
    test(`${occasion} (${language}): version, language, time, digest, the full wording and one link`, () => {
      const accepted = acceptedWording(occasion, language, 'ZV-BYOK-1.0');
      expect(accepted, 'the rendered wording no longer matches its archived digest').not.toBeNull();
      const { subject, html } = buildContractConfirmationMail({
        occasion,
        language,
        recipient: 'someone@example.org',
        firstName: 'Ada',
        ...accepted!,
        acceptedAt: '2026-10-23T08:15:00.000Z',
      });
      expect(subject).toContain(language === 'de' ? '(deutsche Fassung)' : '(English version)');
      expect(html).toContain(language === 'de' ? 'Sprache: Deutsch' : 'Language: English');
      expect(html).toContain(language === 'de' ? '23. Oktober 2026 um 08:15 (UTC)' : '23 October 2026 at 08:15 (UTC)');
      expect(html).toContain(accepted!.sha256);
      expect(html).toContain(language === 'de' ? 'Hallo Ada,' : 'Hello Ada,');
      expect(html).not.toMatch(/\{[A-Z][a-zA-Z -]*\}|\{\{/);
      expect(html).not.toContain('den/die');
      // The full wording, character for character: taken back out of the mail it hashes to the digest.
      const spans = [...html.matchAll(/<p style="margin: 0 0 16px 0;">(<span style="overflow-wrap: anywhere;">[\s\S]*?<\/span>)<\/p>/g)].map((m) => m[1]);
      const mark = language === 'de' ? '— Vollständiger Wortlaut —' : '— Full wording —';
      const after = html.slice(html.indexOf(mark));
      const wordingSpans = spans.filter((s) => after.includes(s));
      expect(sha256(wordingFromParagraphs(wordingSpans))).toBe(accepted!.sha256);
      // One link, to where that version stays published.
      const links = [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
      expect(links).toHaveLength(1);
      expect(links[0].endsWith(publishedWordingPath(occasion, accepted!.versionId, language))).toBe(true);
    });
  }

  test('sent after sign-up, after an amendment and after the agreement — best effort, to the verified address', () => {
    const register = read('app/api/account/register/route.ts');
    expect(register).toMatch(/sendContractConfirmationMail\(\{\s*to: rawEmail,\s*uid,\s*occasion: 'sign-up',\s*language: recorded\.termsLanguage,/);
    const consent = read('app/api/consent/route.ts');
    expect(consent).toContain("const occasion = typeof profile.termsVersionAccepted === 'string' && profile.termsVersionAccepted ? 'amendment' : 'sign-up';");
    expect(consent).toMatch(/sendContractConfirmationMail\(\{\s*to: email,/);
    const byok = read('lib/byok-agreement-mail.ts');
    expect(byok).toContain("sendContractConfirmationMail({ to, uid, occasion: 'byok-addendum', language: acceptance.language, addendum: acceptance, firstName })");
    const sender = read('lib/contract-confirmation-mail.ts');
    // Never fails the request, never retries (E14/E25).
    expect(sender).toContain("logger.warn('contract confirmation not sent'");
    expect(sender).not.toMatch(/retry|setTimeout/i);
  });
});

// ── T01: the C11 notice ──────────────────────────────────────────────────────

test.describe('T01 — a switched-off provider: the step stops and says since when and why (C11)', () => {
  test('with date and reason: C11, word for word', () => {
    const details = suspensionDetailsOf({ MODEL_PROVIDERS_SUSPENDED_AT: '2026-11-02', MODEL_PROVIDERS_SUSPENDED_REASON: 'data-region' });
    expect(details).toEqual({ at: '2026-11-02', reason: 'data-region' });
    const en = providerSuspendedNotice('anthropic', details);
    expect(en).toBe(
      "Calls to Anthropic have been suspended since 2 November 2026: Anthropic's statements on the data region no longer hold. Your key stays stored; model-supported steps are unavailable until you delete the key or the basis is restored. We do not switch to another provider (Additional Agreement, clauses 6 and 8). The deterministic analysis remains available.",
    );
    expect(providerSuspendedNotice('anthropic', details, 'de')).toContain('seit dem 2. November 2026 ausgesetzt: Anthropics Angaben zur Datenregion treffen nicht mehr zu.');
  });

  test('without a valid date or reason, or for Gemini, the generic sentence — never a blank', () => {
    expect(suspensionDetailsOf({ MODEL_PROVIDERS_SUSPENDED_AT: '2.11.2026', MODEL_PROVIDERS_SUSPENDED_REASON: 'because' })).toEqual({ at: null, reason: null });
    expect(providerSuspendedNotice('anthropic', { at: '2026-11-02', reason: null })).toBe(providerSuspendedMessage('anthropic'));
    expect(providerSuspendedNotice('gemini', { at: '2026-11-02', reason: 'binding-decision' })).toBe(providerSuspendedMessage('gemini'));
  });

  test('the proxy, the key routes and Settings all say it', () => {
    for (const f of ['app/api/gemini/route.ts', 'app/api/secrets/gemini/route.ts', 'app/api/secrets/gemini/test/route.ts']) {
      expect(read(f), f).toContain('error: providerSuspendedNotice(provider, suspensionDetailsOf(process.env)), code: PROVIDER_SUSPENDED_CODE');
    }
    expect(read('app/api/model-stages/route.ts')).toContain('providerSuspendedNotice(suspendedProvider, suspensionDetailsOf(process.env))');
    expect(read('app/(app)/settings/page.tsx')).toContain('notice={keyAvailability.suspendedNotice}');
    expect(read('docs/OPERATIONS.md')).toContain('MODEL_PROVIDERS_SUSPENDED_REASON');
  });
});
