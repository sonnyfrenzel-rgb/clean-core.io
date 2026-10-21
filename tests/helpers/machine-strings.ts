/**
 * Machine strings a reader must never meet — the patterns behind
 * `tests/machine-strings-guard.spec.ts`.
 *
 * The 3.0 gap audit (01.10.2026) found the Management answer reading "It waits
 * for … condition contract:coverage-incomplete:6 × local function-module call",
 * a decision card showing "blocked:qualified:AC-1/side-by-side-cap+592e7a6c667f",
 * an assumption revision "unconfirmed:no-currency@no-horizon/no-cadence#3opt+…",
 * "(roadmap 3.5)" at the end of a sentence for a process owner, and the
 * Analyze stage listing "standard-table-write" as if it were a word. Each was a
 * key, an id or a build reference that was correct for the code and meaningless
 * for the reader. They keep their place in tooltips and technical details; on
 * the face of a screen the wording says what the key means.
 *
 * Every pattern is a *kind* of string, not a list of the sentences that were
 * fixed, so the next contract code or the next roadmap reference is caught too.
 */
export interface MachinePattern {
  id: string;
  what: string;
  re: RegExp;
}

/**
 * Hyphenated English words with three or more parts. The raw-enum pattern
 * below would otherwise catch them; each is ordinary prose in this product.
 */
export const ENGLISH_HYPHENATED = new Set([
  'side-by-side', 'end-to-end', 'up-to-date', 'out-of-date', 'day-to-day', 'one-to-one', 'one-to-many',
  'many-to-many', 'step-by-step', 'line-by-line', 'case-by-case', 'out-of-the-box', 'state-of-the-art',
  'point-in-time', 'not-yet-known', 'to-be', 'as-is', 'hard-to-read', 'easy-to-read', 'built-in',
  'peer-to-peer', 'face-to-face', 'well-known', 'free-of-charge', 'ready-to-use', 'ready-to-run',
  'all-or-nothing', 'first-come-first-served', 'word-for-word', 'side-by-side-only', 'read-only',
  'follow-up', 'sign-in', 'two-factor', 'run-by-run', 'object-by-object', 'one-by-one', 'year-by-year',
  'by-the-way', 'off-the-shelf', 'in-app-only', 'do-it-yourself', 'mother-in-law', 'pay-as-you-go',
  'ready-to-deploy', 'never-been-run', 'at-a-glance', 'up-to-the-minute', 'back-and-forth',
  'run-of-the-mill', 'in-the-loop', 'end-of-life', 'out-of-scope', 'line-of-business', 'end-of-support',
  'one-time-only', 'one-off', 'cross-check', 'counter-check', 'not-determined',
  // Proper names of published artefacts, named as the source of a figure: SAP's
  // release-state repository is called this, and the product says whose list it reads.
  'abap-atc-cr-cv-s4hc',
]);

export const MACHINE_PATTERNS: MachinePattern[] = [
  { id: 'roadmap-ref', what: 'a roadmap step number', re: /\broadmap (?:step )?\d+(?:\.\d+)+/i },
  { id: 'adr-ref', what: 'an ADR number', re: /\bADR-\d{2,3}\b/ },
  { id: 'qa-ref', what: 'a QA review reference', re: /\(QA\b|\bQA (?:full |delta )?review of [0-9a-f]{6,}/ },
  { id: 'contract-key', what: 'a contract or condition key', re: /\b(?:contract|condition|limit|gap|cost|need):[a-z][a-z0-9-]*[a-z0-9]/ },
  {
    id: 'revision-tag',
    what: 'a revision tag (state prefix with a colon)',
    re: /\b(?:blocked|unconfirmed|qualified|confirmed|unbound|derived|rejected):[a-zA-Z0-9]/,
  },
  { id: 'revision-hash', what: 'a revision hash', re: /[+#@][0-9a-f]{8,}\b|#\d+opt[=+]|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{12,64}\b/ },
  { id: 'raw-enum', what: 'a raw enum value (kebab-case key)', re: /\b[a-z]+(?:-[a-z0-9]+){2,}\b/g },
  { id: 'raw-enum-snake', what: 'a raw enum value (snake_case key)', re: /\b(?:not|no|is|has|in|out|model|engine|cost|state|risk)_[a-z]+(?:_[a-z]+)*\b/ },
];

/**
 * The findings in one piece of text. `raw-enum` is checked word by word against
 * `ENGLISH_HYPHENATED`; every other pattern counts on its first match.
 */
export function machineStringsIn(text: string): { id: string; match: string }[] {
  const out: { id: string; match: string }[] = [];
  for (const p of MACHINE_PATTERNS) {
    if (p.id === 'raw-enum') {
      for (const m of text.matchAll(p.re)) {
        const word = m[0];
        if (ENGLISH_HYPHENATED.has(word)) continue;
        out.push({ id: p.id, match: word });
      }
      continue;
    }
    const m = text.match(p.re);
    if (m) out.push({ id: p.id, match: m[0] });
  }
  return out;
}
