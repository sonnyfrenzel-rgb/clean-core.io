/**
 * Finding the review the session start should talk about: the newest real one.
 *
 * Runs are the wrong index. A run on dev that the agent skips succeeds without a
 * report, and twenty of them used to push the last real review out of the search
 * (findings c3109a9fdfb1, 006ed32a72cc). Review artifacts are the right index: a
 * run has one exactly when it produced a report. Self-tests produce one too, and
 * are passed over.
 */

/**
 * Every retained artifact, page by page, until the API has no more — judged by
 * the raw page size, never by what a filter left of it: a full page with one
 * expired artifact would otherwise look like the last page (finding 21fde4c339d8).
 *
 * @param fetchPage (page) => { raw: number, items: [{ name, runId, headSha, expired }] }
 * @param maxPages  a safety stop; hitting it is reported, not taken for the end
 */
export function collectArtifacts(fetchPage, maxPages = 50) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const { raw, items: batch } = fetchPage(page);
    items.push(...batch.filter((a) => !a.expired));
    if (raw < 100) return { artifacts: items, complete: true };
  }
  return { artifacts: items, complete: false };
}

/**
 * @param artifacts [{ name, runId, headSha }] newest first, from the artifacts API
 * @returns the runs with a UX review artifact, newest first, each once
 */
export function reviewRuns(artifacts) {
  const seen = new Set();
  const runs = [];
  for (const a of artifacts) {
    if (!/^ux-review-[0-9a-f]{40}-\d+$/.test(a.name) || seen.has(a.runId)) continue;
    seen.add(a.runId);
    runs.push({ databaseId: a.runId, headSha: a.headSha });
  }
  return runs;
}

/**
 * The first run whose report opens and is not a self-test.
 *
 * @param runs  newest first
 * @param open  (run) => { report, ... } | null
 */
export function newestRealReview(runs, open) {
  for (const run of runs) {
    const got = open(run);
    if (got && got.report?.mode !== 'self-test') return { run, ...got };
  }
  return null;
}
