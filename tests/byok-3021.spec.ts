import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ANTHROPIC_INFERENCE_GEO,
  ANTHROPIC_OWN_KEY_OFFERED,
  AUTO_STEPS_OFF_CODE,
  OWN_CLAUDE_MODEL,
  PROVIDER_SUSPENDED_CODE,
  autoStepsAllowed,
  offeredKeyProviders,
  providerSuspendedMessage,
  stageAnswerNeedsWrite,
  suspendedProvidersOf,
} from '../lib/model-providers';
import { CLAUDE_INFERENCE_GEO, claudeAnswerOf, claudeRequestBody } from '../lib/anthropic-messages';
import {
  ADDENDUM_REQUIRED_CODE,
  BYOK_ADDENDUM_ACCEPT_TEXT,
  BYOK_ADDENDUM_PATH,
  BYOK_ADDENDUM_VERSION,
  addendumAcceptanceOf,
  addendumRequired,
  byokAddendumSha256,
} from '../lib/byok-addendum';
import { buildAgreementEndedMail } from '../lib/byok-agreement-email';
import { acceptedWording, buildContractConfirmationMail } from '../lib/contract-confirmation-email';
import { archivedAddendumSha256 } from '../lib/legal/byok-addendum-versions';
import { OWN_KEY_TEST_STUB_REFUSED, testOwnModelKey } from '../lib/own-key-test';
import { ownKeyCounts, quotaExhausted, runsAreSelfFunded } from '../lib/run-quota-rule';
import { askModeOf } from '../lib/auto-steps';
import { aiAssistantNotice, aiAssistantNoticeDe } from '../lib/ai-assistant-notice';
import { OwnModelKeyBlockedError, OwnModelKeyMissingError, OWN_KEY_BLOCKED_CODE } from '../lib/byok-key';
import { saveOwnModelKey } from '../lib/firebase-admin';

