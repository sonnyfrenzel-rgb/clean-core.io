import { BUDGET, estimateCostUsd } from './config.mjs';

/**
 * Fit the delta into the budget, riskiest files first.
 *
 * Order matters because the cap can bite: when a delta is too large, what gets
 * reviewed should be the rules and API routes, not the CSS. Whatever does not
 * fit is returned as `notReviewed` with the reason, and the report carries it —
 * a partial review that looks complete is worse than no review.
 */

const RISK_ORDER = ['security', 'trust-chain', 'ci', 'engine', 'ui', 'tests'];
const rank = (f) => {
  const ranks = f.tags.map((t) => RISK_ORDER.indexOf(t)).filter((i) => i >= 0);
  return ranks.length ? Math.min(...ranks) : RISK_ORDER.length;
};

export const fileChars = (f) => f.diff.length + (f.callers || []).reduce((n, c) => n + c.callers.reduce((m, x) => m + x.text.length + x.file.length + 16, c.symbol.length), 0) + f.path.length + 64;

/**
 * @param files     [{ path, status, tags, diff, callers?, truncated? }]
 * @param baseChars characters every batch repeats (brief, triage, claims, previous findings)
 */
export function packBatches(files, baseChars) {
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  const batches = [];
  const notReviewed = [];
  let current = { files: [], chars: baseChars };

  for (const f of sorted) {
    const size = fileChars(f);
    if (baseChars + size > BUDGET.maxBatchChars) {
      notReviewed.push({ path: f.path, reason: `diff alone exceeds one call's budget (${size} characters)` });
      continue;
    }
    if (current.chars + size > BUDGET.maxBatchChars) {
      if (batches.length + 1 >= BUDGET.maxBatches) {
        notReviewed.push({ path: f.path, reason: `outside the ${BUDGET.maxBatches}-call budget` });
        continue;
      }
      batches.push(current);
      current = { files: [], chars: baseChars };
    }
    current.files.push(f);
    current.chars += size;
  }
  if (current.files.length) batches.push(current);

  // The cost cap is checked on the packed result. If it would be exceeded, the
  // last batch goes — its files are the least risky ones by construction.
  const totalChars = () => batches.reduce((n, b) => n + b.chars, 0);
  while (batches.length && estimateCostUsd(totalChars(), batches.length) > BUDGET.maxCostUsd) {
    const dropped = batches.pop();
    for (const f of dropped.files) notReviewed.push({ path: f.path, reason: `outside the $${BUDGET.maxCostUsd} cost cap` });
  }

  return { batches, notReviewed, estimatedCostUsd: Number(estimateCostUsd(totalChars(), batches.length).toFixed(2)) };
}
