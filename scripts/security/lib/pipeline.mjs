import { AUDIT, CONSULTANTS, PATTERN_ONLY, PINNED } from './team.mjs';

/**
 * The audit as a pipeline of model calls without tools: who reads which file, what each call is shown, and how
 * the report's coverage is counted. Pure functions — the entry point (audit.mjs) supplies file reading,
 * redaction and the model call, so every rule here is tested by behaviour.
 */

export const numbered = (text) =>
  String(text)
    .split(/\r?\n/)
    .map((line, i) => `${i + 1}|${line}`)
    .join('\n');

/** The consultant who reads a file in depth, or null when the file is covered by the pattern scan only. */
export function consultantFor(file) {
  if (PATTERN_ONLY(file.path)) return null;
  return Object.entries(CONSULTANTS).find(([, c]) => c.domains.includes(file.domain))?.[0] ?? null;
}

/**
 * Every in-scope file goes to exactly one consultant or to the pattern scan; each consultant's files are packed
 * into calls of at most `batchChars` prepared characters. What does not fit is named, never dropped.
 *
 * @param files    surface map `files.list`: [{ path, domain }]
 * @param prepare  (path) => the text the model receives (numbered and redacted by the caller)
 * @param only     self-test: the paths to include, everything else is left out of the run entirely
 * @param pinned   consultant -> reference paths copied into every one of its calls (lib/team.mjs PINNED)
 */
export function planBatches(files, prepare, { batchChars = AUDIT.batchChars, maxCalls = AUDIT.maxConsultantCalls, only = null, pinned: pinnedFor = PINNED } = {}) {
  const assigned = new Map(Object.keys(CONSULTANTS).map((k) => [k, []]));
  const patternOnly = [];
  for (const f of files) {
    if (only && !only.includes(f.path)) continue;
    const consultant = consultantFor(f);
    if (consultant) assigned.get(consultant).push(f);
    else patternOnly.push(f.path);
  }

  const batches = [];
  const notRead = [];
  for (const [consultant, list] of assigned) {
    // The reference files of this consultant, read once and copied into every
    // call it makes. They are charged against the batch budget like any other
    // text, so a pinned file shrinks the batches rather than silently blowing
    // past `batchChars`.
    const pinnedPaths = (pinnedFor[consultant] || []).filter((p) => !only || only.includes(p));
    const pinned = pinnedPaths.map((path) => ({ path, text: prepare(path) })).filter((p) => p.text);
    const pinnedChars = pinned.reduce((n, p) => n + p.text.length + p.path.length + 64, 0);
    const newBatch = () => {
      const b = { consultant, files: [], pinned, chars: pinnedChars };
      batches.push(b);
      return b;
    };
    let current = null;
    for (const f of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
      // A pinned file is already in every call of this consultant; packing it a
      // second time would spend the budget on a duplicate.
      if (pinned.some((p) => p.path === f.path)) continue;
      // A file larger than one call is read in consecutive parts; its line numbers are the file's own.
      const parts = splitText(prepare(f.path), batchChars - pinnedChars - f.path.length - 64);
      const skipped = [];
      parts.forEach((text, k) => {
        const size = text.length + f.path.length + 64;
        if (!current || current.chars + size > batchChars) {
          if (batches.length >= maxCalls) {
            skipped.push(k);
            return;
          }
          current = newBatch();
        }
        current.files.push({ path: f.path, text, part: parts.length > 1 ? `${k + 1}/${parts.length}` : null });
        current.chars += size;
      });
      if (skipped.length) notRead.push({ path: f.path, reason: `outside the ${maxCalls}-call limit${parts.length > 1 ? ` (${skipped.length} of ${parts.length} parts)` : ''}` });
    }
  }
  return { batches, patternOnly, notRead };
}

/**
 * Split at line ends into pieces of at most `limit` characters. A single longer line is cut where it must be, and
 * every continuation keeps the line's number (`412|… `), so a finding in the second half still cites the right line.
 */
