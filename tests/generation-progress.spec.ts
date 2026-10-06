import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GENERATION_PHASES, enterGenerationPhase, formatElapsed, generationProgressAt } from '../lib/generation-progress';

/**
 * Owner report 06.10.2026: the Transformation bar stood at 95 % for the whole
 * model call and then jumped to done. These run the real curve.
 */
test.describe('generation progress', () => {
  test('a long model wait keeps moving and never reaches the end of its band', () => {
    const start = enterGenerationPhase(enterGenerationPhase(null, 'contract', 0), 'model', 1_000);
    let previous = generationProgressAt(start, 1_000);
    // Every 15 s for five minutes: strictly rising, below the band's end.
    for (let t = 16_000; t <= 301_000; t += 15_000) {
      const p = generationProgressAt(start, t);
      expect(p, `bar did not move at ${t} ms`).toBeGreaterThan(previous + 0.3);
      expect(p).toBeLessThan(GENERATION_PHASES.model.to);
      previous = p;
    }
    // Fourteen seconds in, the old timer showed 95 %. This is nowhere near it.
    expect(generationProgressAt(start, 15_000)).toBeLessThan(40);
  });

  test('the bar never moves backwards, also when the model is asked a second time', () => {
    let phase = enterGenerationPhase(null, 'contract', 0);
    const first = enterGenerationPhase(phase, 'model', 500);
    const before = generationProgressAt(first, 60_000);
    phase = enterGenerationPhase(first, 'model', 60_000);
    expect(generationProgressAt(phase, 60_000)).toBeCloseTo(before, 6);
    expect(generationProgressAt(phase, 70_000)).toBeGreaterThan(before);
    const checking = enterGenerationPhase(phase, 'checking', 70_000);
    expect(generationProgressAt(checking, 70_000)).toBeGreaterThanOrEqual(GENERATION_PHASES.checking.from);
    const storing = enterGenerationPhase(checking, 'storing', 70_100);
    expect(generationProgressAt(storing, 72_000)).toBeLessThan(100);
    expect(generationProgressAt(enterGenerationPhase(storing, 'done', 73_000), 73_000)).toBe(100);
  });

  test('elapsed time reads as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(42_900)).toBe('0:42');
    expect(formatElapsed(125_000)).toBe('2:05');
  });

  test('the transformation page draws its bar from the steps, not from a timer', () => {
    const src = readFileSync(join(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    expect(src).toContain('generationProgressAt(generationPhase, now)');
    expect(src).not.toMatch(/setProgress\(/);
    for (const key of ['contract', 'model', 'checking', 'storing', 'done']) {
      expect(src, `the page never enters "${key}"`).toMatch(new RegExp(`'${key}'`));
    }
  });
});
