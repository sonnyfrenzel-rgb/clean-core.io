import { AUDIT, CONSULTANTS, PATTERN_ONLY } from './team.mjs';

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
 */
export function planBatches(files, prepare, { batchChars = AUDIT.batchChars, maxCalls = AUDIT.maxConsultantCalls, only = null } = {}) {
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
    let current = null;
    for (const f of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
      // A file larger than one call is read in consecutive parts; its line numbers are the file's own.
      const parts = splitText(prepare(f.path), batchChars - f.path.length - 64);
      const skipped = [];
      parts.forEach((text, k) => {
        const size = text.length + f.path.length + 64;
        if (!current || current.chars + size > batchChars) {
          if (batches.length >= maxCalls) {
            skipped.push(k);
            return;
          }
          current = { consultant, files: [], chars: 0 };
          batches.push(current);
        }
        current.files.push({ path: f.path, text, part: parts.length > 1 ? `${k + 1}/${parts.length}` : null });
        current.chars += size;
      });
      if (skipped.length) notRead.push({ path: f.path, reason: `outside the ${maxCalls}-call limit${parts.length > 1 ? ` (${skipped.length} of ${parts.length} parts)` : ''}` });
    }
  }
  return { batches, patternOnly, notRead };
}

/** Split at line ends into pieces of at most `limit` characters; a single longer line is cut where it must be. */
export function splitText(text, limit) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    let rest = line;
    while (rest.length > limit) {
      if (current) {
        parts.push(current);
        current = '';
      }
      parts.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    const candidate = current ? `${current}\n${rest}` : rest;
    if (candidate.length > limit) {
      parts.push(current);
      current = rest;
    } else current = candidate;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * The consultant calls, a few at a time. One DeepSeek call on a full batch takes minutes; sixteen in a row would
 * not finish inside a CI job. The cap still holds: before a call starts, what was spent plus the worst case of
 * every call still running plus this call's worst case must fit. A failed call names its files and does not stop
 * the others; the first call that no longer fits stops every call not yet started.
 *
 * @param messageFor (batch, index) => { system, user }
 * @param call       (message) => Promise<{ review, usage }>
 * @param fits       (committedUsd, inputChars) => boolean — committed = spent plus the worst case of calls in flight
 * @param worstCase  (inputChars) => number
 */
export async function runConsultants({ batches, messageFor, call, fits, worstCase, capUsd, concurrency = 1 }) {
  const results = new Array(batches.length);
  const notReviewed = [];
  const started = new Set();
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
      if (i >= batches.length) return;
      const message = messageFor(batches[i], i);
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
      started.add(i);
      inFlight += worst;
      let task;
      task = (async () => {
        await null; // the task is in `pending` before its body can settle
        try {
          const r = await call(message);
          spent += typeof r.usage?.cost === 'number' ? r.usage.cost : worst;
          results[i] = { ...r, consultant: batches[i].consultant, files: batches[i].files.map((f) => f.path) };
        } catch (err) {
          failedCalls++;
          spent += worst;
          for (const f of batches[i].files) notReviewed.push({ path: f.path, reason: `model call failed: ${String(err?.message || err).split('\n')[0]}` });
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
  batches.forEach((b, i) => {
    if (!started.has(i)) for (const f of b.files) notReviewed.push({ path: f.path, reason: `outside the $${capUsd} cost cap` });
  });
  return { results: results.filter(Boolean), notReviewed, failedCalls, spent };
}

/** The attack-surface entries a consultant needs for the files of one call — plus, for the rules, every client write. */
export function surfaceSlice(surface, batch) {
  const paths = new Set(batch.files.map((f) => f.path));
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
export function codeContext(finding, readLines, contextLines = AUDIT.contextLines) {
  return (finding.locations || [])
    .slice(0, 3)
    .map(({ file, line }) => {
      const lines = readLines(file);
      if (!lines) return `${file}:${line} — this file is not in the repository at this commit.`;
      if (!Number.isInteger(line) || line < 1 || line > lines.length) return `${file}:${line} — the file has ${lines.length} lines; the cited line does not exist.`;
      const from = Math.max(1, line - contextLines);
      const to = Math.min(lines.length, line + contextLines);
      return `${file}:${from}-${to}\n\`\`\`\n${lines.slice(from - 1, to).map((l, i) => `${from + i}|${l}`).join('\n')}\n\`\`\``;
    })
    .join('\n');
}

/** What the CISO is shown: the map in numbers, the deterministic coverage, every consultant finding with its cited code. */
export function cisoMessage({ surface, results, coverage, notRead, failed, readLines }) {
  const findings = results.flatMap((r) => (r.review.findings || []).map((f) => ({ ...f, consultant: r.consultant })));
  const unauthenticatedRoutes = (surface.apiRoutes || []).filter((r) => !r.authMarkers.length).map((r) => `${r.path} [${r.methods.join(',')}]`);
  const summary = {
    head: surface.head,
    files: { inScope: surface.files.total, byDomain: surface.files.byDomain, excluded: surface.files.excluded },
    apiRoutes: surface.apiRoutes?.length || 0,
    routesWithoutAuthMarker: unauthenticatedRoutes,
    sinks: Object.entries((surface.sinks || []).reduce((n, s) => ({ ...n, [s.sink]: (n[s.sink] || 0) + 1 }), {})),
    workflowsWithWritePermissions: (surface.workflows || []).filter((w) => w.writePermissions.length).map((w) => `${w.path}: ${w.writePermissions.join(',')}`),
    openFirestoreRules: surface.firestoreRules?.openRules || [],
    dependencies: surface.dependencies,
  };
  return [
    '## Attack-surface summary',
    '```json',
    JSON.stringify(summary, null, 1),
    '```',
    '## Coverage — counted by the pipeline; use these numbers',
    `${coverage.files_in_scope} files in scope · ${coverage.deep_read} read in depth by a consultant · ${coverage.pattern_scanned_only} covered by the pattern scan only.`,
    notRead.length ? `Not read in depth, with reason:\n${notRead.map((n) => `- ${n.path}: ${n.reason}`).join('\n')}` : 'Every file assigned to a consultant was read.',
    failed ? `${failed} consultant call(s) failed; their files are in the list above.` : '',
    `## Consultant findings (${findings.length}) — verify each against its code before it enters the report`,
    ...findings.map((f, i) =>
      [
        `### C-${i + 1} · ${f.consultant} · proposed ${f.severity} · consultant verified: ${f.verified ? 'yes' : 'no'} · confidence ${f.confidence}`,
        `${f.title} (${f.category})`,
        `Preconditions: ${f.preconditions}`,
        `Impact: ${f.impact}`,
        `Evidence quoted: ${f.evidence}`,
        `Recommendation: ${f.recommendation}`,
        `How to verify: ${f.verification}`,
        'Code at the cited locations:',
        codeContext(f, readLines),
      ].join('\n'),
    ),
    '## Checked and found sound by the consultants',
    results.flatMap((r) => (r.review.checked_sound || []).map((s) => `- ${r.consultant}: ${s}`)).join('\n') || '(nothing listed)',
    '## Consultant notes',
    results.map((r) => (r.review.notes ? `- ${r.consultant}: ${r.review.notes}` : '')).filter(Boolean).join('\n') || '(none)',
  ]
    .filter(Boolean)
    .join('\n\n');
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
