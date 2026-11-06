import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';
import { TERMS_DE } from '../lib/legal/texts/terms.de';
import { TERMS_EN } from '../lib/legal/texts/terms.en';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { openValue } from '../lib/legal/open-values';
import { aggregatePortfolio } from '../lib/portfolio/aggregate';
import { portfolioCsv } from '../lib/portfolio/export';
import { portfolioAccessOf } from '../lib/portfolio/access';
import { PORTFOLIO_EXPORT_NOTE } from '../lib/messages/portfolio';
import { wt } from '../lib/workspace-messages';
import { MODEL_STAGE_LABELS } from '../lib/model-stages';
import { NAMING_STAGE } from '../lib/process-naming';
import { PLAIN_WORDING_STAGE } from '../lib/plain-wording';

/**
 * The legal review of 05.11.2026, as far as the texts state a fact about the
 * product: each sentence added for it is held here against the code it
 * describes, in both languages. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('privacy section 3: bulk upload and portfolio', () => {
  test('the paragraph stands in both languages and names the export as not signed', () => {
    expect(PRIVACY_DE).toContain('Massen-Upload und Portfolio.');
    expect(PRIVACY_EN).toContain('Bulk upload and portfolio.');
    expect(PRIVACY_DE).toContain('sie ist nicht signiert, kein Audit-Paket und kein Nachweis, und das steht in der Datei selbst');
    expect(PRIVACY_EN).toContain('it is not signed, not an audit pack and not evidence, and the file itself says so');
  });

  test('the CSV says it in its first line, the workbook in its note', () => {
    const csv = portfolioCsv(aggregatePortfolio([]));
    const first = csv.split('\r\n')[0];
    expect(first).toBe(`"${PORTFOLIO_EXPORT_NOTE}"`);
    expect(PORTFOLIO_EXPORT_NOTE).toMatch(/Not signed, not an audit pack and not evidence/);
    expect(read('lib/portfolio/export.ts')).toMatch(/wb\.description = PORTFOLIO_EXPORT_NOTE/);
  });

  test('the bulk upload screen repeats the request to remove personal data before anything is chosen', () => {
    const src = read('components/portfolio/BatchRun.tsx');
    expect(src).toContain("wt('portfolio.cleanTitle')");
    expect(src).toContain("wt('portfolio.cleanLead')");
    // Before the drop zone, so it is read before a file is chosen.
    expect(src.indexOf('data-portfolio-clean-notice')).toBeLessThan(src.indexOf('data-portfolio-drop'));
    expect(wt('portfolio.cleanLead')).toMatch(/^Please do not upload personal data\./);
    // A request, never a claim of control (tests/terms-duties-guard.spec.ts).
    expect(wt('portfolio.cleanLead')).toMatch(/nothing in this upload removes personal data for you/);
  });

  test('the queue drops a source once its project exists, and on cancel', () => {
    const src = read('lib/portfolio/batch-store.ts');
    expect(src).toMatch(/writes\.update\(itemRef, \{ projectId, source: FieldValue\.delete\(\) \}\)/);
    expect(src).toMatch(/source: FieldValue\.delete\(\),/);
  });
});

test.describe('privacy section 8 and C12: what the portfolio overview shows', () => {
  test('the overview shows the projects; no invitation opens one', () => {
    // Fassung 1.1 (owner decision 06.11.2026): the set is fixed at sending, the figures are current.
    expect(PRIVACY_DE).toContain('Welche Projekte die Übersicht zeigt, legt der Stand beim Versand der Einladung fest:');
    expect(PRIVACY_EN).toContain('Which projects the overview shows is fixed by the state when the invitation is sent:');
    expect(PRIVACY_DE).toContain('Die Kennzahlen dieser Projekte berechnen wir bei jedem Aufruf aus ihrem aktuellen Stand; nichts in der Übersicht ist signiert.');
    expect(PRIVACY_EN).toContain('We compute the figures of these projects from their current state each time the overview is opened; nothing in the overview is signed.');
    expect(PRIVACY_DE).not.toContain('Die Einladung öffnet die Projekte');
    expect(PRIVACY_EN).not.toContain('The invitation opens the projects');
  });

  test('C12 names the kinds of findings, which the overview computes', () => {
    expect(CONSENT_TEXTS.portfolioInvitation.scope.de).toContain('die Arten der Befunde');
    expect(CONSENT_TEXTS.portfolioInvitation.scope.en).toContain('the kinds of findings');
    expect(aggregatePortfolio([])).toHaveProperty('kinds');
  });
});

test.describe('Terms 1.5, 4.1, 5.4 and 8', () => {
  test('1.5: bulk upload and portfolio only with an own key whose last check succeeded', () => {
    expect(TERMS_DE).toContain('dessen letzte Prüfung beim Anbieter gelungen ist (Ziffer 5.2)');
    expect(TERMS_EN).toContain('whose last check with the provider succeeded (section 5.2)');
    const closed = (f: Partial<Parameters<typeof portfolioAccessOf>[0]>) =>
      portfolioAccessOf({ byokAllowed: true, keyStored: true, testedAtMs: 1, rotatedAtMs: null, ...f }).open;
    expect(closed({})).toBe(true);
    expect(closed({ keyStored: false })).toBe(false);
    expect(closed({ testedAtMs: null })).toBe(false);
    // Every owner route of the portfolio goes through the gate; removing goes through 'manage', without a key.
    expect(read('lib/portfolio/access-server.ts')).toMatch(/if \(mode === 'use'\) \{\s*const access = await readPortfolioAccess/);
  });

  test('4.1: imported ATC results and usage data never reach the signed run', () => {
    expect(TERMS_DE).toContain('es wird diesen Befunden nicht gleichgestellt und fließt nie in den signierten Lauf ein');
    expect(TERMS_EN).toContain('it is not equated with those findings and never flows into the signed run');
    const run = read('app/api/runs/create/route.ts');
    expect(run).not.toMatch(/atcReport|usageReport|atcFindings/);
  });

  test('5.4 and privacy 3: the two automatic steps are the switches the texts name', () => {
    expect(NAMING_STAGE).toBe('naming');
    expect(PLAIN_WORDING_STAGE).toBe('statements');
    expect(MODEL_STAGE_LABELS.naming).toBe('Business names');
    expect(MODEL_STAGE_LABELS.statements).toBe('Business sentences');
    expect(read('components/ModelStagesCard.tsx')).toContain('title="Where the AI model is used"');
    // The server refuses a switched-off stage before any key is loaded, whoever's key it is.
    expect(read('app/api/gemini/route.ts')).toMatch(/if \(!modelStageEnabled\([^]*?STAGE_DISABLED_CODE/);
    for (const text of [PRIVACY_EN, TERMS_EN]) {
      expect(text).toContain('“Where the AI model is used”');
      expect(text).toContain('“Business names” and “Business sentences”');
    }
    for (const text of [PRIVACY_DE, TERMS_DE]) {
      expect(text).toContain('„Where the AI model is used“');
      expect(text).toContain('„Business names“ und „Business sentences“');
    }
  });

  test('5.4: the assistant, which has no switch, is named as the exception', () => {
    expect(TERMS_DE).toContain('er hat keinen eigenen Schalter');
    expect(TERMS_EN).toContain('it has no switch of its own');
    expect(read('components/GlossaryChatbot.tsx')).toMatch(/callGemini\(decision\.prompt, PRODUCT_GEMINI_MODEL, false, 'glossary'\)/);
  });

  test('8: repositories, third-party code and imported outputs; the model receives the code unmasked', () => {
    expect(TERMS_DE).toContain('ganze Repositorys, die Sie hochladen, einschließlich des darin enthaltenen Codes Dritter');
    expect(TERMS_EN).toContain('whole repositories you upload, including third-party code in them');
    expect(TERMS_DE).toContain('Ihr Vertrag mit SAP und die Regeln Ihrer Organisation erlauben');
    expect(TERMS_EN).toContain('your contract with SAP and the rules of your organisation permit');
    expect(TERMS_DE).toContain('geht Ihr Code unmaskiert');
    expect(TERMS_EN).toContain('receives your code unmasked');
    expect(PRIVACY_DE).toContain('an den Modellanbieter geht der Code unmaskiert');
    expect(PRIVACY_EN).toContain('the model provider receives the code unmasked');
  });
});

test.describe('processors: one name for Google Cloud data-processing terms', () => {
  test('the Cloud Data Processing Addendum, and no Firebase-only terms', () => {
    for (const text of [PRIVACY_DE, PRIVACY_EN, TRUST_EN]) {
      expect(text).toContain('Cloud Data Processing Addendum');
      expect(text).not.toMatch(/Firebase Data Processing and Security Terms/);
      expect(text).toContain('{{noFirebaseOutsideGoogleCloud}}');
    }
    const v = openValue('noFirebaseOutsideGoogleCloud');
    expect(v.kind).toBe('check');
    expect(v.ownerConfirmed).toBe(false);
  });

  test('the code uses no Firebase service beyond app, auth and Firestore', () => {
    const seen = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
          for (const m of read(rel).matchAll(/from ['"](firebase(?:-admin)?\/[a-z-]+)['"]/g)) seen.add(m[1]);
        }
      }
    };
    for (const dir of ['app', 'lib', 'components', 'hooks', 'scripts']) walk(dir);
    const allowed = ['firebase-admin/app', 'firebase-admin/auth', 'firebase-admin/firestore', 'firebase/app', 'firebase/auth', 'firebase/firestore'];
    expect([...seen].filter((m) => !allowed.includes(m))).toEqual([]);
    expect(seen.has('firebase/auth') && seen.has('firebase/firestore')).toBe(true);
    expect(Object.keys(JSON.parse(read('firebase.json'))).sort()).toEqual(['emulators', 'firestore']);
  });
});

test.describe('retention register: the old databases', () => {
  test('the deleted production database is no rules target any more, and the register says so', () => {
    const targets = JSON.parse(read('firebase.rules-all-dbs.json')).firestore.map((e: { database: string }) => e.database);
    expect(targets.some((d: string) => d.includes('e57d33e3'))).toBe(false);
    expect(targets).toContain('clean-core-eu');
    const register = read('docs/DATA-RETENTION.md');
    expect(register).toMatch(/`ai-studio-e57d33e3-…` in us-west1[^]*?\*\*deleted on 2026-11-05\*\*/);
    expect(register).toContain('`clean-core-prod` (europe-west1)');
  });
});
