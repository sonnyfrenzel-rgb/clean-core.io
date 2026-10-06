#!/usr/bin/env node
/**
 * Does this release on main need a full review? Decided before any key is in reach (.github/workflows/qa-review.yml,
 * job `full-scope`), from git alone.
 *
 *   QA_FULL_BASE=<sha> node scripts/qa/full-scope.mjs
 *
 * The base is the release whose full review last succeeded; the workflow looks it up. Prints `mode=full|skip` and
 * `reason=…` for $GITHUB_OUTPUT. The decision: lib/full.mjs fullReviewDecision; the thresholds: FULL_TRIGGER in
 * lib/config.mjs.
 */
import { fullReviewDecision, measureSinceFullReview } from './lib/full.mjs';

const decision = fullReviewDecision(measureSinceFullReview(process.env.QA_FULL_BASE || null));
console.log(`mode=${decision.mode}`);
console.log(`reason=${decision.reason}`);
