import { resolveLegalSource } from './markup';
import type { LegalLang } from './open-values';

/**
 * The consent, confirmation and ending texts of Fassung 1.1 (C1–C11 of the
 * draft), German and English, as the product must show them.
 *
 * `{Name}` in single braces is a runtime value the screen or the mail fills in
 * ({E-Mail}, {Datum}, {Modell}, …). `{{key}}` in double braces is an open value
 * from `lib/legal/open-values.ts` and is resolved by `consentText()`.
 *
 * Where they are used in 3.0.21:
 * - C1 (sign-up dialog): `components/UserOnboarding.tsx`
 * - C2 (amendment dialog): `components/TermsReacceptGate.tsx`
 * - C3, C4, C6, C9 (Settings: own key, ending the agreement, community mail),
 *   C7 (deletion dialog), C5 (confirmation mail, acceptance test T03) and C11
 *   (suspension notice, T01) are the texts the Settings / own-key packages
 *   build against. C8 (AI marking) and C10 (invitation mail) live with their
 *   features.
 *
 * Removed against the draft, as the review (E14, E26, E27) says: the re-send
 * and the in-app display on a failed delivery of the confirmation mail, the
 * "Mir ist bekannt …" checkbox, the old consumer notice at the key field and
 * the old "Tarif"/"Beenden" notices of C3/C4.
 *
 * `tests/legal-texts-release-gate.spec.ts` checks these strings like the pages.
 */

type Bi = { de: string; en: string };

