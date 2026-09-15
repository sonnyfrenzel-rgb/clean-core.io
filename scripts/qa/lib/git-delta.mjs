import { execFileSync } from 'node:child_process';
import { BUDGET, CLAIM_SOURCES, IGNORED_PATHS, REVIEWABLE } from './config.mjs';

/**
 * The delta, and only the delta. A review of the whole repository on every push
 * would cost a hundred times more and bury the one line that changed under
 * findings nobody introduced this week.
 *
 * Every git call goes through execFileSync with an argument array — no shell,
 * so a branch or path name can never become a command.
 */

const ZERO_SHA = /^0{40}$/;

export function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}

/** Exit status as a boolean, for the git commands that answer yes or no. */
function gitSucceeds(args) {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isCommit(sha) {
  return Boolean(sha) && !ZERO_SHA.test(sha) && gitSucceeds(['cat-file', '-e', `${sha}^{commit}`]);
}

export function isAncestor(a, b) {
  return gitSucceeds(['merge-base', '--is-ancestor', a, b]);
}

/**
 * Which commit a review starts from. Pure, so every case is testable without a
 * repository:
 *
 * 1. an explicit base from a manual run wins;
 * 2. otherwise the last reviewed checkpoint, when it is an ancestor of head;
 * 3. otherwise — no checkpoint, or one a force push made unusable — everything
 *    not yet on main. The push event's own `before` is never used as a fallback:
 *    after a cancelled, failed or rewritten history it silently narrows the
 *    review (QA reviews of 221f2d11768c and 2f9b128bafd4).
 *
 * No merge base at all (an orphan history, or main missing from the clone) is
 * not "head is on main": it stops the run, because any single commit chosen
 * instead would pass as a complete review of a delta it never read (QA review
 * of c1f86075617b, finding 1b9c06bebe30).
 */
export function chooseBase({ head, overrideBase, checkpoint, isAncestorOf, mainBase }) {
  if (overrideBase) return { base: overrideBase, reason: 'base given for this run' };
  if (checkpoint && checkpoint !== head && isAncestorOf(checkpoint, head)) return { base: checkpoint, reason: 'last reviewed checkpoint' };
  const mb = mainBase(head);
  if (!mb) throw new Error('No usable review base: the checkpoint is not an ancestor of head and head shares no history with main. Re-run with a base given.');
  if (mb !== head) return { base: mb, reason: checkpoint ? 'checkpoint unusable (rewritten history) — everything not yet on main' : 'no reviewed checkpoint — everything not yet on main' };
  return { base: null, reason: 'head is on main — reviewing the head commit only' };
}

/** Where `head` left main — the base for a review that has no usable checkpoint. Null when main is not available. */
export function mergeBaseWithMain(head) {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(['merge-base', head, ref]);
    } catch {
      /* ref not present in this clone */
    }
  }
  return null;
}

/** Workflow inputs reach git as arguments. A value starting with `-` would be read as an option, so only commit ids pass. */
export function commitIdOrNull(value) {
  if (!value) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(value)) throw new Error('QA_BASE/QA_HEAD must be commit ids (7–40 hex characters).');
  return value;
}

/**
 * Which commits this review covers.
 *
 * The push event names the previous tip (`before`). It is unusable in three
 * cases, each with its own honest fallback: a new branch (all zeros), a force
 * push that rewrote history (not an ancestor), and a shallow clone that never
 * fetched it. The fallback is the parent of head — a smaller delta, and the
 * report says which base was used and why.
 */
export function resolveRange({ base, head }) {
  const headSha = git(['rev-parse', head || 'HEAD']);
  let baseSha = null;
  let baseReason = 'push event';

  if (isCommit(base) && isAncestor(base, headSha)) {
    baseSha = git(['rev-parse', base]);
  } else {
    baseReason = !base || ZERO_SHA.test(base || '') ? 'no previous tip (new branch or manual run)' : 'previous tip is not an ancestor (force push) or not fetched';
    baseSha = isCommit(`${headSha}~1`) ? git(['rev-parse', `${headSha}~1`]) : null;
  }

  const commits = baseSha
    ? git(['log', '--format=%h %s', `${baseSha}..${headSha}`]).split('\n').filter(Boolean)
    : [git(['log', '-1', '--format=%h %s', headSha])];

  return { base: baseSha, head: headSha, baseReason, commits };
}