export function splitText(text, limit) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    let rest = line;
    const number = /^(\d+)\|/.exec(line)?.[1];
    const continuation = number ? `${number}|… ` : '';
    let first = true;
    while ((first ? 0 : continuation.length) + rest.length > limit) {
      if (current) {
        parts.push(current);
        current = '';
      }
      const room = first ? limit : Math.max(1, limit - continuation.length);
      parts.push(`${first ? '' : continuation}${rest.slice(0, room)}`);
      rest = rest.slice(room);
      first = false;
    }
    if (!first) rest = `${continuation}${rest}`;
    const candidate = current ? `${current}\n${rest}` : rest;
    if (candidate.length > limit) {
      if (current) parts.push(current);
      current = rest;
    } else current = candidate;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * The consultant calls, a few at a time. One DeepSeek call on a full batch takes minutes; sixteen in a row would
 * not finish inside a CI job. The estimated cap still holds: before a call starts, what was spent plus the worst case
 * of every call still running plus this call's worst case must fit. The worst case is an estimate from characters
 * and the output limit, and a settled call counts at its reported cost — the hard ceiling is the credit limit on the
 * key (lib/team.mjs). A failed call names its files and does not stop
 * the others; the first call that no longer fits stops every call not yet started.
 *
 * @param messageFor (batch, index) => { system, user }
 * @param call       (message) => Promise<{ review, usage }>
 * @param fits       (committedUsd, inputChars) => boolean — committed = spent plus the worst case of calls in flight
 * @param worstCase  (inputChars) => number
 */
export async function runConsultants({ batches, messageFor, call, fits, worstCase, capUsd, concurrency = 1 }) {
  const run = await runBounded({ count: batches.length, messageFor: (i) => messageFor(batches[i], i), call, fits, worstCase, concurrency });
  const results = [];
  const notReviewed = [];
  batches.forEach((b, i) => {
    const o = run.outcomes[i];
    if (!o) for (const f of b.files) notReviewed.push({ path: f.path, reason: `outside the $${capUsd} cost cap` });
    else if (o.ok) results.push({ ...o.answer, consultant: b.consultant, files: b.files.map((f) => f.path), pinned: (b.pinned || []).map((p) => p.path) });
    else for (const f of b.files) notReviewed.push({ path: f.path, reason: `model call failed: ${o.message}` });
  });
  // Failed calls first in the order they failed, then the ones the cap never started — as before the runner was shared.
  notReviewed.sort((x, y) => (x.reason.startsWith('model call failed') ? 0 : 1) - (y.reason.startsWith('model call failed') ? 0 : 1));
  return { results, notReviewed, failedCalls: run.failedCalls, spent: run.spent, failureReasons: run.failureReasons };
}

/**
 * The bounded runner under both kinds of model call — the consultants and the
 * CISO's verification batches. Calls run a few at a time; before one starts,
 * what was spent plus the worst case of every call still running plus this
 * call's worst case must fit. A settled call counts at its reported cost (or
 * its worst case when it reports none or failed); the first call that does not
 * fit with nothing running stops every call not yet started.
 *
 * Returns one outcome per index: `{ ok: true, answer }`, `{ ok: false, message,
 * code }`, or `undefined` for a call the cap never started. `code` is the
 * closed-list word of `failureReason` — the only part of a failure a public
 * log may carry.
 */
