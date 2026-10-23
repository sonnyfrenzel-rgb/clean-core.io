import { RISK_RULES } from './config.mjs';

/**
 * What a QA engineer sees before reading a single hunk — and what costs no
 * tokens to see. The model gets these signals as facts, so it spends its
 * reasoning on judging them instead of rediscovering them.
 */

export function riskTags(path) {
  return RISK_RULES.filter((r) => r.test(path)).map((r) => r.tag);
}

export function isElevated(tags) {
  const elevated = new Set(RISK_RULES.filter((r) => r.elevated).map((r) => r.tag));
  return tags.some((t) => elevated.has(t));
}

/**
 * Patterns that weaken a test suite. Each is a signal, not a verdict: deleting
 * an assertion is sometimes right. The reviewer is asked to confirm or clear
 * every one, which is what keeps a green suite from being green by subtraction.
 */
const WEAKENING = [
  { signal: 'test skipped or focused', re: /^\+.*\b(test|it|describe)\.(skip|only|fixme)\(/ },
  { signal: 'lint gate loosened', re: /^\+.*--max-warnings\s+\d+/ },
  { signal: 'lint or type check suppressed', re: /^\+.*(eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error)/ },
  { signal: 'test timeout raised', re: /^\+.*(test\.setTimeout|timeout:\s*\d{5,})/ },
  { signal: 'retries added', re: /^\+.*retries:\s*[1-9]/ },
];

const REMOVED_EXPECT = /^-\s*(await\s+)?expect\(/;
const ADDED_EXPECT = /^\+\s*(await\s+)?expect\(/;

/**
 * What an `expect(…)` line asserts on: the first argument, whitespace-normalised.
 * Read to its closing parenthesis (quotes respected); an argument that runs past
 * the line is taken to the line's end, so two such lines compare only when equal.
 */
export function expectSubject(line) {
  const start = line.indexOf('expect(');
  if (start < 0) return null;
  let depth = 0;
  let quote = null;
  let out = '';
  for (let i = start + 'expect('.length; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') {
        out += ch + (line[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) break;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** A unified diff cut at its `@@` lines (text without any is one hunk); the `---`/`+++` file names are dropped. */
function hunks(diffText) {
  let cur = [];
  const out = [cur];
  for (const line of diffText.split('\n')) {
    if (line.startsWith('@@')) {
      cur = [];
      out.push(cur);
    } else if (!line.startsWith('--- ') && !line.startsWith('+++ ')) cur.push(line);
  }
  return out;
}

/**
 * A removed `expect(` is "assertion changed" (lower weight) when the same hunk
 * adds an `expect(` on the same subject — the assertion was rewritten, not
 * dropped. Without such a replacement it stays "assertion removed", whatever a
 * commit message says: an owner decision travels to the reviewer as context
 * (triage `testChanges`), it never clears the signal.
 */
function assertionSignals(path, diffText) {
  const found = [];
  for (const hunk of hunks(diffText)) {
    const added = hunk.filter((l) => ADDED_EXPECT.test(l)).map(expectSubject);
    for (const line of hunk.filter((l) => REMOVED_EXPECT.test(l))) {
      const at = added.indexOf(expectSubject(line));
      if (at >= 0) {
        added.splice(at, 1);
        found.push({ file: path, signal: 'assertion changed', weight: 'low', line: line.slice(0, 160) });
      } else found.push({ file: path, signal: 'assertion removed', weight: 'high', line: line.slice(0, 160) });
    }
  }
  return found;
}

export function testSignals(path, diffText) {
  const found = assertionSignals(path, diffText);
  for (const line of diffText.split('\n')) {
    for (const w of WEAKENING) {
      if (w.re.test(line)) found.push({ file: path, signal: w.signal, weight: 'high', line: line.slice(0, 160) });
    }
  }
  return found;
}

/**
 * `Test-Change: owner decision <date> <id>` trailers in the commit messages of
 * the delta (the `# commits` section review.mjs appends to the claims). The
 * reviewer gets them as the owner's stated reason for a test change, to check
 * against the diff; they weaken no signal.
 */
export function testChangeTrailers(claimText) {
  const at = claimText.lastIndexOf('# commits\n');
  if (at < 0) return [];
  const re = /^Test-Change:[ \t]*(owner decision[ \t]+(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})[ \t]+\S[^\n]{0,200}?)[ \t]*$/gim;
  const out = new Set();
  let m;
  while ((m = re.exec(claimText.slice(at)))) out.add(m[1].replace(/\s+/g, ' '));
  return [...out];
}

/**
 * Criteria a change says it meets. The release routine quotes acceptance text
 * in bold in the CHANGELOG ("**„…"**") — those quotes are what the step
 * promised, and the reviewer checks each against the delta.
 */
export function acceptanceCriteria(claimText) {
  const out = new Set();
  const re = /\*\*[„"]([^*]{12,400}?)[“"]\*\*/g;
  let m;
  while ((m = re.exec(claimText))) out.add(m[1].replace(/\s+/g, ' ').trim());
  return [...out];
}

/**
 * The whole triage of one delta.
 *
 * @param files   [{ path, status }] for reviewable files
 * @param diffs   Map path → diff text
 * @param claims  added lines of CHANGELOG/README/SECURITY plus commit bodies
 */
export function triage(files, diffs, claims) {
  const perFile = files.map((f) => ({ ...f, tags: riskTags(f.path) }));
  const tags = [...new Set(perFile.flatMap((f) => f.tags))];
  const signals = perFile.flatMap((f) => testSignals(f.path, diffs.get(f.path) || ''));
  const touchesCode = perFile.some((f) => !f.tags.includes('tests'));
  const addsTests = perFile.some((f) => f.tags.includes('tests') && f.status !== 'D');

  return {
    files: perFile,
    tags,
    elevated: isElevated(tags),
    signals,
    testChanges: testChangeTrailers(claims),
    criteria: acceptanceCriteria(claims),
    // A behaviour change with no test in the same delta is the most common way
    // a regression ships. Named here so the reviewer has to look for it.
    codeWithoutTests: touchesCode && !addsTests,
  };
}
