/**
 * Two findings of the b88c77b audit that survived verification at the line, and
 * the rule that keeps them fixed.
 *
 * Both are the same mistake in different clothes: a place where the code looked
 * at something dangerous and decided not to say so.
 *
 *   - `evidence-model.ts` carried `&& !/AIzaSy/i.test(text)` on the
 *     hardcoded-value detector. A statement holding a Google API key *and* a
 *     hardcoded path produced no finding at all — the one literal that is
 *     unambiguously a secret was the one that silenced the detector
 *     (SEC-b88c77b-36).
 *   - `ConstructFindings.tsx` put `finding.howItWorks` — a value the analysis
 *     model supplies — straight into an `href`. React renders a `javascript:`
 *     href with nothing but a developer warning, and a click runs it. The same
 *     shape was fixed in the presentation viewer as SEC-2026-152 (f9f4ac1);
 *     this was the second site (SEC-b88c77b-148).
 *
 * Both blocks below fail on the behaviour as it was.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { safeHttpHref } from '../lib/export-safety';

const KEY = `AIzaSy${'B'.repeat(33)}`;

test.describe('a credential in the source is reported as one', () => {
  test('a hardcoded Google key is a Critical finding, and its value is not echoed', () => {
    const source = [
      'REPORT z_key.',
      `DATA lv_key TYPE string VALUE '${KEY}'.`,
      'START-OF-SELECTION.',
      '  WRITE lv_key.',
    ].join('\n');
    const findings = buildAbapEvidence(source, 'z_key.abap').findings;
    const credential = findings.find((f) => f.objectType === 'Credential');
    expect(credential, 'a hardcoded API key produced no finding').toBeTruthy();
    expect(credential!.severity).toBe('Critical');
    // A report that quotes the secret spreads it to everyone the report reaches.
    const everything = JSON.stringify(findings);
    expect(everything, 'the finding reproduced the key it reports').not.toContain(KEY);
  });

  test('the key no longer silences the hardcoded-value detector beside it', () => {
    // The exact shape the exclusion swallowed: one statement, a key and a path.
    const source = [
      'REPORT z_both.',
      `DATA lv_cfg TYPE string VALUE '${KEY}'.`,
      "DATA lv_path TYPE string VALUE 'C:\\interface\\out.txt'.",
      'START-OF-SELECTION.',
      '  WRITE lv_path.',
    ].join('\n');
    const kinds = buildAbapEvidence(source, 'z_both.abap').findings.filter((f) => f.kind === 'hardcoded-value');
    expect(kinds.length, 'the key and the path did not both produce a finding').toBeGreaterThanOrEqual(2);
  });

  test('the exclusion is gone from the source, not merely out-voted', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'lib', 'abap', 'evidence-model.ts'), 'utf8');
    // Comments are stripped first, because the paragraph that explains the
    // removal quotes the removed expression — a guard that reads prose finds
    // its own explanation and goes red for it. (The same trap caught the
    // gitleaks allowlist on the same day: an allowlist that must allowlist its
    // own comment. Match code, not the story about the code.)
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    expect(code, 'the hardcoded-value detector excludes API keys again').not.toMatch(/&&\s*!\/AIzaSy/);
    // And the removal is only meaningful if the detector is still there.
    expect(code).toMatch(/C:\\\\\|PRD\|CLNT\|SYS/);
  });
});

test.describe('a model-supplied link reaches an anchor only as http(s)', () => {
  test('the component runs every href through safeHttpHref', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'analyze', 'ConstructFindings.tsx'), 'utf8');
    expect(src).toContain("import { safeHttpHref } from '@/lib/export-safety'");
    const hrefs = src.match(/href=\{[^}]+\}/g) ?? [];
    expect(hrefs.length, 'the component has no href to guard — this guard would be vacuous').toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `${href} takes a value that was never checked`).toContain('safeHttpHref(');
    }
  });

  test('and the helper refuses what a model can invent', () => {
    for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox', 'file:///etc/passwd', 'not a url at all', '']) {
      expect(safeHttpHref(bad), `${bad} passed`).toBe('');
    }
    expect(safeHttpHref('https://help.sap.com/x')).toBe('https://help.sap.com/x');
  });
});