/**
 * Roadmap 3.0.21 — the product side of the legal texts 1.0 (legal review of
 * 22.10.2026) and the own Claude key unlocked as a BYOK feature (owner
 * 22.10.2026). Server-free: pure modules, source guards on the routes, and the
 * settings parts rendered to a string. The halves that need Firestore and the
 * route handlers are named in the merge report.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── the own Claude key, unlocked ─────────────────────────────────────────────

test.describe('the own Claude key is offered, on a current model, in the data region "us"', () => {
  test('Settings and the save route offer Anthropic beside Gemini', () => {
    expect(ANTHROPIC_OWN_KEY_OFFERED).toBe(true);
    expect(offeredKeyProviders()).toEqual(['gemini', 'anthropic']);
    // Claude 4.6 or newer: the data region needs it (legal review B7).
    expect(OWN_CLAUDE_MODEL).toBe('claude-sonnet-5-5');
  });

  test('every Messages API call sets inference_geo "us", and the answer\'s region is read back', () => {
    expect(CLAUDE_INFERENCE_GEO).toBe(ANTHROPIC_INFERENCE_GEO);
    expect(ANTHROPIC_INFERENCE_GEO).toBe('us');
    for (const json of [true, false]) {
      expect(claudeRequestBody({ model: OWN_CLAUDE_MODEL, prompt: 'p', jsonResponse: json }).inference_geo).toBe('us');
    }
    const out = claudeAnswerOf({ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1, inference_geo: 'us' } });
    expect(out.inferenceGeo).toBe('us');
    // Only a short region word, never free text from the provider.
    expect(claudeAnswerOf({ content: [], usage: { inference_geo: 'us; drop table' } }).inferenceGeo).toBeNull();
    expect(claudeAnswerOf({ content: [] }).inferenceGeo).toBeNull();
  });

  test('the proxy records the region with who answered, beside the receipt and never inside it', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain('inferenceGeo = result.inferenceGeo;');
    expect(route).toContain("const answeredBy = { provider: receiptProvider, modelId: servedModel, keyOwner, ...(inferenceGeo ? { inferenceGeo } : {}) };");
    // The receipt's claim set is unchanged.
    const receipt = route.slice(route.indexOf('const receipt = issueModelReceipt('), route.indexOf('signingKey,', route.indexOf('const receipt = issueModelReceipt(')));
    expect(receipt).not.toContain('inferenceGeo');
    const rec = { provider: 'anthropic', modelId: OWN_CLAUDE_MODEL, keyOwner: 'own' as const, at: '2026-10-22T10:00:00.000Z' };
    expect(stageAnswerNeedsWrite(rec, { ...rec, at: '2026-10-22T10:01:00.000Z', inferenceGeo: 'us' })).toBe(true);
  });
});

// ── the Additional Agreement on Own Model Keys ───────────────────────────────

test.describe('an Anthropic key is stored only with the Additional Agreement accepted (E26, T03)', () => {
  test('the checkbox says E26 word for word, per language version, and links the published wording', () => {
    expect(BYOK_ADDENDUM_VERSION).toBe('ZV-BYOK-1.0');
    expect(BYOK_ADDENDUM_ACCEPT_TEXT.en).toBe('I accept the Additional Agreement on Own Model Keys (ZV-BYOK-1.0, Anthropic; full wording: clean-core.io/terms/byok-addendum).');
    expect(BYOK_ADDENDUM_ACCEPT_TEXT.de).toBe('Ich nehme die Zusatzvereinbarung zu eigenen Modellschlüsseln (ZV-BYOK-1.0, Anthropic; vollständiger Wortlaut: clean-core.io/terms/byok-addendum/de) an.');
    // No confirmation of facts ("I am aware that …"): § 309 no. 12 b BGB.
    for (const t of Object.values(BYOK_ADDENDUM_ACCEPT_TEXT)) expect(t).not.toMatch(/aware|bekannt|confirm|bestätige/i);
    expect(BYOK_ADDENDUM_PATH).toEqual({ en: '/terms/byok-addendum', de: '/terms/byok-addendum/de' });
  });

  test('an acceptance counts only for the version in force, a published language and a tick', () => {
    expect(addendumAcceptanceOf({ addendum: { version: 'ZV-BYOK-1.0', language: 'de', accepted: true } })).toEqual({ version: 'ZV-BYOK-1.0', language: 'de' });
    expect(addendumAcceptanceOf({ addendum: { version: 'ZV-BYOK-0.9', language: 'en', accepted: true } })).toBeNull();
    expect(addendumAcceptanceOf({ addendum: { version: 'ZV-BYOK-1.0', language: 'fr', accepted: true } })).toBeNull();
    expect(addendumAcceptanceOf({ addendum: { version: 'ZV-BYOK-1.0', language: 'en', accepted: 'yes' } })).toBeNull();
    expect(addendumAcceptanceOf({})).toBeNull();
    expect(addendumAcceptanceOf(null)).toBeNull();
    expect(addendumRequired('anthropic')).toBe(true);
    expect(addendumRequired('gemini')).toBe(false);
    // T03 (3.0.21): the archived wording of each language version is pinned, and
    // an acceptance names exactly that digest; an unknown version stays null.
    expect(byokAddendumSha256('ZV-BYOK-1.0', 'en')).toBe(archivedAddendumSha256('ZV-BYOK-1.0', 'en'));
    expect(byokAddendumSha256('ZV-BYOK-1.0', 'de')).toBe(archivedAddendumSha256('ZV-BYOK-1.0', 'de'));
    expect(byokAddendumSha256('ZV-BYOK-1.0', 'de')).not.toBe(byokAddendumSha256('ZV-BYOK-1.0', 'en'));
    expect(byokAddendumSha256('ZV-BYOK-1.0', 'de')).toMatch(/^[0-9a-f]{64}$/);
    expect(byokAddendumSha256('ZV-BYOK-0.9', 'en')).toBeNull();
  });

  test('the save route refuses an Anthropic key without it, before anything is stored, and records the language version accepted', () => {
    const route = read('app/api/secrets/gemini/route.ts');
    const refuse = route.indexOf('if (addendumRequired(provider) && !addendum)');
    expect(refuse).toBeGreaterThan(-1);
    expect(route.slice(refuse, refuse + 400)).toContain('code: ADDENDUM_REQUIRED_CODE');
    expect(refuse).toBeLessThan(route.indexOf('await saveOwnModelKey('));
    expect(ADDENDUM_REQUIRED_CODE).toBe('byok-addendum-required');
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain("export const BYOK_AGREEMENT_EVENTS = 'byok_agreement_events';");
    expect(admin).toContain('contentSha256: byokAddendumSha256(event.version, event.language),');
    // Purged with the account, like the consent records.
    expect(admin).toContain('await deleteCollectionByUid(BYOK_AGREEMENT_EVENTS);');
    // No client rule names the proof log: Firestore refuses every client access by default.
    expect(read('firestore.rules')).not.toContain('byok_agreement_events');
  });

  test('ending it: in Settings, by replacing the key, or in text form via the operator — each recorded and confirmed by mail', () => {
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain("if (agreementEnded) byokAgreementEventWrite(tx, db, FieldValue, uid, { kind: 'ended', ending: opts.ending ?? 'settings' });");
    expect(admin).toContain("if (agreementReplaced) byokAgreementEventWrite(tx, db, FieldValue, uid, { kind: 'ended', ending: 'replaced' });");
    const route = read('app/api/secrets/gemini/route.ts');
    expect(route).toContain("const { agreementEnded } = await deleteOwnModelKey(decodedToken.uid, { ending: 'settings' });");
    expect(route).toContain("if (agreementEnded) await sendAgreementEndedMail(decodedToken.email, decodedToken.uid, 'settings');");
    const console = read('app/api/admin/console-action/route.ts');
    expect(console).toContain("case 'block-own-key':");
    expect(console).toContain("case 'end-byok-agreement':");
    expect(console).toContain("await sendAgreementEndedMail(email, uid, 'text-form');");
    // The settings button says what it does for an Anthropic key.
    expect(read('app/(app)/settings/page.tsx')).toContain("savedProvider === 'anthropic' ? 'Delete key and end agreement' : 'Remove the key'");
  });

  test('a blocked key is refused like a missing one — never served with the platform key', () => {
    const e = new OwnModelKeyBlockedError();
    expect(e).toBeInstanceOf(OwnModelKeyMissingError);
    expect(e.code).toBe(OWN_KEY_BLOCKED_CODE);
    expect(e.message).toMatch(/nothing is sent with the platform key/);
    expect(read('lib/firebase-admin.ts')).toContain('if (data.blockedAt) throw new OwnModelKeyBlockedError();');
  });

  test('the confirmation mails carry version, language version, digest and time, the full wording, and one link to it', () => {
    // Since T03 (3.0.21) the acceptance is confirmed with C5 in the language accepted.
    const accepted = acceptedWording('byok-addendum', 'de', 'ZV-BYOK-1.0')!;
    const { html, subject } = buildContractConfirmationMail({
      occasion: 'byok-addendum',
      language: 'de',
      recipient: 'a@example.org',
      firstName: null,
      ...accepted,
      acceptedAt: '2026-10-22T10:00:00.000Z',
    });
    expect(subject).toContain('deutsche Fassung');
    expect(html).toContain('ZV-BYOK-1.0');
    expect(html).toContain('Sprache: Deutsch');
    expect(html).toContain(archivedAddendumSha256('ZV-BYOK-1.0', 'de')!);
    expect(html).toContain('22. Oktober 2026 um 10:00 (UTC)');
    expect(html).toContain('/terms/byok-addendum/de');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(buildAgreementEndedMail({ recipient: 'a@example.org', ending: 'text-form', endedAt: 'x' })).toContain('text form');
  });
});

// ── an own key counts only after a successful test ───────────────────────────

test.describe('an own key counts as configured only after a successful key test', () => {
  test('stored but untested lifts no quota; tested lifts it', () => {
    const base = { tier: 'pilot', transformationsUsed: 5, transformationsLimit: 5 };
    expect(ownKeyCounts({ byokConfigured: true })).toBe(false);
    expect(runsAreSelfFunded({ ...base, byokConfigured: true })).toBe(false);
    expect(quotaExhausted({ ...base, byokConfigured: true })).toBe(true);
    expect(ownKeyCounts({ byokConfigured: true, byokTestedAt: { seconds: 1 } })).toBe(true);
    expect(runsAreSelfFunded({ ...base, byokConfigured: true, byokTestedAt: { seconds: 1 } })).toBe(true);
    // The server's metering point reads the same rule.
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain('if (ownKeyCounts(data)) {');
    expect(admin).not.toMatch(/if \(data\.byokConfigured === true\) \{/);
  });

  test('nothing is stored without a passed test: the store refuses, the route tests first', async () => {
    await expect(saveOwnModelKey('u', 'AIza-x', 'gemini')).rejects.toThrow(/only after a successful key test/);
    const route = read('app/api/secrets/gemini/route.ts');
    expect(route.indexOf('await testOwnModelKey(provider, apiKey,')).toBeGreaterThan(-1);
    expect(route.indexOf('await testOwnModelKey(provider, apiKey,')).toBeLessThan(route.indexOf('await saveOwnModelKey('));
    expect(route).toContain('tested: true,');
    // A re-test of the stored key decides whether it still counts.
    const test_ = read('app/api/secrets/gemini/test/route.ts');
    expect(test_).toContain('if (testingSaved) await recordOwnKeyTest(decodedToken.uid, provider, false);');
    expect(test_).toContain('if (testingSaved) await recordOwnKeyTest(decodedToken.uid, provider, true);');
  });

  test('the key test spends no tokens and, on the test server, refuses the marked key', async () => {
    await expect(testOwnModelKey('gemini', 'AIza-ok', { stubbed: true })).resolves.toBeUndefined();
    await expect(testOwnModelKey('anthropic', `sk-ant-${OWN_KEY_TEST_STUB_REFUSED}`, { stubbed: true })).rejects.toThrow();
    await expect(testOwnModelKey('gemini', '   ', { stubbed: true })).rejects.toThrow();
    const src = read('lib/own-key-test.ts');
    expect(src).not.toContain('generateContent');
  });

  test('automatic steps switch on only for a tested key', () => {
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain('if (on && !ownKeyCounts(profile.data() as { byokConfigured?: boolean; byokTestedAt?: unknown })) {');
    expect(admin).toContain('autoSteps: data.autoSteps === true && !!data.testedAt');
  });
});

// ── automatic steps with an own key: a switch, off by default (B6) ──────────

test.describe('automatic model steps with an own key are a switch, off by default', () => {
  test('on the platform key always; on an own key only with the switch on', () => {
    expect(autoStepsAllowed({ keySource: 'community', autoSteps: false })).toBe(true);
    expect(autoStepsAllowed({ keySource: 'byok', autoSteps: false })).toBe(false);
    expect(autoStepsAllowed({ keySource: 'byok', autoSteps: true })).toBe(true);
    expect(autoStepsAllowed({ keySource: null, autoSteps: true })).toBe(false);
    expect(askModeOf({ wanted: true, autoAllowed: true })).toBe('auto');
    expect(askModeOf({ wanted: true, autoAllowed: false })).toBe('click');
    expect(askModeOf({ wanted: false, autoAllowed: true })).toBeNull();
  });

  test('a new key starts off: the save writes a whole new record and clears the profile mirror', () => {
    const admin = read('lib/firebase-admin.ts');
    const save = admin.slice(admin.indexOf('export async function saveOwnModelKey'), admin.indexOf('export interface OwnModelKey'));
    expect(save).toContain('tx.set(secretRef, {');
    expect(save).not.toMatch(/autoSteps: true/);
    expect(save).toContain('byokAutoSteps: FieldValue.delete(),');
  });

  test('the proxy refuses an automatic step on an own key with the switch off; the browser marks automatic steps', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain("const automatic = trigger === 'automatic';");
    expect(route).toMatch(/if \(automatic && ownKey && !ownKey\.autoSteps\) \{\s*return NextResponse\.json\(\{ error: autoStepsOffMessage\(PROVIDER_LABEL\[ownKey\.provider\]\), code: AUTO_STEPS_OFF_CODE \}, \{ status: 403 \}\);/);
    expect(AUTO_STEPS_OFF_CODE).toBe('own-key-auto-steps-off');
    expect(read('lib/gemini.ts')).toContain("...(options?.automatic ? { trigger: 'automatic' } : {}),");
    expect(read('hooks/usePlainWording.ts')).toContain('client.requestPlainWording(projectId, scope, digest, items, { automatic: true })');
    expect(read('hooks/useAutoProcessNaming.ts')).toContain('ask(projectId, source, true);');
    // The availability answer carries the switch; the screens read it.
    expect(read('app/api/model-stages/route.ts')).toContain("const autoSteps = keySource === 'community' || (ownKey !== null && ownKey.autoSteps);");
  });

  test('every automatic step reads the switch, and offers a click instead', () => {
    for (const f of ['components/workspace/WorkspaceProcess.tsx', 'components/workspace/RuleDecisionFlow.tsx', 'components/design/RuleQuestions.tsx', 'components/workspace/FirstLook.tsx']) {
      const src = read(f);
      expect(src, f).toContain('autoAllowed: availability.autoSteps,');
      expect(src, f).toContain('<AskOnClick askNow=');
    }
  });
});

// ── the per-provider switch-off (T01) ────────────────────────────────────────

test.describe('the operator can switch a provider off, without a fallback (T01)', () => {
  test('the variable names providers; unknown ids are ignored', () => {
    expect(suspendedProvidersOf(undefined)).toEqual([]);
    expect(suspendedProvidersOf('anthropic')).toEqual(['anthropic']);
    expect(suspendedProvidersOf(' Anthropic , gemini,openai')).toEqual(['gemini', 'anthropic']);
    const m = providerSuspendedMessage('anthropic');
    expect(m).toContain(PROVIDER_SUSPENDED_CODE);
    expect(m).toMatch(/no other provider or key was used instead/);
  });

  test('the proxy stops before any provider is called; save and test refuse; the availability says so', () => {
    const route = read('app/api/gemini/route.ts');
    const at = route.indexOf('if (suspendedProvidersOf(process.env[MODEL_PROVIDERS_SUSPENDED_ENV]).includes(provider))');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(route.indexOf('await callClaudeMessages('));
    expect(at).toBeLessThan(route.indexOf('ai!.models.generateContent('));
    for (const f of ['app/api/secrets/gemini/route.ts', 'app/api/secrets/gemini/test/route.ts']) {
      expect(read(f), f).toContain('suspendedProvidersOf(process.env[MODEL_PROVIDERS_SUSPENDED_ENV]).includes(provider)');
    }
    expect(read('app/api/model-stages/route.ts')).toContain('keyAvailable: keySource !== null && suspendedProvider === null');
  });
});

// ── the glossary assistant: an AI system, and its answers AI-generated ───────

test.describe('the glossary assistant says it is an AI system (Art. 50(1) AI Act)', () => {
  test('the notice is L3 word for word, with provider and model', () => {
    expect(aiAssistantNotice('Google Gemini', 'gemini-3.8-flash')).toBe(
      'You are chatting with an AI system. Answers are produced by a generative model (Google Gemini, gemini-3.8-flash); they are drafts, not professionally reviewed advice.',
    );
    expect(aiAssistantNoticeDe('Anthropic Claude', OWN_CLAUDE_MODEL)).toBe(
      `Sie schreiben mit einem KI-System. Die Antworten erzeugt ein generatives Modell (Anthropic Claude, ${OWN_CLAUDE_MODEL}); sie sind Entwürfe, kein fachlich geprüfter Rat.`,
    );
  });

  test('the panel shows it permanently at the input, and a model answer carries the AI-generated provenance', () => {
    const src = read('components/GlossaryChatbot.tsx');
    const notice = src.indexOf('data-chatbot-ai-notice=""');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(src.indexOf('{/* Message input */}'));
    expect(src).toContain("...(responseText ? { provenance: 'proposed' as const } : {}),");
    expect(src).not.toMatch(/Model proposal/);
  });
});

