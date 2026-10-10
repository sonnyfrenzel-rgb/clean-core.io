/**
 * Where the delta review of a push to `dev` starts, when more than the last push review has read the code.
 *
 * The checkpoint is the last commit a *push* review read completely (workflow step "Fetch the previous sealed
 * report", `--event push` since 06.10.2026). Two other reviews can have read further, and without them a range
 * that never fits one review's budget keeps every push incomplete for good (10.10.2026: stuck at 1c5d882f3b6a,
 * every push re-read all of v3.0.7 although three manual slices had read it completely):
 *
 * 1. **A complete manual slice** (workflow_dispatch with base/head) that starts **exactly at the checkpoint** and
 *    ends at an ancestor of the head. Its head becomes the checkpoint, and a slice starting there is adopted next,
 *    as far as the chain reaches. Its findings are carried like a push review's. A slice that starts anywhere
 *    else, or did not read all of its range, is ignored — the 06.10.2026 protection: a stray slice can never
 *    become the base (that day one of 04.10. sent two pushes 1,385 commits back).
 * 2. **A complete full review of a release on `main`** whose head lies between the checkpoint and the head.
 *    It read every reviewable file of that release, so everything up to it has been read. A release alone does
 *    not count: a full review runs only for a larger change (full-scope.mjs), and one that ran out of its cap is
 *    incomplete — a skipped or incomplete full review moves nothing. Its findings stay in the main ledger.
 *
 * Pure: git is passed in as `isAncestorOf`, so every case is testable without a repository.
 */

const SHA = /^[0-9a-f]{40}$/;

/** Read everything it was given, and says so: complete, with a verdict over code it read, and full commit ids. */
export function isCompleteReview(r) {
  return (
    SHA.test(String(r?.range?.head ?? '')) &&
    r.incomplete === false &&
    r.range.checkpoint === r.range.head &&
    typeof r.verdict === 'string' &&
    r.verdict !== 'no_review' &&
    Array.isArray(r.coverage?.notReviewed) &&
    r.coverage.notReviewed.length === 0
  );
}

/** The candidate every other one is an ancestor of; the first when the history forks between them. */
function furthest(candidates, isAncestorOf) {
  return candidates.find((c) => candidates.every((o) => o === c || isAncestorOf(o.range.head, c.range.head))) || candidates[0];
}

/**
 * @param checkpoint  the last push review's checkpoint (null: none — nothing is adopted)
 * @param head        the commit this review is for
 * @param findings    the last push review's open findings
 * @param slices      decrypted reports of manual runs on dev
 * @param fullReviews decrypted full reviews of releases on main
 * @returns { checkpoint, findings, adopted: [{ base, head, run }], fullReview: sha | null }
 */
export function advanceCheckpoint({ checkpoint, head, findings = [], slices = [], fullReviews = [], isAncestorOf, maxSteps = 100 }) {
  const out = { checkpoint: checkpoint ?? null, findings, adopted: [], fullReview: null };
  if (!SHA.test(String(checkpoint ?? '')) || !SHA.test(String(head ?? ''))) return out;
  const chainable = slices.filter((s) => isCompleteReview(s) && SHA.test(String(s.range.base ?? '')));
  const releases = fullReviews.filter(isCompleteReview);
  const byFp = new Map(findings.map((f) => [f.fingerprint, f]));
  const resolved = new Set();
  let current = checkpoint;

  for (let step = 0; step < maxSteps && current !== head; step++) {
    // Slices first: they carry dev's own findings, which a jump past them would drop.
    const next = chainable.filter((s) => s.range.base === current && s.range.head !== current && isAncestorOf(s.range.head, head));
    if (next.length) {
      const slice = furthest(next, isAncestorOf);
      for (const r of slice.resolved || []) {
        byFp.delete(r.fingerprint);
        resolved.add(r.fingerprint);
      }
      // A finding an earlier slice resolved comes back only when a later one raised it, not when it merely carried it.
      for (const f of slice.findings || []) if (!(f.carried && resolved.has(f.fingerprint))) byFp.set(f.fingerprint, f);
      out.adopted.push({ base: slice.range.base, head: slice.range.head, run: slice.meta?.run?.id ?? null });
      current = slice.range.head;
      continue;
    }
    const past = releases.filter((r) => r.range.head !== current && isAncestorOf(current, r.range.head) && isAncestorOf(r.range.head, head));
    if (!past.length) break;
    current = furthest(past, isAncestorOf).range.head;
    out.fullReview = current;
  }

  out.checkpoint = current;
  if (out.adopted.length) out.findings = [...byFp.values()];
  return out;
}

/** One line for the report's base reason: what moved the checkpoint, or nothing when nothing did. */
export function advanceNote(advance) {
  if (!advance) return '';
  const parts = [];
  if (advance.adopted.length) parts.push(`${advance.adopted.length} complete slice review(s) adopted up to ${advance.adopted.at(-1).head.slice(0, 12)}`);
  if (advance.fullReview) parts.push(`complete full review of release ${advance.fullReview.slice(0, 12)}`);
  return parts.join('; ');
}
