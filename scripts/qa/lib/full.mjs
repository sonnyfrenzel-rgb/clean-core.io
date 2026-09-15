import { git, isReviewable } from './git-delta.mjs';
import { riskTags } from './triage.mjs';

/**
 * The full review of a release on `main`: every reviewable file of that commit, complete and with line numbers,
 * in batches. The delta review on `dev` sees what changed; this one sees what is there — including what no
 * delta has touched since the delta reviews began.
 */

/** Where the delta brief states its scope, the full review states its own; the checklist, invariants and severities stay one text. */
const DELTA_SCOPE = /You review \*\*one delta\*\*[\s\S]*?delta makes them reachable\./;

export const FULL_SCOPE = [
  'You review **the whole code base of one release on `main`**, batch by batch — not a delta. Each',
  'batch holds complete files with a line number at the start of every line, and a map of every',
  'reviewable file in the repository. Report defects a user, an attacker or the trust chain can reach in',
  'the code as it is, and name the path that gets there. Where the checklist speaks of the delta, read:',
  'the files in this batch; a caller outside the batch is one you can name from the map, not one you',
  'imagine. There are no acceptance criteria: return `acceptance` empty. `line` is the printed line',
  'number. Report findings only for files in this batch.',
].join('\n');

export function fullBrief(deltaBrief) {
  if (!DELTA_SCOPE.test(deltaBrief)) throw new Error('The reviewer brief no longer states its delta scope where the full review expects it.');
  return deltaBrief.replace(DELTA_SCOPE, FULL_SCOPE);
}

/** `12|const x = 1;` — cheap enough to repeat on every line, and the only way a model gets line numbers right. */
export const numbered = (text) =>
  String(text)
    .split(/\r?\n/)
    .map((line, i) => `${i + 1}|${line}`)
    .join('\n');

/** Every reviewable file of `head`, read from the commit itself, never from a working tree. */
export function filesAt(head, { list = (h) => git(['ls-tree', '-r', '--name-only', h]).split('\n').filter(Boolean), show = (h, p) => git(['show', `${h}:${p}`]) } = {}) {
  return list(head)
    .filter(isReviewable)
    .map((path) => {
      const content = show(head, path);
      return { path, status: 'full', tags: riskTags(path), lines: content.split(/\r?\n/).length, content };
    });
}

export const projectMap = (files) => files.map((f) => `${f.path} (${f.lines} lines)`).join('\n');

/**
 * One call per batch, within the cap, and a failed batch does not throw away the others: its files are named as
 * not reviewed, so the report is incomplete, and the call counts at its worst case against the cap — an unknown
 * cost is never a zero. Every message callReviewer throws is fixed text plus numbers, so it may be quoted.
 *
 * @param messageFor (batch, index) => { system, user }  already redacted
 * @param call       ({ system, user }) => Promise<{ review, usage }>
 * @param fits       (spentUsd, inputChars) => boolean
 * @param worstCase  (inputChars) => number, the estimate for one call
 */
export async function reviewBatches({ batches, messageFor, call, fits, worstCase, capUsd }) {
  const results = [];
  const notReviewed = [];
  let spent = 0;
  let failedCalls = 0;
  for (let i = 0; i < batches.length; i++) {
    const message = messageFor(batches[i], i);
    const chars = message.system.length + message.user.length;
    if (!fits(spent, chars)) {
      for (const b of batches.slice(i)) for (const f of b.files) notReviewed.push({ path: f.path, reason: `outside the $${capUsd} cost cap` });
      break;
    }
    try {
      const r = await call(message);
      spent += typeof r.usage?.cost === 'number' ? r.usage.cost : worstCase(chars);
      results.push({ ...r, files: batches[i].files.map((f) => f.path) });
    } catch (err) {
      failedCalls++;
      spent += worstCase(chars);
      for (const f of batches[i].files) notReviewed.push({ path: f.path, reason: `model call failed: ${String(err?.message || err).split('\n')[0]}` });
    }
  }
  return { results, notReviewed, failedCalls, spent };
}

const section = (title, body) => (body && String(body).trim() ? `## ${title}\n\n${String(body).trim()}\n` : '');

export function buildFullUserMessage({ head, batch, batchIndex, batchCount, map, previousOpen, refuted }) {
  const previous = previousOpen.length
    ? previousOpen.map((f) => `- [${f.fingerprint}] ${f.severity} · ${f.file}:${f.line} · ${f.title}\n  scenario: ${f.failure_scenario}`).join('\n')
    : '';
  const refutedText = refuted.length ? refuted.map((r) => `- ${r.file} · ${r.title} — refuted: ${r.reason}`).join('\n') : '';
  const files = batch.files.map((f) => `### ${f.path} (${f.lines} lines; tags: ${f.tags.join(', ') || '—'})\n\n\`\`\`\n${f.diff}\n\`\`\``).join('\n\n');
  return [
    section('Release', `${head} — full review, batch ${batchIndex + 1} of ${batchCount}`),
    section('Map of every reviewable file', map),
    section('Findings still open from the previous full review — report a status for each fingerprint whose file is in this batch; `not_touched` for the others', previous),
    section('Refuted earlier — do not raise again unless the code invalidates the reason', refutedText),
    section('Files in this batch', files),
  ].join('\n');
}
