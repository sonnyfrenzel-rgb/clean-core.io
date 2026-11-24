import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { foldText, sentencesOf, wordCount, MIN_REST_WORDS } from '../lib/text-fold';
import { ANALYSIS_LENGTH_RULE, buildAnalysisPrompt } from '../lib/analysis-prompt';
import { DEMO_QUOTA_NOTICE, DEMO_STRIP_NOTICE, DEMO_UNSIGNED_NOTICE, DEMO_UNSIGNED_WHY } from '../lib/demo-marks';

/**
 * Short on top, complete underneath (owner feedback 24.11.2026: the texts are too long, and no content may go
 * missing). `lib/text-fold.ts` splits a long paragraph for `components/FoldedText.tsx`; these hold that it never
 * loses or rewords a word, and that the places which fold say so in their source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The router's rationale for the demo program, as the engine wrote it on 24.11.2026 (16 sentences, 418 words). */
const RATIONALE =
  'Detected 2 write(s) to custom database persistence. In SAP Cloud ERP Private this is on-stack developer extensibility, ' +
  'not a reason to leave the stack: the table is a Dictionary object in the customer namespace and a RAP business object is ' +
  "built on it. Writing to your own table is not a clean core violation — writing to SAP's is. The explicit COMMIT WORK (2×) " +
  'conflicts with the RAP transaction lifecycle, e.g. a save in the wrong phase. Catalog 2024.FPS02 names no successor.';

test.describe('foldText', () => {
  test('keeps every word: lead and rest together are the paragraph', () => {
    const f = foldText(RATIONALE);
    expect(f.rest).not.toBeNull();
    expect(`${f.lead} ${f.rest}`).toBe(RATIONALE.replace(/\s+/g, ' ').trim());
    expect(sentencesOf(f.lead)).toHaveLength(2);
    expect(f.restSentences).toBe(sentencesOf(RATIONALE).length - 2);
  });

  test('does not split inside "e.g.", a version like 2024.FPS02 or "(2×)."', () => {
    const s = sentencesOf(RATIONALE);
    expect(s).toHaveLength(5);
    expect(s[3]).toContain('e.g. a save in the wrong phase.');
    expect(s[4]).toBe('Catalog 2024.FPS02 names no successor.');
  });

  test('a short paragraph, or a rest too short to be worth a fold, stands whole', () => {
    expect(foldText('One sentence. Two sentences.')).toEqual({ lead: 'One sentence. Two sentences.', rest: null, restSentences: 0 });
    const shortRest = 'First sentence here. Second sentence here. Third is short.';
    expect(wordCount('Third is short.')).toBeLessThan(MIN_REST_WORDS);
    expect(foldText(shortRest).rest).toBeNull();
  });

  test('one sentence on top when asked', () => {
    const f = foldText(RATIONALE, 1);
    expect(f.lead).toBe('Detected 2 write(s) to custom database persistence.');
  });
});

test.describe('where the product folds', () => {
  test('the route rationale, the checkpoint evaluation and the IT and rule leads use FoldedText', () => {
    expect(read('components/analyze/RouteCard.tsx')).toMatch(/<FoldedText text=\{rationale\}/);
    expect(read('components/analyze/ExtensibilityDecisionMatrix.tsx')).toMatch(/<FoldedText[^>]*evaluation/);
    const it = read('components/workspace/ItAnswers.tsx');
    expect(it).toMatch(/text=\{wt\('itv\.objectsLead'\)\}/);
    expect(it).toMatch(/text=\{wt\('itv\.typesLead'\)\}/);
    expect(read('components/workspace/RuleDecisionFlow.tsx')).toMatch(/<FoldedText[\s\S]*rules\.flowLead/);
  });

  test('FoldedText folds with the one disclosure of the product, so the rest stays in the document and on paper', () => {
    const src = read('components/FoldedText.tsx');
    expect(src).toContain("import CcDisclosure from '@/components/cc/Disclosure'");
    expect(src).not.toMatch(/line-clamp|slice\(|substring\(/);
  });
});

test.describe('the demo strip: short on top, complete underneath', () => {
  test('on top: what it is, nothing saved, never signed — in at most 40 words', () => {
    expect(DEMO_STRIP_NOTICE).toContain('Demo project');
    expect(DEMO_STRIP_NOTICE).toContain('Nothing you do here is saved');
    expect(DEMO_UNSIGNED_NOTICE).toContain('never signed');
    expect(wordCount(DEMO_STRIP_NOTICE) + wordCount(DEMO_UNSIGNED_NOTICE)).toBeLessThanOrEqual(40);
  });

  test('underneath, not removed: why it is unsigned and that it costs no run', () => {
    const about = read('components/demo/DemoAbout.tsx');
    expect(about).toContain('DEMO_UNSIGNED_WHY');
    expect(about).toContain('DEMO_QUOTA_NOTICE');
    expect(DEMO_UNSIGNED_WHY).toContain('named account analyzed a named source');
    expect(DEMO_QUOTA_NOTICE).toContain('five free analysis runs');
    for (const f of ['DemoWorkspace', 'DemoAnalyzeBusiness', 'DemoWorkspaceShell', 'DemoRedesign']) {
      expect(read(`components/demo/${f}.tsx`), f).toContain('<DemoAbout />');
    }
  });
});

test.describe('length budgets for new model texts', () => {
  test('the analysis prompt carries the budgets', () => {
    const prompt = buildAnalysisPrompt({
      targetDeployment: 'private',
      evidenceReport: { findings: [] } as never,
      routeReport: {
        recommendedRoute: 'x', confidenceScore: 1, rationale: 'r', targetArtifact: 't', checkpoints: [], comparativeAnalysis: {}, cleanCoreScore: 50,
      } as never,
      code: 'REPORT z.',
    });
    expect(prompt).toContain(ANALYSIS_LENGTH_RULE);
    expect(prompt).toMatch(/summary: string; \/\/ Plain english business executive summary, at most 3 sentences and 60 words/);
    expect(prompt).toMatch(/strategicNextSteps: string\[\]; \/\/ At most 5 steps/);
  });

  test('the design, statement and SOP prompts carry theirs', () => {
    expect(read('app/(app)/project/[projectId]/design/page.tsx').match(/2-3 sentences and at most 70 words/g)).toHaveLength(2);
    expect(read('lib/business-statement-prompt.ts')).toContain('aim for at most 25 words');
    expect(read('lib/business-sop-prompt.ts')).toContain('Each claim at most 25 words');
  });
});
