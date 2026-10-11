import { expect, type Page } from '@playwright/test';
import { SCORE_FLOOR, scoreBand } from '../../lib/clean-core-score';
import { editionName, type Edition } from '../../lib/score-hero';

/**
 * The Analyze score hero (ADR-093) as a reader sees it, read off the rendered
 * page — not off `lib/score-hero.ts`. A row's points are the text it shows
 * ("−23"), its places are the line chips a wide screen draws ("L246"), so the
 * arithmetic below is the page's own and would catch a table that renders other
 * figures than the module computes, drops a row, or sorts it differently.
 *
 * Used by the demo's Analyze page and by a signed run's (QA review of
 * 11e3bc7d90e8, a3bcd7349a13 / 436b28c54a9a).
 */
export interface RenderedHero {
  deductions: Array<{ kind: string; points: number; chips: string[]; label: string }>;
  free: { count: number; points: number; chips: string[] } | null;
  codeSubtotal: { attr: number; points: number } | null;
  notAssessed: { kinds: number; points: number } | null;
  total: { attr: number; points: number; label: string } | null;
  sum: string | null;
  largest: string | null;
  figure: string | null;
}

export async function readScoreHero(page: Page): Promise<RenderedHero> {
  return page.evaluate(() => {
    const num = (text: string | null | undefined): number => {
      const m = /([−-]?)(\d+)/.exec(text ?? '');
      if (!m) return Number.NaN;
      return (m[1] ? -1 : 1) * Number(m[2]);
    };
    // A row's last cell is its points.
    const points = (li: Element) => num(li.lastElementChild?.textContent);
    // The chips a reader sees at this width (the phone's copy is display:none).
    const chips = (li: Element) =>
      Array.from(li.querySelectorAll<HTMLElement>('[data-cc-anchor]'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => (el.textContent ?? '').trim());
    const one = (sel: string) => document.querySelector(`[data-analysis-answer] ${sel}`);
    const free = one('li[data-score-free-own-writes]');
    const sub = one('li[data-score-code-subtotal]');
    const nd = one('li[data-score-not-determined]');
    const total = one('li[data-score-total]');
    return {
      deductions: Array.from(document.querySelectorAll('[data-analysis-answer] li[data-score-deduction]')).map((li) => ({
        kind: li.getAttribute('data-score-deduction') ?? '',
        points: points(li),
        chips: chips(li),
        label: (li.firstElementChild?.firstElementChild?.textContent ?? '').trim(),
      })),
      free: free ? { count: Number(free.getAttribute('data-score-free-own-writes')), points: points(free), chips: chips(free) } : null,
      codeSubtotal: sub ? { attr: Number(sub.getAttribute('data-score-code-subtotal')), points: points(sub) } : null,
      notAssessed: nd ? { kinds: Number(nd.getAttribute('data-score-not-determined')), points: points(nd) } : null,
      total: total
        ? { attr: Number(total.getAttribute('data-score-total')), points: points(total), label: (total.firstElementChild?.textContent ?? '').trim() }
        : null,
      sum: one('[data-score-sum]')?.textContent ?? null,
      largest: one('[data-score-largest]')?.getAttribute('data-score-largest') ?? null,
      figure: one('[data-analyze-score-value]')?.textContent?.trim() ?? null,
    };
  });
}

/**
 * Holds the hero to its promise: every deduction row, largest first, each with
 * the source lines it was counted from, and the rows sum exactly to the signed
 * score shown in the figure; the band and the other edition's sentence agree.
 */
export async function expectScoreHeroAddsUp(
  page: Page,
  expected: { score: number; edition: Edition; otherScore: number; signedLabel: string; minDeductions?: number },
): Promise<RenderedHero> {
  const answer = page.locator('[data-analysis-answer]');
  await expect(answer.locator('[data-score-breakdown="shown"]')).toBeVisible({ timeout: 60_000 });
  // Settled: the table has its rows before anything is read.
  await expect(answer.locator('li[data-score-total]')).toHaveAttribute('data-score-total', String(expected.score));
  const hero = await readScoreHero(page);
  const { score } = expected;

  // The figure and the table's last row are the signed score.
  expect(hero.figure).toBe(String(score));
  expect(hero.total).toEqual({ attr: score, points: score, label: expected.signedLabel });

  // Every deduction row, largest first, each a real deduction with its lines.
  expect(hero.deductions.length, 'the table lists no deductions').toBeGreaterThanOrEqual(expected.minDeductions ?? 1);
  const pts = hero.deductions.map((d) => -d.points);
  for (const d of hero.deductions) {
    expect(d.points, `${d.kind}: not a deduction`).toBeLessThan(0);
    expect(d.label, `${d.kind}: no words`).not.toBe('');
    expect(d.chips.length, `${d.kind}: no line chip`).toBeGreaterThan(0);
    for (const chip of d.chips) expect(chip, `${d.kind}: a chip that is not a line`).toMatch(/^L\d+$/);
  }
  expect(pts, 'the deductions are not the largest first').toEqual([...pts].sort((a, b) => b - a));
  expect(hero.largest, 'the largest single deduction is not the first row').toBe(hero.deductions[0].kind);

  // The arithmetic, read off the rows: 100 − code deductions (floored), − places not assessed (floored) = score.
  const deducted = pts.reduce((a, b) => a + b, 0);
  const codeScore = Math.max(SCORE_FLOOR, 100 - deducted);
  const ndPoints = hero.notAssessed ? -hero.notAssessed.points : 0;
  if (hero.notAssessed) {
    expect(hero.notAssessed.kinds).toBeGreaterThan(0);
    expect(ndPoints).toBeGreaterThan(0);
    expect(hero.codeSubtotal).toEqual({ attr: codeScore, points: codeScore });
  }
  if (hero.free) {
    expect(hero.free.points, 'a free row that costs points').toBe(0);
    expect(hero.free.chips.length).toBeGreaterThan(0);
  }
  expect(Math.max(SCORE_FLOOR, codeScore - ndPoints), 'the rows do not sum to the signed score').toBe(score);
  expect(hero.sum?.replace(/\s+/g, ' ')).toContain(`100 − ${deducted} for what the code does`);
  expect(hero.sum).toContain(`= ${score}`);

  // The band of the score, on the one scale.
  const band = scoreBand(score);
  const bandLine = answer.locator(`[data-analyze-score-band="${band.key}"]`);
  await expect(bandLine).toContainText(band.label);
  await expect(bandLine).toContainText(`band ${band.from}–${band.to}`);
  await expect(answer.locator(`[data-score-band="${band.key}"][data-score-band-current="true"]`)).toBeVisible();
  await expect(answer.locator('[data-score-band-current="true"]')).toHaveCount(1);

  // The edition rule and the other edition's figure, computed and never signed.
  const rule = answer.locator(`[data-score-edition="${expected.edition}"]`);
  await expect(rule).toContainText(`Scored for ${editionName(expected.edition)}`);
  const other = rule.locator(`[data-score-other-edition="${expected.otherScore}"]`);
  const otherName = editionName(expected.edition === 'private' ? 'public' : 'private');
  await expect(other).toContainText(`Under ${otherName} rules the same findings give ${expected.otherScore}`);
  await expect(other).toContainText(`Computed from the same findings; only ${score} is signed.`);
  if (expected.edition === 'private' && hero.free && expected.otherScore !== score) {
    await expect(other).toContainText(`${score - expected.otherScore} points there`);
  }
  return hero;
}
