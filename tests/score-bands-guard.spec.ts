import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  SCORE_BANDS,
  SCORE_BANDS_SOURCE,
  scoreBand,
  scoreBandsBullets,
  scoreBandsLine,
  scoreWithBand,
} from '../lib/clean-core-score';
import { buildBoardDeck } from '../lib/board-deck';

/**
 * Clean-Core.io's score bands are the official reading of a Clean Core Score
 * (owner decision 01.10.2026) — and they have exactly one source,
 * `lib/clean-core-score.ts`. This guard holds three lines:
 *
 *   1. No other file names a band, a band's range or a threshold of its own on
 *      the score. The product had three private readings before: the analyze
 *      dialog's tiers (100 / 90 / 85 / 0), a debt level at < 50 / < 75, and the
 *      Transformation stage's 90 / 70 wording. A reading written anywhere but
 *      the module is a second definition of a good score.
 *   2. Every surface that shows a score with a meaning reads it from the module
 *      — the stage, the score page, the exports, the Management view, the demo,
 *      the public reference pages and the texts machines read.
 *   3. The words: the bands are "Clean-Core.io's bands, derived from the
 *      deductions", never "guidance" that nobody sets.
 *
 * Pure source reading and the module's own functions; no server.
 */
const ROOT = path.resolve(__dirname, '..');
const MODULE = 'lib/clean-core-score.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = [...walk('app'), ...walk('components'), ...walk('lib'), ...walk('hooks')].filter((f) => f !== MODULE);
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Each band's label and range, as a literal another file might write. */
const BAND_WORDS = SCORE_BANDS.flatMap((b) => [
  new RegExp(`\\b${b.label}\\b`, 'i'),
  new RegExp(`\\b${b.from}\\s*[–-]\\s*${b.to}\\b`),
]);

test.describe('one source for the score bands', () => {
  test('the walk reads the app', () => {
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES).toContain('app/(app)/clean-core-score/page.tsx');
  });

  test('no file but the module names a band or its range', () => {
    const hits: string[] = [];
    for (const rel of FILES) {
      const src = read(rel);
      for (const re of BAND_WORDS) {
        const m = re.exec(src);
        if (m) hits.push(`${rel}: "${m[0]}"`);
      }
    }
    expect(hits, 'name the band through lib/clean-core-score.ts').toEqual([]);
  });

  test('no file puts a threshold of its own on the score', () => {
    // A comparison of a score variable with a number other than the 0–100 range check.
    const THRESHOLD = /\b(?:cleanCoreScore|signedCleanCoreScore|signedScore|currentScore|scoredCleanCore|scoreBefore)\s*(?:<=?|>=?)\s*(\d+)/g;
    const hits: string[] = [];
    for (const rel of FILES) {
      for (const m of read(rel).matchAll(THRESHOLD)) {
        if (m[1] === '0' || m[1] === '100') continue;
        hits.push(`${rel}: ${m[0]}`);
      }
    }
    expect(hits, 'read a score through scoreBand() instead').toEqual([]);
  });

  test('the guard bites on a band, a range and a threshold written elsewhere', () => {
    const named = (src: string) => BAND_WORDS.some((re) => re.test(src));
    expect(named(`const t = '${SCORE_BANDS[0].label}';`)).toBe(true);
    expect(named(`<span>${SCORE_BANDS[3].from}–${SCORE_BANDS[3].to}</span>`)).toBe(true);
    expect(named('const t = 42;')).toBe(false);
    const THRESHOLD = /\b(?:cleanCoreScore|currentScore)\s*(?:<=?|>=?)\s*(\d+)/;
    expect(THRESHOLD.test('x = currentScore >= 90 ? a : b')).toBe(true);
  });

  test('the old guidance wording is gone, the official one is in the module', () => {
    for (const rel of FILES) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/sets a pass mark|bands are guidance/i);
    }
    expect(SCORE_BANDS_SOURCE).toBe("Clean-Core.io's bands, derived from the deductions");
  });

  test('every surface that gives a score its meaning reads the module', () => {
    const SURFACES = [
      'app/(app)/project/[projectId]/analyze/page.tsx',
      'components/analyze/CleanCoreScoreSection.tsx',
      'components/analyze/AnalysisAnswer.tsx',
      'app/(app)/project/[projectId]/transformation/page.tsx',
      'app/(app)/clean-core-score/page.tsx',
      'lib/analysis-export.ts',
      'lib/board-deck.ts',
      'lib/handover.ts',
      'lib/management-answers.ts',
      'lib/management-overview.ts',
      'components/demo/DemoWorkspace.tsx',
      'app/facts/page.tsx',
      'app/whitepaper/page.tsx',
      'app/reference-analysis/page.tsx',
      'app/llms.txt/route.ts',
      'lib/chatbot-knowledge.ts',
    ];
    for (const rel of SURFACES) {
      expect(read(rel), `${rel} does not read lib/clean-core-score.ts`).toMatch(/from ['"](?:@\/lib|\.\.?(?:\/\.\.)*)?\/?(?:lib\/)?clean-core-score['"]/);
    }
  });
});

test.describe('the bands, as the surfaces say them', () => {
  test('a score with its band, in one line', () => {
    expect(scoreWithBand(28)).toBe(`28 of 100 · ${scoreBand(28).label.toLowerCase()} (5–59)`);
    expect(scoreWithBand(95)).toContain('(91–100)');
    expect(scoreBandsLine().split(' · ')).toHaveLength(SCORE_BANDS.length);
    expect(scoreBandsBullets().split('\n')).toHaveLength(SCORE_BANDS.length);
  });

  test('the board deck names the band of the signed score', () => {
    const deck = buildBoardDeck({
      project: { name: 'X', cleanCoreScore: 28, extensibilityRoute: 'Side-by-Side (SAP BTP)' } as never,
      findings: [],
    });
    const text = JSON.stringify(deck);
    expect(text).toContain(scoreBand(28).label.toLowerCase());
  });
});