export const CONSENT_TEXTS = {
  /** C1 — sign-up dialog, acceptance of the Terms of Service. */
  signup: {
    noticeAbove: {
      de: 'Bitte lesen Sie beide Texte. Mit dem Klick unten schließen Sie einen Vertrag über die unentgeltliche Nutzung von Clean-Core.io; den vollständigen Wortlaut der Nutzungsbedingungen erhalten Sie anschließend per E-Mail.',
      en: 'Please read both texts. By clicking below you conclude a contract on the free use of Clean-Core.io; you will receive the full wording of the Terms by e-mail afterwards.',
    },
    privacyCheckbox: {
      de: 'Ich habe die Datenschutzerklärung (Stand {{releaseDate}}, Wortlaut: clean-core.io/datenschutz/de) zur Kenntnis genommen.',
      en: 'I have taken note of the Privacy Policy (version of {{releaseDate}}, wording: clean-core.io/datenschutz).',
    },
    termsCheckbox: {
      de: 'Ich nehme die Nutzungsbedingungen und Community-Richtlinien von Clean-Core.io (Fassung v2.3.0, deutsche Fassung, Wortlaut: clean-core.io/terms/de) an.',
      en: 'I accept the Clean-Core.io Terms of Service and Community Guidelines (version v2.3.0, English version, wording: clean-core.io/terms).',
    },
    noticeBelow: {
      de: 'Mit „Create my workspace“ geben Sie Ihr Angebot ab; Ihr Konto wird sofort freigeschaltet. Vertragssprache ist Deutsch; maßgeblich ist die deutsche Fassung v2.3.0, auch wenn Sie die Oberfläche später auf Englisch stellen. Sie erhalten eine Vertragsbestätigung an {E-Mail} mit dem vollständigen Wortlaut und dem Annahmezeitpunkt. Umfragen und Community-Mail erhalten Sie nur, wenn Sie sie später in den Einstellungen einschalten.',
      en: 'By clicking "Create my workspace" you make your offer; your account is activated immediately. The contract language is English; the English version v2.3.0 governs, even if you later switch the interface to German. You will receive a contract confirmation at {E-Mail} containing the full wording and the time of acceptance. You receive surveys and community mail only if you switch them on later in the settings.',
    },
    button: { de: 'Create my workspace', en: 'Create my workspace' },
  },

  /** C2 — amendment dialog at the next sign-in (Terms 10.2). The change list comes from `lib/terms-changes.ts`. */
  amendment: {
    lead: {
      de: 'Die Nutzungsbedingungen ändern sich zum {{termsEffectiveDate}} (Fassung {Fassung}). Was sich ändert und warum:',
      en: 'The Terms of Service change on {{termsEffectiveDate}} (version {Fassung}). What changes and why:',
    },
    afterList: {
      de: 'Vollständiger Wortlaut: clean-core.io/terms/de. Sie können die Änderung schon jetzt annehmen; wirksam wird sie für Sie erst am {{termsEffectiveDate}}. Bis dahin gilt die bisherige Fassung, und nehmen Sie nicht an, gilt sie auch danach weiter (Ziffer 10.3).',
      en: 'Full wording: clean-core.io/terms. You can accept the change now; it takes effect for you only on {{termsEffectiveDate}}. Until then the previous version applies, and if you do not accept, it continues to apply after that date as well (section 10.3).',
    },
    /** After the effective date: an acceptance then applies from the moment it is given (Terms 10.2). */
    afterListPastDate: {
      de: 'Vollständiger Wortlaut: clean-core.io/terms/de. Die Änderung ist seit dem {{termsEffectiveDate}} wirksam. Nehmen Sie sie an, gilt sie für Sie ab Ihrer Annahme; nehmen Sie nicht an, gilt für Sie die bisherige Fassung weiter (Ziffer 10.3).',
      en: 'Full wording: clean-core.io/terms. The change has been in effect since {{termsEffectiveDate}}. If you accept it, it applies to you from your acceptance; if you do not accept, the previous version continues to apply to you (section 10.3).',
    },
    checkbox: {
      de: 'Ich nehme die Nutzungsbedingungen in der Fassung {Fassung} (deutsche Fassung) mit Wirkung zum {{termsEffectiveDate}} an.',
      en: 'I accept the Terms of Service in version {Fassung} (English version) with effect from {{termsEffectiveDate}}.',
    },
    /** After the effective date there is no later date to name. */
    checkboxPastDate: {
      de: 'Ich nehme die Nutzungsbedingungen in der Fassung {Fassung} (deutsche Fassung) an.',
      en: 'I accept the Terms of Service in version {Fassung} (English version).',
    },
    accept: { de: 'Annehmen', en: 'Accept' },
    later: { de: 'Später entscheiden', en: 'Decide later' },
    notice: {
      de: 'Nach der Annahme erhalten Sie eine Bestätigung mit dem vollständigen Wortlaut und dem Wirksamkeitstag per E-Mail.',
      en: 'After acceptance you will receive a confirmation with the full wording and the effective date by e-mail.',
    },
  },

  /** C3 — dialog "Store your own Anthropic key", acceptance of the Additional Agreement. */
  anthropicKey: {
    title: { de: 'Eigenen Anthropic-Schlüssel hinterlegen', en: 'Store your own Anthropic key' },
    notices: [
      {
        de: 'Empfänger: Mit diesem Schlüssel gehen Ihr Code, die Befunde und die Anweisungen des Schritts an Anthropic Ireland, Limited — unter Ihrem eigenen Vertrag mit Anthropic, nicht unter einem Vertrag mit uns. Voraussetzung ist, dass Ihr Anthropic-Konto bei Anthropic Ireland, Limited geführt wird (Rechnungsadresse im EWR, in der Schweiz oder im Vereinigten Königreich).',
        en: 'Recipient: With this key your code, the findings and the step\'s instructions go to Anthropic Ireland, Limited — under your own contract with Anthropic, not under a contract with us. Your Anthropic account must be held with Anthropic Ireland, Limited (billing address in the EEA, Switzerland or the UK).',
      },
      {
        de: 'Außerhalb der EU: Wir rufen Anthropic mit der Datenregion „us“ auf; Ihre Anfrage wird nur in den USA verarbeitet, und ruhende Daten liegen nach Anthropics Angaben in den USA. Die Übermittlung in die USA nimmt Anthropic Ireland, Limited als Ihr Auftragsverarbeiter vor; Anthropic ist nicht unter dem EU-U.S. Data Privacy Framework zertifiziert.',
        en: 'Outside the EU: We call Anthropic with the data region "us"; your request is processed only in the United States, and data at rest is kept in the United States according to Anthropic. The transfer to the United States is made by Anthropic Ireland, Limited as your processor; Anthropic is not certified under the EU-U.S. Data Privacy Framework.',
      },
      {
        de: 'Ihr Vertrag mit Anthropic: Anthropic bietet seine API nur zur geschäftlichen Nutzung an. Hinterlegen Sie nur den Schlüssel eines Geschäftskontos mit Rechnungsadresse im EWR, in der Schweiz oder im Vereinigten Königreich – Sie finden sie in Ihrem Anthropic-Konto unter den Rechnungsangaben.',
        en: 'Your contract with Anthropic: Anthropic offers its API for business use only. Store only the key of a business account with a billing address in the EEA, Switzerland or the United Kingdom — you find it in your Anthropic account under the billing details.',
      },
      {
        de: 'Modell: Die Plattform ruft {{claudeModelId}} auf; jeder Schritt und die Modellquittung nennen es.',
        en: 'Model: The Platform calls {{claudeModelId}}; every stage and the model receipt name it.',
      },
      {
        de: 'Kosten: Entgelte des Modellanbieters entstehen in Ihrem eigenen Vertragsverhältnis mit diesem; wir berechnen und erstatten sie nicht. Für die Datenregion „us“ berechnet Anthropic einen Aufschlag von 10 % auf seinen Standardpreis, den Sie tragen. Die Plattform setzt keine Kostengrenze; setzen Sie eine in Ihrem Anthropic-Konto. Das kostenlose Kontingent gilt mit eigenem Schlüssel nicht.',
        en: 'Costs: Charges of the model provider arise in your own contractual relationship with that provider; we neither bill nor reimburse them. For the data region "us" Anthropic charges a 10 % surcharge on its standard price, which you bear. The Platform sets no cost limit; set one in your Anthropic account. The free quota does not apply with your own key.',
      },
      {
        de: 'Kein Rückfall: Scheitert Ihr Schlüssel oder setzen wir Anthropic aus, hält der Schritt an. Kein Aufruf geht auf den Plattform-Schlüssel.',
        en: 'No fallback: If your key fails or we suspend Anthropic, the step stops. No call goes to the platform key.',
      },
      {
        de: 'Automatische Schritte: Einige Schritte starten wir beim Öffnen eines Projekts selbst. Mit Ihrem Anthropic-Schlüssel laufen sie nur, wenn Sie das hier einschalten.',
        en: 'Automatic steps: We start some steps ourselves when a project is opened. On your Anthropic key they run only if you switch this on here.',
      },
      {
        de: 'Beenden: Sie beenden die Vereinbarung jederzeit mit „Schlüssel löschen und Vereinbarung beenden“ in den Einstellungen (Zwei-Faktor-Anmeldung erforderlich) oder mit einer Nachricht an info@clean-core.io; danach gilt wieder der Plattform-Schlüssel. Ihr Konto und Ihre Projekte bleiben.',
        en: 'Ending: You end the agreement at any time with "Delete key and end agreement" in the settings (two-factor sign-in required) or with a message to info@clean-core.io; the platform key then applies again. Your account and projects remain.',
      },
      {
        de: 'Nachweis: Wir halten Fassung, Sprache, Zeitpunkt und Hashwert Ihrer Annahme fest und senden Ihnen den vollständigen Wortlaut per E-Mail.',
        en: 'Record: We record version, language, time and digest of your acceptance and send you the full wording by e-mail.',
      },
    ],
    autoStepsSwitch: {
      de: 'Automatische Schritte mit meinem Schlüssel (Standard: aus)',
      en: 'Automatic steps on my key (default: off)',
    },
    fieldText: {
      de: 'Anthropic-API-Schlüssel – Entgelte des Modellanbieters entstehen in Ihrem eigenen Vertragsverhältnis mit Anthropic; wir berechnen und erstatten sie nicht. Wir rufen Anthropic mit der Datenregion „us“ auf (Aufschlag 10 % auf Anthropics Standardpreis, den Sie tragen). Voraussetzung: ein Geschäftskonto mit Rechnungsadresse im EWR, in der Schweiz oder im Vereinigten Königreich (Vertragspartnerin: Anthropic Ireland, Limited).',
      en: 'Anthropic API key — Charges of the model provider arise in your own contractual relationship with Anthropic; we neither bill nor reimburse them. We call Anthropic with the data region "us" (10 % surcharge on Anthropic\'s standard price, which you bear). Requirement: a business account with a billing address in the EEA, Switzerland or the UK (contracting party: Anthropic Ireland, Limited).',
    },
    modelDisplay: { de: 'Aufgerufenes Modell: {Modell}', en: 'Model called: {Modell}' },
    checkbox: {
      de: 'Ich nehme die Zusatzvereinbarung zu eigenen Modellschlüsseln (ZV-BYOK-1.0, Anthropic; vollständiger Wortlaut: clean-core.io/terms/byok-addendum/de) an.',
      en: 'I accept the Additional Agreement on Own Model Keys (ZV-BYOK-1.0, Anthropic; full wording: clean-core.io/terms/byok-addendum).',
    },
    save: { de: 'Speichern und Vereinbarung annehmen', en: 'Save and accept agreement' },
    cancel: { de: 'Abbrechen (es wird nichts gespeichert)', en: 'Cancel (nothing is stored)' },
    afterSave: {
      de: 'Schlüssel gespeichert und getestet (Modellliste abgerufen, kein Code übermittelt). Die Zusatzvereinbarung ZV-BYOK-1.0 (deutsche Fassung) gilt ab jetzt; die Bestätigung mit dem Wortlaut geht an {E-Mail}.',
      en: 'Key stored and tested (model list read, no code sent). The Additional Agreement ZV-BYOK-1.0 (English version) applies from now on; the confirmation with the wording goes to {E-Mail}.',
    },
    replacingGemini: {
      de: 'Sie ersetzen Ihren Gemini-Schlüssel; er wird gelöscht.',
      en: 'You are replacing your Gemini key; it will be deleted.',
    },
  },

  /** C4 — dialog "Store your own Google Gemini key" (no Additional Agreement). */
  geminiKey: {
    title: { de: 'Eigenen Google-Gemini-Schlüssel hinterlegen', en: 'Store your own Google Gemini key' },
    notices: [
      {
        de: 'Regeln: Für einen eigenen Gemini-Schlüssel gelten die Ziffern 5.2 bis 5.4 der Nutzungsbedingungen und die Datenschutzerklärung (Abschnitte 3 und 4). Eine Zusatzvereinbarung ist nicht nötig.',
        en: 'Rules: Your own Gemini key is governed by sections 5.2 to 5.4 of the Terms of Service and the Privacy Policy (sections 3 and 4). No additional agreement is needed.',
      },
      {
        de: 'Tarif: Verwenden Sie einen Schlüssel aus einem Google-Cloud-Projekt mit aktivem Cloud-Billing-Konto (kostenpflichtiger Tarif); nur dort nutzt Google Ihre Anfragen nicht zum Training, und eine befristete Protokollierung dient nur der Missbrauchserkennung und rechtlich vorgeschriebenen Offenlegungen. Für Nutzer im EWR, in der Schweiz und im Vereinigten Königreich wendet Google diese Regeln nach seinen Bedingungen (Stand 28.04.2026) auch auf das unentgeltliche Kontingent an; außerhalb dieser Regionen gelten ohne Billing-Konto Googles Free-Tier-Bedingungen (Nutzung zum Training, menschliche Prüfung).',
        en: 'Tier: Use a key from a Google Cloud project with an active Cloud Billing account (paid tier); only there does Google not use your requests for training, and limited logging serves only abuse detection and legally required disclosures. For users in the EEA, Switzerland and the UK, Google applies these rules under its terms (as of 28 April 2026) to the unpaid quota as well; outside those regions, without a billing account, Google\'s free-tier terms apply (use for training, human review).',
      },
      {
        de: 'Empfänger: Google verarbeitet Ihre Anfragen unter Ihrem eigenen Google-Konto und dessen Bedingungen. Welche Google-Gesellschaft Ihr Vertragspartner ist, richtet sich nach Ihrer Rechnungsadresse (Googles Entitätenübersicht: cloud.google.com/terms/google-entity). Wir sind Verantwortlicher für das Senden Ihrer Anfrage; Google ist Empfänger unter Ihrem Konto.',
        en: 'Recipient: Google processes your requests under your own Google account and its terms. Which Google entity is your contracting party depends on your billing address (Google\'s entity list: cloud.google.com/terms/google-entity). We are the controller for sending your request; Google is the recipient under your account.',
      },
      {
        de: 'Kosten: Entgelte des Modellanbieters entstehen in Ihrem eigenen Vertragsverhältnis mit diesem; wir berechnen und erstatten sie nicht. Die Plattform setzt keine Kostengrenze; setzen Sie eine in Ihrem Google-Cloud-Projekt. Das kostenlose Kontingent gilt mit eigenem Schlüssel nicht.',
        en: 'Costs: Charges of the model provider arise in your own contractual relationship with that provider; we neither bill nor reimburse them. The Platform sets no cost limit; set one in your Google Cloud project. The free quota does not apply with your own key.',
      },
      {
        de: 'Kein Rückfall: Scheitert Ihr Schlüssel, hält der Schritt an. Kein Aufruf geht auf den Plattform-Schlüssel.',
        en: 'No fallback: If your key fails, the step stops. No call goes to the platform key.',
      },
      {
        de: 'Automatische Schritte: Einige Schritte starten wir beim Öffnen eines Projekts selbst. Mit Ihrem Gemini-Schlüssel laufen sie nur, wenn Sie das hier einschalten.',
        en: 'Automatic steps: We start some steps ourselves when a project is opened. On your Gemini key they run only if you switch this on here.',
      },
      {
        de: 'Löschen: Sie löschen den Schlüssel jederzeit in den Einstellungen (Zwei-Faktor-Anmeldung erforderlich); danach gilt wieder der Plattform-Schlüssel.',
        en: 'Deleting: You delete the key at any time in the settings (two-factor sign-in required); the platform key then applies again.',
      },
    ],
    autoStepsSwitch: {
      de: 'Automatische Schritte mit meinem Schlüssel (Standard: aus)',
      en: 'Automatic steps on my key (default: off)',
    },
    fieldText: {
      de: 'Gemini-API-Schlüssel — Entgelte des Modellanbieters entstehen in Ihrem eigenen Vertragsverhältnis mit Google; wir berechnen und erstatten sie nicht. Das Google-Cloud-Projekt des Schlüssels muss ein aktives Cloud-Billing-Konto haben; sonst gelten Googles Free-Tier-Bedingungen (Nutzung zum Training, menschliche Prüfung). Ihr Google-Vertragspartner richtet sich nach Ihrer Rechnungsadresse (cloud.google.com/terms/google-entity).',
      en: 'Gemini API key — Charges of the model provider arise in your own contractual relationship with Google; we neither bill nor reimburse them. The key\'s Google Cloud project must have an active Cloud Billing account; otherwise Google\'s free-tier terms apply (use for training, human review). Your Google contracting entity depends on your billing address (cloud.google.com/terms/google-entity).',
    },
    modelDisplay: { de: 'Aufgerufenes Modell: {Modell}', en: 'Model called: {Modell}' },
    save: { de: 'Speichern', en: 'Save' },
    cancel: { de: 'Abbrechen (es wird nichts gespeichert)', en: 'Cancel (nothing is stored)' },
    afterSave: {
      de: 'Schlüssel gespeichert und getestet (Modellliste abgerufen, kein Code übermittelt). Modellgestützte Schritte laufen ab jetzt über Ihren Gemini-Schlüssel.',
      en: 'Key stored and tested (model list read, no code sent). Model-supported steps now run on your Gemini key.',
    },
    replacingAnthropic: {
      de: 'Sie ersetzen Ihren Anthropic-Schlüssel. Damit endet die Zusatzvereinbarung ZV-BYOK-1.0, und Ihr Anthropic-Schlüssel wird gelöscht; Sie erhalten eine Bestätigung per E-Mail.',
      en: 'You are replacing your Anthropic key. This ends the Additional Agreement ZV-BYOK-1.0 and deletes your Anthropic key; you will receive a confirmation by e-mail.',
    },
  },

  /** C5 — contract confirmation mail (Terms 1.3, ZV 12, Terms 10.2). Acceptance test T03. */
  confirmationMail: {
    subject: {
      de: 'Ihre Vertragsbestätigung — {Dokument} (deutsche Fassung)',
      en: 'Your contract confirmation — {Dokument} (English version)',
    },
    body: {
      de: 'Hallo {Vorname},\n\nhiermit bestätigen wir {Gegenstand}, den/die Sie am {Datum} um {Uhrzeit} (UTC) angenommen haben.{Wirksamkeit}\n\nAngenommene Fassung: {Fassung} · Sprache: Deutsch · SHA-256 des Wortlauts: {Hash} · Konto: {E-Mail} · Stelle der Annahme: {Stelle}\n\nDiese Sprachfassung ist für Sie maßgeblich; ein Wechsel der Oberflächensprache ändert daran nichts.\n\nDer vollständige Wortlaut steht unten in dieser E-Mail{{t03ConfirmationMail}}. Es ist derselbe Text, aus dem der Hashwert gebildet wurde; er bleibt mit diesem Hashwert unter {Adresse} veröffentlicht.\n\nDiese Bestätigung senden wir Ihnen nach {Grundlage}. Wir halten Fassung, Sprache, Zeitpunkt und Hashwert Ihrer Annahme in einem Nachweisprotokoll fest — ohne den Inhalt dieser E-Mail — und bewahren diesen Nachweis nach der Datenschutzerklärung (Abschnitte 5 und 6) bis zum Ende des dritten Kalenderjahres nach dem Vertragsende auf.\n\nBitte bewahren Sie diese E-Mail auf.\n\nFelix Frenzel · Hellerstraße 9 · 96047 Bamberg · info@clean-core.io\n\n— Vollständiger Wortlaut —\n{Wortlaut}',
      en: 'Hello {Vorname},\n\nThis confirms {Gegenstand}, which you accepted on {Datum} at {Uhrzeit} (UTC).{Wirksamkeit}\n\nAccepted version: {Fassung} · Language: English · SHA-256 of the wording: {Hash} · Account: {E-Mail} · Where accepted: {Stelle}\n\nThis language version governs for you; switching the interface language does not change that.\n\nThe full wording follows below in this e-mail{{t03ConfirmationMail}}. It is the same text from which the digest was computed; it remains published with that digest at {Adresse}.\n\nWe send this confirmation under {Grundlage}. We record version, language, time and digest of your acceptance in a proof log — without the content of this e-mail — and keep that record under the Privacy Policy (sections 5 and 6) until the end of the third calendar year after the contract ends.\n\nPlease keep this e-mail.\n\nFelix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany · info@clean-core.io\n\n— Full wording —\n{Wortlaut}',
    },

    /**
     * `{Wirksamkeit}` in the body after an amendment (Terms 10.2, G13/G14): the
     * day it takes effect when accepted early, else that it applies at once.
     * Empty for a sign-up and for the Additional Agreement.
     */
    effectiveOn: {
      de: ' Die Änderung wird für Sie am {Wirksamkeitstag} wirksam; bis dahin gilt für Sie die bisherige Fassung (Ziffer 10.2).',
      en: ' The amendment takes effect for you on {Wirksamkeitstag}; until then the previous version applies to you (section 10.2).',
    },
    effectiveNow: {
      de: ' Die Änderung gilt für Sie ab Ihrer Annahme (Ziffer 10.2).',
      en: ' The amendment applies to you from your acceptance (section 10.2).',
    },
  },

  /**
   * C12 — the invitation mail for a portfolio overview (Art. 14 GDPR) and its
   * unsubscribe (owner decision 23.10.2026: a portfolio invitation opens the
   * overview only — no project, no source code). Built by
   * `lib/portfolio/invitation-email.ts`; the mail goes out in English like the
   * project invitation (C10), the German text is the registry's.
   */
  portfolioInvitation: {
    scope: {
      de: 'Sie erhalten nur Lesezugriff auf die Übersicht des Portfolios – Kennzahlen über die darin aufgeführten Projekte: ihre Namen, Scores, Clean-Core-Stufen und Gruppen und die verwendeten SAP-Objekte. Kein Projekt und kein Quellcode wird dabei geöffnet.',
      en: 'You get read access to the portfolio overview only — figures across the listed projects: their names, scores, clean core levels and groups, and the SAP objects they use. No project and no source code is opened.',
    },
    about: {
      de: 'Clean-Core.io ist ein unentgeltliches Community-Werkzeug zur Analyse von SAP-ABAP-Code.',
      en: 'Clean-Core.io is a free community tool for analysing SAP ABAP code.',
    },
    unsubscribed: {
      de: 'Abgemeldet. An diese Adresse geht keine Einladung zu einem Projekt oder Portfolio mehr. Wir behalten dafür nur einen schlüsselbasierten Hashwert der Adresse auf einer Sperrliste.',
      en: 'Unsubscribed. No further invitation to a project or portfolio goes to this address. To honour that, we keep only a keyed hash of the address on a suppression list.',
    },
  },

  /** C6 — ending the Additional Agreement / deleting the key. */
  endAgreement: {
    displayAnthropic: {
      de: 'Eigener Schlüssel: Anthropic · Modell: {Modell} · Zusatzvereinbarung ZV-BYOK-1.0 (deutsche Fassung), angenommen am {Datum} · Wortlaut: clean-core.io/terms/byok-addendum/de',
      en: 'Own key: Anthropic · Model: {Modell} · Additional Agreement ZV-BYOK-1.0 (English version), accepted on {Datum} · Wording: clean-core.io/terms/byok-addendum',
    },
    buttonAnthropic: { de: 'Schlüssel löschen und Vereinbarung beenden', en: 'Delete key and end agreement' },
    displayGemini: {
      de: 'Eigener Schlüssel: Google Gemini · Modell: {Modell} · Es gelten die Ziffern 5.2 bis 5.4 der Nutzungsbedingungen.',
      en: 'Own key: Google Gemini · Model: {Modell} · Sections 5.2 to 5.4 of the Terms of Service apply.',
    },
    buttonGemini: { de: 'Schlüssel löschen', en: 'Delete key' },
    dialogAnthropicTitle: {
      de: 'Anthropic-Schlüssel löschen und Zusatzvereinbarung beenden',
      en: 'Delete Anthropic key and end the Additional Agreement',
    },
    dialogAnthropicText: {
      de: 'Damit beenden Sie die Zusatzvereinbarung ZV-BYOK-1.0 mit sofortiger Wirkung und löschen Ihren Anthropic-Schlüssel. Danach geht kein Aufruf mehr an Anthropic; modellgestützte Schritte laufen wieder über den Plattform-Schlüssel im Rahmen Ihres Kontingents, bis Sie einen anderen eigenen Schlüssel hinterlegen. Ihr Konto, Ihre Projekte und Ihr Nutzungsvertrag bleiben bestehen. Kopien des Schlüssels in verschlüsselten Sicherungen laufen binnen 30 Tagen aus. Was Anthropic bis jetzt erhalten hat, bewahrt es nach seinen Bedingungen auf. Zeitpunkt und Art der Beendigung halten wir im Nachweisprotokoll fest. Zur Bestätigung geben Sie den Code aus Ihrer Authenticator-App ein.',
      en: 'This ends the Additional Agreement ZV-BYOK-1.0 with immediate effect and deletes your Anthropic key. After that no call goes to Anthropic; model-supported steps run again on the platform key within your quota until you store another own key. Your account, your projects and your contract on the use of the Platform remain in place. Copies of the key in encrypted backups age out within 30 days. What Anthropic has received so far it keeps under its own terms. We record the time and kind of ending in the proof log. To confirm, enter the code from your authenticator app.',
    },
    afterAnthropic: {
      de: 'Ihr Anthropic-Schlüssel ist gelöscht; die Zusatzvereinbarung ist am {Datum} um {Uhrzeit} (UTC) beendet. Eine Bestätigung geht an {E-Mail}.',
      en: 'Your Anthropic key has been deleted; the Additional Agreement ended on {Datum} at {Uhrzeit} (UTC). A confirmation goes to {E-Mail}.',
    },
    dialogGeminiTitle: { de: 'Gemini-Schlüssel löschen', en: 'Delete Gemini key' },
    dialogGeminiText: {
      de: 'Damit löschen Sie Ihren Gemini-Schlüssel. Danach laufen modellgestützte Schritte wieder über den Plattform-Schlüssel im Rahmen Ihres Kontingents. Kopien in verschlüsselten Sicherungen laufen binnen 30 Tagen aus. Zur Bestätigung geben Sie den Code aus Ihrer Authenticator-App ein.',
      en: 'This deletes your Gemini key. Model-supported steps then run again on the platform key within your quota. Copies in encrypted backups age out within 30 days. To confirm, enter the code from your authenticator app.',
    },
    afterGemini: { de: 'Ihr Gemini-Schlüssel ist gelöscht.', en: 'Your Gemini key has been deleted.' },
    mailSubject: {
      de: 'Zusatzvereinbarung beendet — Anthropic-Schlüssel gelöscht — Clean-Core.io',
      en: 'Additional Agreement ended — Anthropic key deleted — Clean-Core.io',
    },
    mailBody: {
      de: 'Hallo {Vorname},\n\nIhre Zusatzvereinbarung zu eigenen Modellschlüsseln (ZV-BYOK-1.0, angenommen am {Datum der Annahme}) ist am {Datum} um {Uhrzeit} (UTC) beendet worden: {Grund}. Ihr Anthropic-Schlüssel ist gelöscht; es geht kein Aufruf mehr an Anthropic. Ihr Konto, Ihre Projekte und Ihr Nutzungsvertrag bleiben bestehen. Zeitpunkt und Art der Beendigung sind im Nachweisprotokoll festgehalten (Datenschutzerklärung, Abschnitte 5 und 6). Wir berechnen und erstatten keine Entgelte von Anthropic.\n\nFelix Frenzel · Hellerstraße 9 · 96047 Bamberg · info@clean-core.io',
      en: 'Hello {Vorname},\n\nYour Additional Agreement on Own Model Keys (ZV-BYOK-1.0, accepted on {Datum der Annahme}) ended on {Datum} at {Uhrzeit} (UTC): {Grund}. Your Anthropic key has been deleted; no further call goes to Anthropic. Your account, your projects and your contract on the use of the Platform remain in place. The time and kind of ending are recorded in the proof log (Privacy Policy, sections 5 and 6). We neither bill nor reimburse any Anthropic charges.\n\nFelix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany · info@clean-core.io',
    },
  },

  /** C7 — deletion dialog ("Danger Zone"), notice on the proof log. */
  accountDeletion: {
    title: { de: 'Konto endgültig löschen', en: 'Delete account permanently' },
    text: {
      de: 'Das Löschen Ihres Kontos kündigt Ihren Vertrag mit sofortiger Wirkung (Ziffer 2.3) und beendet eine bestehende Zusatzvereinbarung zu eigenen Modellschlüsseln.\n\nSofort gelöscht werden: Ihr Profil, alle Projekte und der darin enthaltene Quellcode, Analysen und signierte Läufe, Ihr eigener Modellschlüssel, Ihre S/4HANA-Verbindungsdaten, Ihr zweiter Faktor, Support-Anfragen, Umfrageantworten, Ihre Motivation und Ihre Anmeldung. Kopien in verschlüsselten Sicherungen laufen binnen 30 Tagen aus.\n\nWas die Löschung nicht erreicht: das Sicherheits-Protokoll administrativer Handlungen an Ihrem Konto (24 Monate); bereits versandte E-Mails (den Inhalt der Mail bewahrt unser Mailanbieter Resend nach seinen Aufbewahrungsregeln auf, derzeit {{resendRetentionDays}} nach dem Versand); was ein Modellanbieter nach seinen Bedingungen aufbewahrt hat; und Nachweise, nicht Daten: Im Nachweisprotokoll ersetzen wir Ihre Adresse durch einen schlüsselbasierten Hashwert und behalten — ohne Namen, Adresse, Code, Prompts, Schlüssel oder IP-Adresse — (1) welche Fassungen der Nutzungsbedingungen und gegebenenfalls der Zusatzvereinbarung Sie wann in welcher Sprache angenommen haben (mit dem Hashwert des Wortlauts) und das heutige Datum als Vertragsende, bis zum 31.12.{Jahr + 3}; (2) den Eintrag „Konto gelöscht am {Datum}“, drei Jahre; (3) Zustellnachweise unserer Mails an Sie (Art, Zeitpunkt, Message-ID, Status — kein Inhalt), 30 bis 90 Tage; (4) falls Sie Community-Mail oder Einladungen abbestellt haben, den Hashwert Ihrer Adresse auf der Sperrliste, unbefristet, damit wir Sie nicht erneut anschreiben. Jeder Eintrag trägt sein eigenes Löschdatum und wird automatisch gelöscht. Einzelheiten: Datenschutzerklärung, Abschnitte 5 und 6.{{proofLog}}\n\nExportieren Sie vorher, was Sie behalten möchten.',
      en: 'Deleting your account terminates your contract with immediate effect (section 2.3) and ends any Additional Agreement on Own Model Keys.\n\nDeleted immediately: your profile, all projects and the source code in them, analyses and signed runs, your own model key, your S/4HANA connection data, your second factor, support requests, survey answers, your motivation note and your sign-in. Copies in encrypted backups age out within 30 days.\n\nWhat deletion does not reach: the security audit record of administrative actions on your account (24 months); e-mails already sent (our mail provider Resend keeps the content of the mail under its retention rules, currently {{resendRetentionDays}} after sending); what a model provider has kept under its own terms; and proofs, not data: in the proof log we replace your address with a keyed hash and keep — without name, address, code, prompts, key or IP address — (1) which versions of the Terms of Service and, if applicable, the Additional Agreement you accepted, when and in which language (with the digest of the wording), and today\'s date as the end of the contract, until 31 December {Jahr + 3}; (2) the line "account deleted on {Datum}", three years; (3) delivery records of our mails to you (type, time, message id, status — no content), 30 to 90 days; (4) if you opted out of community mail or invitations, the hash of your address on the suppression list, without end, so that we do not mail you again. Every row carries its own deletion date and is deleted automatically. Details: Privacy Policy, sections 5 and 6.{{proofLog}}\n\nExport what you wish to keep first.',
    },
    checkbox: {
      de: 'Ich habe verstanden, dass meine Projekte und mein Quellcode unwiderruflich gelöscht werden.',
      en: 'I understand that my projects and my source code will be deleted irrevocably.',
    },
    confirm: { de: 'Konto endgültig löschen', en: 'Delete account permanently' },
    cancel: { de: 'Abbrechen', en: 'Cancel' },
  },

  /** C9 — opt-in for surveys and community mail; withdrawal (Art. 7(3) GDPR). */
  communityMail: {
    switchLabel: { de: 'Community-Mail und Umfragen', en: 'Community mail and surveys' },
    belowSwitch: {
      de: 'Aus. Wenn Sie einschalten, senden wir Ihnen gelegentlich Umfragen dazu, was wir als Nächstes bauen sollen, und Community-Neuigkeiten an {E-Mail} — sonst nichts. Das ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO); Sie können sie jederzeit mit Wirkung für die Zukunft widerrufen, mit diesem Schalter oder über den Abmeldelink in jeder dieser Mails (Art. 7 Abs. 3 DSGVO). Ob Sie einschalten, hat keinen Einfluss auf Ihren Zugang, Ihr Kontingent oder eine Funktion. Ohne diese Einwilligung nutzen wir Ihre Kontodaten nur, um den Dienst bereitzustellen. Wir speichern, wann Sie zuletzt ein- und ausgeschaltet haben. Schalten Sie aus, kommt ein schlüsselbasierter Hashwert Ihrer Adresse auf eine Sperrliste, die auch nach dem Löschen Ihres Kontos bleibt, damit wir Sie nicht erneut anschreiben.',
      en: 'Off. If you switch this on, we occasionally send surveys about what we should build next and community updates to {E-Mail} — nothing else. This is your consent (Art. 6(1)(a) GDPR); you can withdraw it at any time with effect for the future, with this switch or with the unsubscribe link in every such mail (Art. 7(3) GDPR). Whether you switch this on has no effect on your access, your quota or any function. Without this consent we use your account data only to provide the service. We store when you last switched it on and off. If you switch it off, a keyed hash of your address goes on a suppression list that remains after your account is deleted, so that we do not mail you again.',
    },
    statusOn: {
      de: 'Eingeschaltet am {Datum}. Sie können jederzeit widerrufen.',
      en: 'Switched on on {Datum}. You can withdraw at any time.',
    },
    statusOff: {
      de: 'Ausgeschaltet am {Datum}. Sie erhalten keine Community-Mail und keine Umfragen mehr.',
      en: 'Switched off on {Datum}. You will receive no more community mail or surveys.',
    },
    mailFooter: {
      de: 'Sie erhalten diese E-Mail, weil Sie am {Datum} in Ihren Kontoeinstellungen „Community-Mail und Umfragen“ eingeschaltet haben. Abmelden (Einwilligung widerrufen): {Link} — ein Klick genügt, wir fragen nicht nach dem Grund. Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · info@clean-core.io',
      en: 'You receive this e-mail because you switched on "Community mail and surveys" in your account settings on {Datum}. Unsubscribe (withdraw consent): {Link} — one click is enough, we do not ask why. Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany · info@clean-core.io',
    },
    unsubscribed: {
      de: 'Abgemeldet. Ihre Einwilligung ist widerrufen; Sie erhalten keine Community-Mail und keine Umfragen mehr. Der Schalter in Ihren Kontoeinstellungen ist ausgeschaltet. Sie können ihn dort jederzeit wieder einschalten.',
      en: 'Unsubscribed. Your consent is withdrawn; you will receive no more community mail or surveys. The switch in your account settings is off. You can switch it on again there at any time.',
    },
    surveyNotice: {
      de: 'Mit Ihrer Antwort willigen Sie ein, dass wir sie mit Ihrem Konto speichern, damit sie einmal zählt (Art. 6 Abs. 1 lit. a DSGVO). Sie können das jederzeit widerrufen — eine Zeile an info@clean-core.io genügt, dann löschen wir Ihre Antwort.',
      en: 'By answering you consent to our storing your answer with your account so that it counts once (Art. 6(1)(a) GDPR). You can withdraw at any time — one line to info@clean-core.io is enough, and we delete your answer.',
    },
  },

  /** C11 — notice when Anthropic is suspended (ZV clause 6; acceptance test T01). */
  anthropicSuspended: {
    notice: {
      de: 'Aufrufe an Anthropic sind seit dem {Datum} ausgesetzt: {Grund}. Ihr Schlüssel bleibt gespeichert; modellgestützte Schritte stehen nicht zur Verfügung, bis Sie den Schlüssel löschen oder die Grundlage wieder besteht. Wir weichen nicht auf einen anderen Anbieter aus (Zusatzvereinbarung, Ziffern 6 und 8). Die deterministische Analyse ist weiter nutzbar.',
      en: 'Calls to Anthropic have been suspended since {Datum}: {Grund}. Your key stays stored; model-supported steps are unavailable until you delete the key or the basis is restored. We do not switch to another provider (Additional Agreement, clauses 6 and 8). The deterministic analysis remains available.',
    },
    reasons: [
      {
        de: 'Anthropic Ireland, Limited ist nicht mehr Vertragspartnerin für Kunden im EWR',
        en: 'Anthropic Ireland, Limited is no longer the contracting entity for EEA customers',
      },
      { de: 'Anthropics Angaben zur Datenregion treffen nicht mehr zu', en: "Anthropic's statements on the data region no longer hold" },
      { de: 'eine verbindliche Entscheidung verlangt es', en: 'a binding decision requires it' },
    ],
  },
} as const satisfies Record<string, Record<string, Bi | readonly Bi[]>>;

/** One consent string in `lang`, with open values filled in. */
export function consentText(text: Bi, lang: LegalLang): string {
  return resolveLegalSource(text[lang], lang);
}

/** Every bilingual string of the registry — what the release gate reads. */
export function allConsentStrings(): Array<{ path: string; text: Bi }> {
  const out: Array<{ path: string; text: Bi }> = [];
  for (const [group, entries] of Object.entries(CONSENT_TEXTS)) {
    for (const [name, value] of Object.entries(entries)) {
      if (Array.isArray(value)) value.forEach((v, i) => out.push({ path: `${group}.${name}[${i}]`, text: v as Bi }));
      else out.push({ path: `${group}.${name}`, text: value as Bi });
    }
  }
  return out;
}
