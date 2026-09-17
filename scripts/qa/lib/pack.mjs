import { BUDGET, estimateCostUsd, PRICE_PER_MTOK } from './config.mjs';

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

/** Code-unit order, not localeCompare: a local `--dry` must pack exactly as the CI runner does, whatever either machine's locale. */
const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** A file's own characters: its diff, its callers, and the carried findings and refutations that are sent only with it (prompt.mjs carriedChars). A part adds its label. */
export const fileChars = (f) =>
  f.diff.length + (f.callers || []).reduce((n, c) => n + c.callers.reduce((m, x) => m + x.text.length + x.file.length + 16, c.symbol.length), 0) + (f.carriedChars || 0) + f.path.length + 64 + (f.part ? 128 : 0);

/**
 * A diff too large for one piece, cut into consecutive parts that together hold every line.
 *
 * Until 18.09.2026 a diff above `maxFileDiffChars` was cut at that length and the
 * file named as not reviewed. That made every range containing such a commit
 * incomplete for good: `b64818a` adds `tests/korpus/baseline.json` with a
 * 132,967-character diff and `d53530c` adds `lib/abap/process-skeleton.ts` with
 * 70,528, each in one commit, so no slicing could ever read them whole, and the
 * checkpoint could not move past `a19945e`. The same budget, distributed: parts
 * of at most `max` characters, cut between hunks; a hunk larger than a part is cut
 * between lines and every piece gets a hunk header with its own line numbers, so
 * the reviewer can still place a finding; a single line larger than a part is
 * wrapped. The file header (`diff --git`, `---`, `+++`) repeats in every part.
 *
 * @returns [{ text, lines }] — one element without `lines` when the diff fits whole
 */
export function splitDiff(text, max) {
  if (text.length <= max) return [{ text }];
  const all = text.split('\n');
  const first = all.findIndex((l) => HUNK.test(l));
  const preamble = first < 0 ? '' : all.slice(0, first).join('\n');
  const room = max - preamble.length - 1;
  const units = hunksOf(first < 0 ? all : all.slice(first)).flatMap((h) => (h.text.length <= room ? [h] : cutHunk(h, room)));

  const parts = [];
  let current = null;
  for (const u of units) {
    if (!current || current.chars + u.text.length + 1 > max) {
      current = { units: [], chars: preamble.length };
      parts.push(current);
    }
    current.units.push(u);
    current.chars += u.text.length + 1;
  }
  return parts.map((p) => ({ text: [preamble, ...p.units.map((u) => u.text)].filter(Boolean).join('\n'), lines: lineRange(p.units) }));
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** Hunks with their line positions; text before the first hunk header (none in a git diff) is one unit of its own. */
function hunksOf(lines) {
  const hunks = [];
  let h = null;
  for (const line of lines) {
    const m = line.match(HUNK);
    if (m || !h) {
      h = m
        ? { header: line, context: m[5], oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]), body: [] }
        : { header: null, context: '', oldStart: 0, oldCount: 0, newStart: 0, newCount: 0, body: [line] };
      hunks.push(h);
    } else h.body.push(line);
  }
  return hunks.map((x) => ({ ...x, text: [x.header, ...x.body].filter((l) => l !== null).join('\n') }));
}

/** One hunk larger than a part, cut between lines; every piece is a hunk of its own with a header that counts its lines. */
function cutHunk(h, room) {
  const HEADER_ROOM = 64 + h.context.length;
  const width = Math.max(room - HEADER_ROOM - 1, 1);
  const pieces = [];
  let piece = null;
  let oldLine = h.oldStart;
  let newLine = h.newStart;
  const open = () => {
    piece = { oldStart: oldLine, newStart: newLine, oldCount: 0, newCount: 0, body: [], chars: 0 };
    pieces.push(piece);
  };
  // Every wrapped line plus its newline fits an empty piece, so no piece is ever opened empty.
  const wrapWidth = Math.max(width - 1, 2);
  for (const line of h.body) {
    // A line wider than a part is wrapped; each continuation repeats the marker and counts as no further line.
    const wrapped = [line.slice(0, wrapWidth)];
    for (let i = wrapWidth; i < line.length; i += wrapWidth - 1) wrapped.push(line[0] + line.slice(i, i + wrapWidth - 1));
    wrapped.forEach((w, i) => {
      if (!piece || piece.chars + w.length + 1 > width) open();
      piece.body.push(w);
      piece.chars += w.length + 1;
      if (i > 0) return;
      const marker = line[0];
      if (marker === ' ' || marker === '-') {
        piece.oldCount++;
        oldLine++;
      }
      if (marker === ' ' || marker === '+') {
        piece.newCount++;
        newLine++;
      }
    });
  }
  return pieces.map((p, i) => {
    const start = (s, n) => (n ? s : Math.max(s - 1, 0));
    const header = `@@ -${start(p.oldStart, p.oldCount)},${p.oldCount} +${start(p.newStart, p.newCount)},${p.newCount} @@${h.context}${i ? ' (hunk continued)' : ''}`;
    return { ...p, text: [header, ...p.body].join('\n') };
  });
}

