import { test, expect } from './helpers/test';
import { LEGAL_DOCUMENTS } from '../lib/legal/documents';
import { parseLegalSource, blockText } from '../lib/legal/markup';
import { openValue } from '../lib/legal/open-values';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';

/**
 * The text side of the acceptance cases T01–T08 of the legal review.
 *
 * The cases themselves are product behaviour and are built and accepted by the
 * packages that own it (the own-key package for T01 and T03, the proof-log work
 * for T05/T06, …). What the texts must guarantee is narrower: a sentence that
 * promises one of these functions can only go live together with the owner's
 * confirmation that the function exists. So every block that makes such a
 * promise carries the open value of its case, and the release gate
 * (`legal-texts-release-gate.spec.ts`) keeps it from going live unconfirmed.
 *
 * T04 (the withdrawal function) was dropped with the right of withdrawal
 * (operator decision 17.10.2026): no text may promise one.
 */

type Case = { id: string; key: string; promises: RegExp[] };

const CASES: Case[] = [
  {
    id: 'T01 per-provider switch-off without fallback',
    key: 'providerSwitchOff',
    promises: [/stops calling that provider|stops calling Anthropic|stop calling that provider|stellt der Betreiber Aufrufe an (?:diesen Anbieter|Anthropic) ein|rufen wir diesen Anbieter nicht mehr auf/],
  },
  {
    id: 'T02 the accepted language version is recorded',
    key: 't02AcceptedLanguage',
    promises: [/your account records both|Ihr Konto hält beides fest/],
  },
  {
    id: 'T03 the Additional Agreement is accepted, recorded and archived',
    key: 't03AdditionalAgreementAcceptance',
    promises: [/at least version v2\.3\.0|mindestens Fassung v2\.3\.0/, /accept the version of this agreement in force at that time anew|nehmen Sie die dann geltende Fassung dieser Vereinbarung erneut an/],
  },
  {
    id: 'T03 the confirmation mail with version, language, time and digest',
    key: 't03ConfirmationMail',
    promises: [/The confirmation serves as a record for both sides|Die Bestätigung dient dem Nachweis für beide Seiten/],
  },
  {
    id: 'T05/T06 the proof log with per-entry deletion and the nightly purge',
    key: 'proofLog',
    promises: [/until the end of the third calendar year after the contract ended(?!.*\(§§ 195, 199 BGB\), then deleted automatically)/],
  },
  {
    id: 'T07 receipt, examination, reasoned decision for reports',
    key: 't07ReportingProcess',
    promises: [/This procedure is a voluntary standard of the operator|Dieses Verfahren ist ein freiwilliger Standard des Betreibers/],
  },
  {
    id: 'T08 AI marking and the manifest of the delivery package',
    key: 'aiMarkingManifest',
    promises: [/can be established with the offline verifier|lässt sich mit dem Offline-Prüfer feststellen/],
  },
];

const RAW_BLOCKS: Array<{ where: string; text: string }> = [
  ...LEGAL_DOCUMENTS.flatMap((d) => parseLegalSource(d.source).map((b) => ({ where: `${d.id}.${d.lang}`, text: blockText(b) }))),
  ...parseLegalSource(TRUST_EN).map((b) => ({ where: 'trust.en', text: blockText(b) })),
];

for (const c of CASES) {
  test(`${c.id}: every promise carries its open value`, () => {
    const v = openValue(c.key);
    expect(v.kind, `${c.key} is not a confirmation`).toBe('check');
    let promised = 0;
    for (const b of RAW_BLOCKS) {
      if (!c.promises.some((p) => p.test(b.text))) continue;
      promised++;
      expect(b.text, `${b.where}: "${b.text.slice(0, 100)}…" promises ${c.id} without {{${c.key}}}`).toContain(`{{${c.key}}}`);
    }
    expect(promised, `no text makes the promise of ${c.id} any more — check the patterns`).toBeGreaterThan(0);
  });
}

test('T04 was dropped: no text promises a withdrawal function', () => {
  const all = [...RAW_BLOCKS.map((b) => b.text), ...Object.values(CONSENT_TEXTS).flatMap((g) => Object.values(g).flatMap((v) => (Array.isArray(v) ? v : [v])).flatMap((x) => [x.de, x.en]))].join('\n');
  expect(all).not.toMatch(/withdrawal function|Widerrufsfunktion|Withdraw from contract|Vertrag widerrufen|Muster-Widerrufsformular|model withdrawal form/i);
});
