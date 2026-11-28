import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  DESIGN_AFTER_DECISION_FAILED,
  generateDraftLabel,
  providerCompanyOf,
  recordAndWriteDesignLabel,
  writeDesignHint,
} from '../lib/messages/model-consent';
import { START_REQUEST_TTL_MS, requestStartOnArrival, startRequested, takeStartRequest } from '../lib/start-request';

/**
 * Lawyer's statement 24c (3.5.4, owner 27.11.2026): the two model-calling buttons of the Decide page. Server-free: the
 * labels for a Google and an Anthropic key, the hint that says what is sent, the in-memory start and the guards that
 * keep "no model call on opening" true. The rendered half is `decide-no-start-on-open.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test.describe('the labels name the provider of the key actually used', () => {
  test('Google and Anthropic, and the generic provider before the key is known', () => {
    expect(recordAndWriteDesignLabel(providerCompanyOf('gemini'))).toBe('Record and write the design (sends answers to Google)');
    expect(recordAndWriteDesignLabel(providerCompanyOf('anthropic'))).toBe('Record and write the design (sends answers to Anthropic)');
    expect(recordAndWriteDesignLabel(null)).toBe('Record and write the design (sends answers to the AI provider)');
    expect(generateDraftLabel(providerCompanyOf('gemini'))).toBe('Generate draft (sends code to Google)');
    expect(generateDraftLabel(providerCompanyOf('anthropic'))).toBe('Generate draft (sends code to Anthropic)');
  });

  test('the hint says two model calls and what goes along, including that the narrative can quote code', () => {
    const hint = writeDesignHint('Anthropic');
    expect(hint).toBe(
      "Then the design is written: two model calls to Anthropic, with your answers and what the engine read from your code (rules with their values and lines, routine and SAP object names), and the run's analysis narrative where it has one, which can quote your code. AI-generated; not counted against your runs.",
    );
    // Never the wording that would be untrue for this prompt.
    expect(hint).not.toContain('no line of your code');
    expect(DESIGN_AFTER_DECISION_FAILED).toBe('Your decision is recorded. The design could not be written; open Design to try again.');
  });

  test('the design step makes exactly two model calls: the design and its non-functional proposals', () => {
    const design = code('app/(app)/project/[projectId]/design/page.tsx');
    expect(design.match(/callGemini\(/g)?.length).toBe(2);
    expect(design).toContain("callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'design')");
    expect(design).toContain("callGemini(nfrPrompt, PRODUCT_GEMINI_MODEL, true, 'design')");
  });
});

test.describe('the start a click hands on lives in memory only', () => {
  test('taken once, for its project and step only, and not after it expires', () => {
    requestStartOnArrival('p1', 'design', 1000);
    expect(startRequested('p1', 'design', 1001)).toBe(true);
    expect(startRequested('p2', 'design', 1001)).toBe(false);
    expect(takeStartRequest('p1', 'design', 1002)).toBe(true);
    expect(takeStartRequest('p1', 'design', 1003)).toBe(false);
    // QA review of 374ee7134c8e: another tool opening first ends the request; a later visit of the right one gets none.
    requestStartOnArrival('p1', 'design', 2000);
    expect(takeStartRequest('p2', 'design', 2001)).toBe(false);
    expect(takeStartRequest('p1', 'design', 2002)).toBe(false);
    requestStartOnArrival('p1', 'design', 3000);
    expect(takeStartRequest('p1', 'transformation', 3001)).toBe(false);
    expect(takeStartRequest('p1', 'design', 3002)).toBe(false);
    requestStartOnArrival('p1', 'transformation', 0);
    expect(takeStartRequest('p1', 'transformation', START_REQUEST_TTL_MS + 1)).toBe(false);
  });

  test('nothing carries it through the address or storage', () => {
    const lib = code('lib/start-request.ts');
    expect(lib).not.toMatch(/window|location|history|localStorage|sessionStorage|indexedDB|document\.cookie|URLSearchParams|fetch\(/);
    for (const rel of ['app/(app)/project/[projectId]/transformation/page.tsx', 'app/(app)/project/[projectId]/design/page.tsx']) {
      const src = code(rel);
      expect(src, rel).not.toMatch(/searchParams\.get\(['"](generate|start|write)['"]\)/);
      expect(src.match(/takeStartRequest\(/g)?.length, rel).toBe(1);
    }
    const decide = code('components/redesign/RedesignPage.tsx');
    // The clicks that hand a start on navigate inside the app (the module survives) and add nothing to the address.
    expect(decide).toContain("requestStartOnArrival(projectId, 'transformation');\n            router.push(`${base}/transformation`);");
    expect(decide).toContain("requestStartOnArrival(projectId, 'design');\n        router.push(`${base}/design?view=business`);");
    expect(decide).not.toMatch(/transformation\?generate|#generate/);
  });

  test('Transformation takes it only where its own button could start, through the same start', () => {
    const src = code('app/(app)/project/[projectId]/transformation/page.tsx');
    // Taken once the page has settled, then started only where its own button could start.
    expect(src).toMatch(/if \(!project \|\| busy \|\| !signedInUid \|\| evidencePending \|\| !modelAvailability\.known \|\| planPending\) return;\s*if \(!takeStartRequest\(projectId as string, 'transformation'\)\) return;\s*if \(!canStart \|\| busy \|\| files\.length > 0\) return;\s*startGeneration\(\);/);
    const design = code('app/(app)/project/[projectId]/design/page.tsx');
    expect(design).toMatch(/if \(!takeStartRequest\(projectId as string, 'design'\)\) return;\s*if \(!isOwner \|\| generating \|\| elsewhereSince !== null \|\| design\) return;\s*setStartedFromDecision\(true\);\s*regenerate\(\);/);
    expect(design).toContain('headline={startedFromDecision ? DESIGN_AFTER_DECISION_FAILED');
  });

  test('the Rebuild dialog: write and record, or record only; with the design model off only "Record the decision"', () => {
    const decide = code('components/redesign/RedesignPage.tsx');
    expect(decide).toContain("const writesDesign = choice === 'rebuild' && canDecide && availability.enabled('design');");
    expect(decide).toContain("confirmLabel={writesDesign ? recordAndWriteDesignLabel(company) : 'Record the decision'}");
    expect(decide).toContain("secondary={writesDesign ? { label: 'Record only', onClick: () => void record(false) } : undefined}");
    // The mock-up's green primary in the dialog, as in the bar; "Record only" stays secondary (owner 27.11.2026).
    expect(decide).toMatch(/confirmLabel=\{writesDesign[^\n]*\n[^\n]*\n\s*confirmVariant="primary"/);
    expect(code('components/cc/MessageBox.tsx')).toContain("confirmVariant === 'primary' ? 'primary' : 'dark'");
    expect(decide).toContain('footnote={writesDesign ? <span data-decide-model-hint="">{writeDesignHint(company)}</span> : undefined}');
  });
});