/** The new-file lines a part covers, or the old-file lines when it only removes. */
function lineRange(units) {
  const span = (key) => {
    const covered = units.filter((u) => u[`${key}Count`] > 0);
    if (!covered.length) return null;
    return [Math.min(...covered.map((u) => u[`${key}Start`])), Math.max(...covered.map((u) => u[`${key}Start`] + u[`${key}Count`] - 1))];
  };
  const fresh = span('new');
  if (fresh) return `new-file lines ${fresh[0]}–${fresh[1]}`;
  const gone = span('old');
  return gone ? `removed lines ${gone[0]}–${gone[1]} of the old file` : 'the continuation of a line too long for one part';
}

/**
 * A file as it is packed: itself when its diff fits one part, otherwise one entry per part. Every part carries the
 * file's register (so each batch holding a part can judge its carried findings), the callers go with the first part.
 * A file counts as reviewed only when every one of its parts was read (report.mjs coverageOf).
 */
export function partsOf(file, max = BUDGET.maxFileDiffChars) {
  const parts = splitDiff(file.diff, max);
  if (parts.length === 1) return [file];
  return parts.map((p, i) => ({ ...file, diff: p.text, callers: i ? [] : file.callers, part: { index: i + 1, count: parts.length, lines: p.lines } }));
}

/** How a part is named wherever it appears alone: in a batch heading and in the list of what was not reviewed. */
export const partLabel = (f) => (f.part ? `${f.part.index} of ${f.part.count}` : null);

/**
 * @param files     [{ path, status, tags, diff, callers?, carriedChars?, part? }] — parts from partsOf are entries of their own
 * @param baseChars characters every batch repeats (brief, triage, claims) — not the register, which travels with its files
 * @param options   the delta review's budget and price by default; the full review passes its own
 */
export function packBatches(files, baseChars, { budget = BUDGET, price = PRICE_PER_MTOK } = {}) {
  // Same input, same batches: risk first, then path, then part — never the order the entries arrived in.
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || byCodeUnits(a.path, b.path) || (a.part?.index ?? 0) - (b.part?.index ?? 0));
  const batches = [];
  const notReviewed = [];

  for (const f of sorted) {
    const size = fileChars(f);
    const miss = (reason) => notReviewed.push({ path: f.path, ...(f.part ? { part: partLabel(f) } : {}), reason });
    if (baseChars + size > budget.maxBatchChars) {
      miss(`diff alone exceeds one call's budget (${size} characters)`);
      continue;
    }
    // First fit: an earlier batch with room takes the entry before a new batch is opened. Until 18.09.2026 a new
    // batch began as soon as one entry did not fit, and the room left behind went unused — about 63,000 characters
    // in the review of a19945e..c812085, while five files stayed unread. Entries are still placed riskiest first,
    // so a later, smaller entry can fill a gap but never take a place a riskier one needed.
    const target = batches.find((b) => b.chars + size <= budget.maxBatchChars);
    if (target) {
      target.files.push(f);
      target.chars += size;
    } else if (batches.length < budget.maxBatches) {
      batches.push({ files: [f], chars: baseChars + size });
    } else {
      miss(`outside the ${budget.maxBatches}-call budget`);
    }
  }

  // Worst case for the dry run. The cap itself is enforced call by call against
  // actual spend (review.mjs), because the full output allowance is rarely used.
  const totalChars = batches.reduce((n, b) => n + b.chars, 0);
  return { batches, notReviewed, estimatedCostUsd: Number(estimateCostUsd(totalChars, batches.length, { price, maxOutputTokens: budget.maxOutputTokens }).toFixed(2)) };
}