/** Full commit messages of the range — bodies carry the acceptance criteria a step claims to meet. */
export function commitMessages(range) {
  if (!range.base) return git(['log', '-1', '--format=%B', range.head]);
  return git(['log', '--format=--- %h%n%B', `${range.base}..${range.head}`]);
}

export function isIgnored(path) {
  return IGNORED_PATHS.some((re) => re.test(path));
}

export function isReviewable(path) {
  return !isIgnored(path) && REVIEWABLE.test(path);
}

export function isClaimSource(path) {
  return CLAIM_SOURCES.some((re) => re.test(path));
}

/** `git diff --name-status` parsed. Renames keep both names so a moved file is not mistaken for a new one. */
export function changedFiles(range) {
  const args = range.base ? ['diff', '--name-status', '-M', range.base, range.head] : ['show', '--name-status', '--format=', '-M', range.head];
  return git(args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, a, b] = line.split('\t');
      return b ? { status: status[0], path: b, oldPath: a } : { status: status[0], path: a };
    });
}

export function fileDiff(range, path, contextLines = BUDGET.hunkContextLines) {
  const args = range.base
    ? ['diff', `-U${contextLines}`, '-M', range.base, range.head, '--', path]
    : ['show', `-U${contextLines}`, '--format=', '-M', range.head, '--', path];
  const text = git(args);
  if (text.length <= BUDGET.maxFileDiffChars) return { text, truncated: false };
  return { text: `${text.slice(0, BUDGET.maxFileDiffChars)}\n… [diff cut at ${BUDGET.maxFileDiffChars} characters]`, truncated: true };
}

/** Only the lines a change adds to a prose file — the claims, not the whole CHANGELOG. */
export function addedLines(range, path) {
  const { text } = fileDiff(range, path, 0);
  return text
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n')
    .trim();
}

const SYMBOL_PATTERNS = [
  /^[+-]\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /^[+-]\s*export\s+(?:const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^[+-]\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
];

/**
 * Names the delta defines, redefines or removes. Removed lines count: a deleted
 * export whose callers remain is the regression a deleted-file label hides (QA
 * review of 221f2d11768c). Hunk headers count too: git prints the enclosing
 * function after `@@`, so a change inside an existing function names that
 * function even when its signature line did not change.
 */
export function touchedSymbols(diffText) {
  const names = new Set();
  for (const line of diffText.split('\n')) {
    for (const re of SYMBOL_PATTERNS) {
      const m = line.match(re);
      if (m) names.add(m[1]);
    }
    const hunk = line.match(/^@@[^@]*@@\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+|const\s+|class\s+)([A-Za-z_$][\w$]*)/);
    if (hunk) names.add(hunk[1]);
  }
  // Very short or generic names match half the repository and tell the reviewer nothing.
  return [...names].filter((n) => n.length >= 4 && !['default', 'props', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(n));
}

/**
 * Who calls what changed, outside the delta — the part of a regression a diff
 * cannot show. Bounded per symbol and in total, and read from the head commit
 * rather than the working tree so the CI checkout and a local run agree.
 */
export function callersOf(range, symbols, excludePaths) {
  const exclude = new Set(excludePaths);
  const out = [];
  for (const symbol of symbols.slice(0, BUDGET.maxSymbols)) {
    let hits = [];
    try {
      hits = git(['grep', '-n', '-w', '-F', symbol, range.head, '--', '*.ts', '*.tsx', '*.mjs'])
        .split('\n')
        .filter(Boolean);
    } catch {
      continue; // git grep exits 1 when nothing matches
    }
    const callers = hits
      .map((h) => h.replace(`${range.head}:`, ''))
      .filter((h) => !exclude.has(h.split(':')[0]))
      .slice(0, BUDGET.maxCallersPerSymbol)
      .map((h) => {
        const [file, line, ...rest] = h.split(':');
        return { file, line: Number(line), text: rest.join(':').trim().slice(0, 200) };
      });
    if (callers.length) out.push({ symbol, callers });
  }
  return out;
}