export async function runBounded({ count, messageFor, call, fits, worstCase, concurrency = 1 }) {
  const outcomes = new Array(count);
  const failures = new Map();
  const pending = new Set();
  let spent = 0;
  let inFlight = 0;
  let failedCalls = 0;
  let next = 0;
  let stopped = false;

  const worker = async () => {
    for (;;) {
      if (stopped) return;
      const i = next++;
      if (i >= count) return;
      const message = messageFor(i);
      const chars = message.system.length + message.user.length;
      const worst = worstCase(chars);
      // A call that does not fit beside the running ones waits for one of them to settle: a settled call counts at
      // its actual cost, which frees what its worst case held. Only with nothing running is a misfit final.
      while (!fits(spent + inFlight, chars)) {
        if (!pending.size) {
          stopped = true;
          return;
        }
        await Promise.race(pending);
        if (stopped) return;
      }
      inFlight += worst;
      let task;
      task = (async () => {
        await null; // the task is in `pending` before its body can settle
        try {
          const r = await call(message);
          spent += typeof r.usage?.cost === 'number' ? r.usage.cost : worst;
          outcomes[i] = { ok: true, answer: r };
        } catch (err) {
          failedCalls++;
          spent += worst;
          const text = String(err?.message || err).split('\n')[0];
          const code = failureReason(text);
          failures.set(code, (failures.get(code) || 0) + 1);
          outcomes[i] = { ok: false, message: text, code };
        } finally {
          inFlight -= worst;
          pending.delete(task);
        }
      })();
      pending.add(task);
      await task;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return {
    outcomes,
    failedCalls,
    spent,
    failureReasons: [...failures].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count),
  };
}

/**
 * How much of what the run planned to read in depth it actually read.
 *
 * `planned` is every file that entered a batch, pinned references included —
 * not the repository. Files beyond `maxConsultantCalls` never enter one: they
 * are a designed limitation, named in the report, and counting them here would
 * make the floor fire on a healthy run. So this measures only the coverage that
 * was lost to failure, which is the thing audit.mjs refuses to publish.
 */
export function deepReadCoverage({ batches, deepRead }) {
  const planned = new Set(batches.flatMap((b) => [...b.files.map((f) => f.path), ...(b.pinned || []).map((p) => p.path)]));
  const read = deepRead.filter((p) => planned.has(p)).length;
  return { planned: planned.size, read, ratio: planned.size ? read / planned.size : 1 };
}

/**
 * One of a closed set of words for why a call failed — the only thing about a
 * failure that may reach the public Actions log.
 *
 * The release audit of 2170cf35ea5e (run 35842725923, 23.09.2026) lost 51 of 60
 * consultant calls and said so in a single number at the very end. Between
 * 09:25 and 10:30 the job printed nothing at all, so the reason had to be
 * reconstructed from OpenRouter's billing. That is a broken log.
 *
 * The obvious repair — print the message `callReviewer` threw — is refused
 * here even though that module promises fixed text plus numbers
 * (scripts/qa/lib/openrouter.mjs, header). `runConsultants` catches every
 * throw, not only that module's, and a public repository is the wrong place to
 * find out that some other error carried a fragment of the code under review.
 * So the message is mapped onto a fixed vocabulary and only the word and the
 * count are printed: enough to tell a dead provider from a rate limit from a
 * timeout, and incapable of carrying a finding.
 */
export function failureReason(message) {
  const text = String(message || '');
  if (/no review content/.test(text)) return /finish_reason=length/.test(text) ? 'no-content-cut-at-length' : 'no-content';
  if (/not valid JSON/.test(text)) return /finish_reason=length/.test(text) ? 'not-json-cut-at-length' : 'not-json';
  if (/did not match the schema/.test(text)) return 'schema-mismatch';
  if (/response that is not JSON/.test(text)) return 'body-not-json';
  if (/did not answer within/.test(text)) return 'timeout';
  if (/could not be reached/.test(text)) return 'unreachable';
  const status = /OpenRouter answered HTTP (\d{3})/.exec(text);
  if (status) return `http-${status[1]}`;
  return 'other';
}

/** The attack-surface entries a consultant needs for the files of one call — plus, for the rules, every client write. */
export function surfaceSlice(surface, batch) {
  const paths = new Set([...batch.files.map((f) => f.path), ...(batch.pinned || []).map((p) => p.path)]);
  const inBatch = (e) => paths.has(e.path);
  return {
    apiRoutes: (surface.apiRoutes || []).filter(inBatch),
    sinks: (surface.sinks || []).filter((s) => inBatch(s) || (batch.consultant === 'data-rules' && s.sink === 'client write to Firestore')),
    workflows: (surface.workflows || []).filter(inBatch),
    ...(paths.has('firestore.rules') ? { firestoreRules: surface.firestoreRules } : {}),
    ...(paths.has('middleware.ts') ? { csp: surface.middleware?.csp } : {}),
    ...(batch.consultant === 'frontend-supply-chain' ? { dependencies: surface.dependencies } : {}),
  };
}

export function consultantMessage({ surface, batch, index, count }) {
  const files = batch.files.map((f) => `### ${f.path}${f.part ? ` (part ${f.part} — line numbers are the file's own)` : ''}\n\n\`\`\`\n${f.text}\n\`\`\``).join('\n\n');
  return [
    `## Call ${index + 1} of ${count} for ${batch.consultant} — release ${surface.head}`,
    '## Attack-surface entries for these files',
    '```json',
    JSON.stringify(surfaceSlice(surface, batch), null, 1),
    '```',
    ...(batch.pinned?.length
      ? [
          '## Reference files — in every one of your calls',
          'These are the files your whole domain is judged against. They are here in full, so a statement about them is never a guess: if you are about to write that a file "was not provided" or that a sanitiser or rule "could not be verified", read it below first. Findings about them belong in the call where you actually found something, not once per call.',
          batch.pinned.map((p) => `### ${p.path}\n\n\`\`\`\n${p.text}\n\`\`\``).join('\n\n'),
        ]
      : []),
    '## Files',
    files,
  ].join('\n\n');
}

/**
 * The lines a finding cites, read from the repository, so the CISO verifies against the code and not against the
 * consultant's quote. A location in a file that does not exist says so — an invented path is itself a signal.
 *
 * @param readLines (path) => string[] | null
 */
export function codeContext(finding, readLines, contextLines = AUDIT.contextLines, maxLocations = MAX_CONTEXT_LOCATIONS) {
  const locations = finding.locations || [];
  const shown = locations.slice(0, maxLocations).map(({ file, line }) => {
    const lines = readLines(file);
    if (!lines) return `${file}:${line} — this file is not in the repository at this commit.`;
    if (!Number.isInteger(line) || line < 1 || line > lines.length) return `${file}:${line} — the file has ${lines.length} lines; the cited line does not exist.`;
    const from = Math.max(1, line - contextLines);
    const to = Math.min(lines.length, line + contextLines);
    return `${file}:${from}-${to}\n\`\`\`\n${lines.slice(from - 1, to).map((l, i) => `${from + i}|${l}`).join('\n')}\n\`\`\``;
  });
  // A location without its code cannot be verified here — said, so it cannot enter the report as if it had been.
  const rest = locations.slice(maxLocations);
  if (rest.length) shown.push(`${rest.length} further location(s) without code in this input — not verifiable here: ${rest.map((l) => `${l.file}:${l.line}`).join(', ')}`);
  return shown.join('\n');
}

/** Code context for this many locations of one finding; the rest is named as not verifiable. */
export const MAX_CONTEXT_LOCATIONS = 8;

/**
 * Ask once more when — and only when — the answer arrived cut off.
 *
 * The client never retries a call that may already have been generated and
 * billed, and for the consultants that is right: one lost batch is one hole in
 * the coverage. The CISO call is different — it is the last of some sixty and
 * the only one whose loss costs the whole audit. On 2026-09-15 the release audit
 * of 33471220d6e9 ran for seventy minutes, all 57 consultant calls succeeded,
 * and the CISO's HTTP 200 arrived with a body that was not JSON, so three
 * dollars of audit produced nothing. A truncated body is the one error that
 * says nothing about the answer; a wrong answer or a refusal stays final.
 *
 * @param call    (attempt) => Promise<answer>
 * @param retries how many extra asks a truncated body is worth; 1 for the CISO
 * @param warn    (attemptNumber) => void, told before each extra ask
 */
export async function askAgainIfTruncated(call, { retries = 1, warn = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(attempt);
    } catch (err) {
      const message = String(err?.message || err).split('\n')[0];
      if (attempt < retries && /response that is not JSON/.test(message)) {
        warn(attempt + 1);
        continue;
      }
      throw err;
    }
  }
}

const RANK = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3, info: 4 };

/**
 * The issue class of a finding, for merging duplicates: a CWE, an OWASP API or
 * LLM Top 10 entry, an OWASP Top 10 entry — or, without any of those, the
 * category's own words (the title's when the category is empty). Two
 * consultants who file the same defect under different taxonomies are not
 * merged: a duplicate verified twice costs cents, two defects merged into one
 * lose one of them.
 */
export function issueClass(finding) {
  const c = String(finding?.category || '');
  let m;
  if ((m = /CWE[-\s]?(\d+)/i.exec(c))) return `cwe-${Number(m[1])}`;
  if ((m = /\bLLM\s?0?(\d{1,2})\b/i.exec(c))) return `llm-${Number(m[1])}`;
  if ((m = /\bAPI\s?0?(\d{1,2})\b/i.exec(c))) return `api-${Number(m[1])}`;
  if ((m = /\bA0?(\d{1,2})(?::20\d\d)?\b/.exec(c))) return `owasp-a${Number(m[1])}`;
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
  return words(c) || `title:${words(finding?.title)}`;
}

/**
 * Every consultant finding as one candidate for verification, duplicates merged.
 *
 * Two findings are duplicates when they share an issue class and cite the same
 * file at lines at most `distance` apart; merging is transitive. The merged
 * candidate keeps the text of its most severe, most confident report, the
 * highest severity, every location, and every source — which consultant said
 * what — so nothing a consultant reported disappears in the merge.
 *
 * The release audit of v2.18.0 (81810c8, run 35998405111) had 194 candidates
 * from five consultants; a consultant reading a file in several calls and two
 * domains meeting at one route report the same defect more than once.
 */
export function dedupeCandidates(results, { distance = AUDIT.dedupeLineDistance } = {}) {
  const all = results.flatMap((r) => (r.review?.findings || []).map((f) => ({ ...f, consultant: r.consultant })));
  const parent = all.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const classes = all.map(issueClass);
  const near = (x, y) => (x.locations || []).some((a) => (y.locations || []).some((b) => a.file === b.file && Math.abs((Number(a.line) || 0) - (Number(b.line) || 0)) <= distance));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (classes[i] === classes[j] && near(all[i], all[j])) parent[find(j)] = find(i);
  const groups = new Map();
  all.forEach((f, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(f);
  });
  return [...groups.values()].map((group) => {
    const primary = [...group].sort((x, y) => (RANK[x.severity] ?? 9) - (RANK[y.severity] ?? 9) || (Number(y.confidence) || 0) - (Number(x.confidence) || 0))[0];
    const seen = new Set();
    const locations = group
      .flatMap((f) => f.locations || [])
      .filter((l) => {
        const key = `${l.file}:${l.line}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return {
      title: primary.title,
      severity: primary.severity,
      category: primary.category,
      class: issueClass(primary),
      locations,
      preconditions: primary.preconditions,
      impact: primary.impact,
      evidence: primary.evidence,
      recommendation: primary.recommendation,
      verification: primary.verification,
      confidence: Math.max(...group.map((f) => Number(f.confidence) || 0)),
      verified: group.some((f) => f.verified === true),
      // The primary report first, so the entry can say what else was merged into it.
      sources: [primary, ...group.filter((f) => f !== primary)].map((f) => ({ consultant: f.consultant, title: f.title, severity: f.severity })),
    };
  });
}

/**
 * The order and the batches of verification: most severe first, then most
 * confident, each candidate named `K-001`, `K-002`, … in that order.
 * `batchSize` candidates per call, at most `maxCalls` calls; the candidates
 * beyond are returned by name with their reason — never dropped.
 */
export function planVerification(candidates, { batchSize = AUDIT.verificationBatchSize, maxCalls = AUDIT.maxVerificationCalls } = {}) {
  const width = Math.max(3, String(candidates.length).length);
  const ordered = candidates
    .map((c, i) => ({ c, i }))
    .sort((x, y) => (RANK[x.c.severity] ?? 9) - (RANK[y.c.severity] ?? 9) || (Number(y.c.confidence) || 0) - (Number(x.c.confidence) || 0) || x.i - y.i)
    .map(({ c }, k) => ({ ...c, id: `K-${String(k + 1).padStart(width, '0')}` }));
  const batches = [];
  for (let k = 0; k < ordered.length && batches.length < maxCalls; k += batchSize) batches.push(ordered.slice(k, k + batchSize));
  const planned = batches.reduce((n, b) => n + b.length, 0);
  const beyond = ordered.slice(planned).map((candidate) => ({ candidate, reason: `outside the ${maxCalls}-call limit of the verification` }));
  return { candidates: ordered, batches, beyond };
}

const clip = (value, n) => {
  const t = String(value ?? '');
  return t.length > n ? `${t.slice(0, n)} …` : t;
};

/**
 * One candidate as the CISO sees it, with the code at its cited lines, in at
 * most `maxChars` characters. The code window and the text fields shrink step
 * by step until the entry fits its share of the call — the code is what the
 * verification is for, so it is never the part that is left out first.
 */
export function candidateEntry(candidate, readLines, { maxChars, contextLines = AUDIT.verificationContextLines, maxLocations = AUDIT.verificationMaxLocations } = {}) {
  // A minified line is one line; it must not eat a candidate's share.
  const lines = (p) => readLines(p)?.map((l) => clip(l, 300)) ?? null;
  const steps = [
    { context: contextLines, field: 600, locations: maxLocations },
    { context: Math.min(contextLines, 6), field: 400, locations: maxLocations },
    { context: Math.min(contextLines, 3), field: 250, locations: maxLocations },
    { context: 1, field: 150, locations: Math.min(maxLocations, 2) },
    { context: 0, field: 100, locations: 1 },
  ];
  const others = (candidate.sources || []).slice(1);
  const sources = [...new Set((candidate.sources || []).map((s) => s.consultant))].join(', ') || 'unknown';
  let entry = '';
  for (const step of steps) {
    entry = [
      `### ${candidate.id} · proposed ${candidate.severity} · from ${sources}${others.length ? ` (${others.length + 1} reports merged)` : ''} · consultant verified: ${candidate.verified ? 'yes' : 'no'} · confidence ${candidate.confidence}`,
      `${clip(candidate.title, step.field)} (${clip(candidate.category, 120)})`,
      `Preconditions: ${clip(candidate.preconditions, step.field)}`,
      `Impact: ${clip(candidate.impact, step.field)}`,
      `Evidence quoted: ${clip(candidate.evidence, step.field)}`,
      `Recommendation: ${clip(candidate.recommendation, step.field)}`,
      `How to verify: ${clip(candidate.verification, step.field)}`,
      ...(others.length ? [`Also reported as: ${others.map((s) => `"${clip(s.title, 120)}" (${s.consultant}, ${s.severity})`).join('; ')}`] : []),
      'Code at the cited locations:',
      codeContext(candidate, lines, step.context, step.locations),
    ].join('\n');
    if (entry.length <= maxChars) return entry;
  }
  // A candidate with hundreds of locations: the list of those without code is what is cut, and it says so.
  return `${entry.slice(0, Math.max(0, maxChars - 60))}\n(cut here: the entry did not fit its share)`;
}

/**
 * The user message of one verification call: its candidates, each with its
 * code, in at most `maxChars` characters. Every candidate gets an equal share
 * of what the header leaves, so a full batch always fits — the failure of
 * v2.18.0, where 194 candidates' text filled one call and not one of them got
 * its code, cannot recur.
 */
export function verificationMessage({ batch, index, count, total, readLines, maxChars = AUDIT.verificationInputChars }) {
  const head = [
    `## Verification call ${index + 1} of ${count} — ${batch.length} of ${total} candidate findings (${batch[0]?.id}–${batch.at(-1)?.id})`,
    'Each candidate below comes with the code at its cited lines, read from the repository at this commit. Judge each one against that code only. The other candidates are verified in other calls; do not guess about them.',
    '## Candidates',
  ].join('\n\n');
  const SEPARATOR = '\n\n';
  const share = Math.floor((maxChars - head.length - SEPARATOR.length * batch.length) / Math.max(1, batch.length));
  const entries = batch.map((c) => candidateEntry(c, readLines, { maxChars: Math.max(0, share) }));
  return [head, ...entries].join(SEPARATOR);
}

/**
 * The verification calls, run through the bounded runner. A call that came back
 * verified every candidate it was shown — the ones it kept are findings, the
 * ones it dropped did not hold. A call that failed, or that the budget never
 * started, leaves its candidates *not verified*, by name, with a reason from a
 * closed list.
 */
export async function runVerification({ batches, messageFor, call, fits, worstCase, capUsd, concurrency = 1 }) {
  const run = await runBounded({ count: batches.length, messageFor: (i) => messageFor(batches[i], i), call, fits, worstCase, concurrency });
  const results = [];
  const notVerified = [];
  batches.forEach((b, i) => {
    const o = run.outcomes[i];
    if (o?.ok) results.push({ ...o.answer, candidates: b.map((c) => c.id) });
    else for (const candidate of b) notVerified.push({ candidate, reason: o ? `verification call failed (${o.code})` : `outside the $${capUsd} cost cap` });
  });
  return { results, notVerified, failedCalls: run.failedCalls, spent: run.spent, failureReasons: run.failureReasons };
}

/** A not-verified candidate as the sealed report carries it: by name, with where, who and why. */
export function notVerifiedEntry({ candidate, reason }) {
  return {
    id: candidate.id,
    title: candidate.title,
    severity: candidate.severity,
    category: candidate.category,
    locations: candidate.locations,
    consultants: [...new Set((candidate.sources || []).map((s) => s.consultant))],
    reason,
  };
}

/*
 * One loose answer must not cost a consultant's whole batch or the report: a severity in English, a line or a
 * confidence sent as text. These bring an answer into the schema's types before validation. They only convert;
 * a field the model left out becomes empty, never an invented statement, and the result is still validated.
 */
const SEVERITY_WORDS = { kritisch: 'kritisch', critical: 'kritisch', hoch: 'hoch', high: 'hoch', mittel: 'mittel', medium: 'mittel', moderate: 'mittel', niedrig: 'niedrig', low: 'niedrig', info: 'info', informational: 'info' };
const text = (v) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));
const list = (v) => (Array.isArray(v) ? v : []);
const severity = (v, fallback) => SEVERITY_WORDS[String(v ?? '').trim().toLowerCase()] || fallback;
const unit = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const locations = (v) => list(v).map((l) => ({ file: text(l?.file), line: Number.parseInt(l?.line, 10) || 0 }));

export function coerceConsultant(answer) {
  return {
    findings: list(answer?.findings).map((f) => ({
      title: text(f?.title),
      severity: severity(f?.severity, 'info'),
      category: text(f?.category),
      locations: locations(f?.locations),
      preconditions: text(f?.preconditions),
      impact: text(f?.impact),
      evidence: text(f?.evidence),
      recommendation: text(f?.recommendation),
      verification: text(f?.verification),
      confidence: unit(f?.confidence),
      verified: f?.verified === true || String(f?.verified).trim().toLowerCase() === 'true',
    })),
    checked_sound: list(answer?.checked_sound).map(text),
    notes: text(answer?.notes),
  };
}

/**
 * What the second CISO call is shown: the findings that survived the first one,
 * in their own words and without a line of code, plus the map and the counted
 * coverage. It writes the report around them — summary, rating, hardening,
 * positives, limitations — and never adds or removes a finding.
 *
 * Small on purpose. The single call it replaces had to hold every consultant
 * finding, the code under each of them, and the whole report in one answer;
 * three release audits in a row ended without one.
 */
export function narrativeMessage({ surface, coverage, findings, notRead, failed, droppedNote, verification = null, maxChars = AUDIT.narrativeInputChars }) {
  const bySeverity = findings.reduce((n, f) => ({ ...n, [f.severity]: (n[f.severity] || 0) + 1 }), {});
  const open = verification?.notVerified || [];
  const openBySeverity = open.reduce((n, c) => ({ ...n, [c.severity]: (n[c.severity] || 0) + 1 }), {});
  const head = [
    '## The findings of this audit: you verified them against the code. Neither add nor remove any.',
    '```json',
    JSON.stringify({ total: findings.length, bySeverity }, null, 1),
    '```',
    // v2.18.0 (run 35998405111): nothing was verified and the report said "risk low".
    // The unverified part is counted here so the prose cannot read the verified part as the whole.
    ...(verification
      ? [
          `## Verification — counted by the pipeline; use these numbers`,
          `${verification.candidates} candidate finding(s) after merging duplicates · ${verification.verified} verified against the code · ${open.length} NOT verified.`,
          ...(open.length
            ? [
                `The ${open.length} candidate(s) not verified (proposed severities: ${JSON.stringify(openBySeverity)}) are listed by name in the report. They are neither findings nor "no finding". Say in the executive summary how many candidates were verified and how many were not, and do not rate the overall risk as low on the strength of the verified part alone.`,
              ]
            : []),
        ]
      : []),
    '## Coverage — counted by the pipeline; use these numbers',
    `${coverage.files_in_scope} files in scope · ${coverage.deep_read} read in depth by a consultant · ${coverage.pattern_scanned_only} covered by the deterministic scan only.`,
    notRead.length ? `Not read in depth: ${notRead.length} file(s), with reasons recorded in the report.` : 'Every file assigned to a consultant was read.',
    failed ? `${failed} consultant call(s) failed; their files count as not read in depth.` : '',
    droppedNote ? `From the verification step: ${droppedNote}` : '',
    `## Attack surface`,
    '```json',
    JSON.stringify({
      head: surface.head,
      files: { inScope: surface.files.total, byDomain: surface.files.byDomain },
      apiRoutes: surface.apiRoutes?.length || 0,
      routesWithoutAuthMarker: (surface.apiRoutes || []).filter((r) => !r.authMarkers.length).length,
      openFirestoreRules: surface.firestoreRules?.openRules || [],
      dependencies: surface.dependencies,
    }, null, 1),
    '```',
  ].filter(Boolean);
  const texts = findings.map((f, i) => [
    `### ${i + 1} · ${f.severity} · ${f.category}`,
    f.title,
    `Impact: ${f.impact}`,
    `Where: ${(f.locations || []).map((l) => `${l.file}:${l.line}`).join(', ') || 'not located'}`,
    `Recommended: ${f.recommendation}`,
  ].join('\n'));
  let body = texts.join('\n\n');
  // The findings' own text is never dropped — a report that describes fewer
  // findings than it lists would be worse than a long message.
  // The limit is the reserve this call was costed with, so it is enforced
  // rather than observed: the least severe findings are dropped first, and
  // the message says how many, so the model cannot describe a report it was
  // not shown (QA review of 7b8add43fa26, 51e8afcef5fb).
  const room = maxChars - head.join('\n\n').length - 200;
  const order = texts.map((_, i) => i).sort((x, y) => (RANK[findings[x].severity] ?? 9) - (RANK[findings[y].severity] ?? 9) || x - y);
  const kept = new Set();
  let used = 0;
  for (const i of order) {
    const cost = texts[i].length + 2;
    if (used + cost > room) break;
    kept.add(i);
    used += cost;
  }
  const omitted = texts.length - kept.size;
  body = texts.filter((_, i) => kept.has(i)).join('\n\n');
  const note = omitted
    ? `(${omitted} further finding(s) of the lowest severities are not listed here; they are in the report and counted above.)`
    : '';
  return [...head, body || '(no finding survived verification)', note].filter(Boolean).join('\n\n');
}

/** The findings half of a report, coerced on its own (the first CISO call). */
export function coerceFindings(answer) {
  return coerceReport({ findings: answer?.findings }).findings;
}

/** The prose half, coerced on its own (the second CISO call). */
export function coerceNarrative(answer) {
  const { executive_summary, risk_rating, hardening, positive_observations, coverage, limitations } = coerceReport(answer);
  return { executive_summary, risk_rating, hardening, positive_observations, coverage, limitations };
}

/**
 * A report written without the model, from findings that already exist.
 *
 * Used when a CISO call does not come back. The alternative was to throw away
 * fifty consultant calls, which is what happened three releases in a row: the
 * findings were there, and the audit reported nothing at all. What this
 * produces says plainly which half is missing, so nobody reads it as a CISO's
 * verdict (`limitations`, and the summary's first sentence).
 */
export function reportWithoutNarrative({ findings, coverage, reason }) {
  const worst = ['kritisch', 'hoch', 'mittel', 'niedrig'].find((level) => findings.some((f) => f.severity === level)) || 'niedrig';
  const counted = ['kritisch', 'hoch', 'mittel', 'niedrig', 'info']
    .map((level) => [level, findings.filter((f) => f.severity === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(', ') || 'keine';
  return {
    executive_summary: [
      'Dieser Bericht hat keine CISO-Zusammenfassung: der abschließende Aufruf kam nicht zurück.',
      `Er enthält die am Code verifizierten Befunde (${counted}) und die gezählte Abdeckung, sonst nichts.`,
      'Die Einstufung unten ist der schwerste Einzelbefund, nicht das Urteil eines Prüfers über das Ganze.',
    ].join(' '),
    risk_rating: worst,
    findings,
    hardening: [],
    positive_observations: [],
    coverage: { ...coverage },
    limitations: [
      `Die Synthese fehlt: ${reason}`,
      'Die Befunde hat der CISO am Code geprüft; eine Gesamteinschätzung über sie hinaus gibt es nicht.',
      'Ohne Synthese gibt es keine Härtungsempfehlungen und keine positiven Beobachtungen in diesem Bericht.',
    ],
  };
}

export function coerceReport(answer) {
  const coverage = answer?.coverage || {};
  return {
    executive_summary: text(answer?.executive_summary),
    risk_rating: severity(answer?.risk_rating, 'mittel') === 'info' ? 'niedrig' : severity(answer?.risk_rating, 'mittel'),
    findings: list(answer?.findings).map((f) => ({
      title: text(f?.title),
      severity: severity(f?.severity, 'info'),
      category: text(f?.category),
      locations: locations(f?.locations),
      description: text(f?.description),
      preconditions: text(f?.preconditions),
      impact: text(f?.impact),
      evidence: text(f?.evidence),
      recommendation: text(f?.recommendation),
      verification: text(f?.verification),
      confidence: unit(f?.confidence),
    })),
    hardening: list(answer?.hardening).map((h) => ({ title: text(h?.title), priority: ['P1', 'P2', 'P3'].includes(String(h?.priority).toUpperCase()) ? String(h.priority).toUpperCase() : 'P3', rationale: text(h?.rationale) })),
    positive_observations: list(answer?.positive_observations).map(text),
    coverage: { files_in_scope: Number.parseInt(coverage.files_in_scope, 10) || 0, deep_read: Number.parseInt(coverage.deep_read, 10) || 0, pattern_scanned_only: Number.parseInt(coverage.pattern_scanned_only, 10) || 0, notes: text(coverage.notes) },
    limitations: list(answer?.limitations).map(text),
  };
}

/** Coverage is counted, not estimated: the model's numbers are replaced; its notes are kept. */
export function withCountedCoverage(report, coverage) {
  return { ...report, coverage: { ...coverage, notes: [coverage.notes, report.coverage?.notes].filter(Boolean).join(' ') } };
}

/**
 * The limitation every report carries when candidates remain unverified — in
 * German, deterministic, never left to the model. Null when every candidate was
 * verified.
 */
export function verificationLimitation({ candidates, verified, notVerified }) {
  if (!notVerified.length) return null;
  const bySeverity = ['kritisch', 'hoch', 'mittel', 'niedrig', 'info']
    .map((level) => [level, notVerified.filter((c) => c.severity === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(', ');
  return `Nicht vollständig geprüft: ${verified} von ${candidates} Kandidaten wurden am Code verifiziert, ${notVerified.length} nicht (vorgeschlagen: ${bySeverity}). Sie stehen namentlich unter „Nicht verifiziert"; ihre Zahl ist weder ein Befund noch „kein Befund".`;
}