// ── rendered parts ───────────────────────────────────────────────────────────

test.describe('Settings and the chip, rendered', () => {
  const OUT = path.resolve(ROOT, 'tmp', 'byok-3021-spec', String(process.pid));
  let terms: Record<string, (props: any) => React.ReactElement | null>;
  let chip: { default: (props: any) => React.ReactElement; provenanceTitle: (v: string, o?: unknown) => string };

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, entry] of [
      ['OwnKeyTerms', path.resolve(ROOT, 'components', 'settings', 'OwnKeyTerms.tsx')],
      ['ProvenanceChip', path.resolve(ROOT, 'components', 'cc', 'ProvenanceChip.tsx')],
    ] as const) {
      await build({
        entryPoints: [entry],
        outfile: path.join(OUT, `${name}.cjs`),
        bundle: true,
        format: 'cjs',
        platform: 'node',
        jsx: 'automatic',
        external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
        alias: { '@': ROOT },
        logLevel: 'silent',
      });
    }
    terms = require(path.join(OUT, 'OwnKeyTerms.cjs'));
    chip = require(path.join(OUT, 'ProvenanceChip.cjs'));
  });

  test('the Anthropic notices (C3) and the Gemini tier notice (C4)', () => {
    const a = renderToStaticMarkup(React.createElement(terms.OwnKeyNotices, { provider: 'anthropic' }));
    expect(a).toContain('Requirement: a business account with Anthropic Ireland, Limited.');
    expect(a).toContain('10 % surcharge');
    expect(a).toContain('Delete key and end agreement');
    const g = renderToStaticMarkup(React.createElement(terms.OwnKeyNotices, { provider: 'gemini' }));
    expect(g).toContain('active Cloud Billing account');
    expect(g).not.toContain('Anthropic');
  });

  test('the acceptance box in the chosen language version, linking that wording', () => {
    const de = renderToStaticMarkup(React.createElement(terms.ByokAddendumAcceptance, { checked: false, language: 'de', onChange: () => {}, onLanguage: () => {} }));
    expect(de).toContain('lang="de"');
    expect(de).toContain('href="/terms/byok-addendum/de"');
    expect(de).toContain('Ich nehme die Zusatzvereinbarung');
    const en = renderToStaticMarkup(React.createElement(terms.ByokAddendumAcceptance, { checked: true, language: 'en', onChange: () => {}, onLanguage: () => {} }));
    expect(en).toContain('href="/terms/byok-addendum"');
    expect(en).toContain('I accept the Additional Agreement on Own Model Keys');
  });

  test('the automatic-steps switch: off by default, and not switchable on for an untested key', () => {
    const untested = renderToStaticMarkup(React.createElement(terms.OwnKeyAutoSteps, { provider: 'anthropic', checked: false, tested: false, onChange: () => {} }));
    expect(untested).toContain('data-own-key-auto-steps="off"');
    expect(untested).toContain('Automatic steps on my key');
    expect(untested).toContain('On your Anthropic Claude key they run only if you switch this on here.');
    expect(untested).toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
    const tested = renderToStaticMarkup(React.createElement(terms.OwnKeyAutoSteps, { provider: 'gemini', checked: false, tested: true, onChange: () => {} }));
    expect(tested).not.toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
  });

  test('the AI-generated chip names provider and model from the receipt; the engine\'s chips never name a model', () => {
    expect(chip.provenanceTitle('proposed', { provider: 'anthropic', modelId: OWN_CLAUDE_MODEL })).toBe(`Written by a language model, unchecked. Written by Anthropic Claude · ${OWN_CLAUDE_MODEL}.`);
    expect(chip.provenanceTitle('proposed', { provider: 'google-gemini', modelId: 'gemini-3.8-flash', automatic: true })).toMatch(/Google Gemini · gemini-3\.8-flash\. Generated automatically on opening\.$/);
    expect(chip.provenanceTitle('proposed', null)).toBe('Written by a language model, unchecked.');
    expect(chip.provenanceTitle('reconstructed', { provider: 'anthropic', modelId: 'x' })).not.toMatch(/Anthropic|Written by/);
    const html = renderToStaticMarkup(React.createElement(chip.default, { value: 'proposed', origin: { provider: 'anthropic', modelId: OWN_CLAUDE_MODEL } }));
    expect(html).toContain('AI-generated');
    expect(html).toContain(`title="Written by a language model, unchecked. Written by Anthropic Claude · ${OWN_CLAUDE_MODEL}."`);
    // The pen, never a sparkle.
    expect(read('components/cc/ProvenanceChip.tsx')).not.toMatch(/Sparkle/);
  });
});
