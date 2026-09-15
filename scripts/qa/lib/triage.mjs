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
  { signal: 'assertion removed', re: /^-\s*(await\s+)?expect\(/ },
  { signal: 'test skipped or focused', re: /^\+.*\b(test|it|describe)\.(skip|only|fixme)\(/ },
  { signal: 'lint gate loosened', re: /^\+.*--max-warnings\s+\d+/ },
  { signal: 'lint or type check suppressed', re: /^\+.*(eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error)/ },
  { signal: 'test timeout raised', re: /^\+.*(test\.setTimeout|timeout:\s*\d{5,})/ },
  { signal: 'retries added', re: /^\+.*retries:\s*[1-9]/ },
];

export function testSignals(path, diffText) {
  const found = [];
  for (const line of diffText.split('\n')) {
    for (const w of WEAKENING) {
      if (w.re.test(line)) found.push({ file: path, signal: w.signal, line: line.slice(0, 160) });
    }
  }
  return found;
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
    criteria: acceptanceCriteria(claims),
    // A behaviour change with no test in the same delta is the most common way
    // a regression ships. Named here so the reviewer has to look for it.
    codeWithoutTests: touchesCode && !addsTests,
  };
}
