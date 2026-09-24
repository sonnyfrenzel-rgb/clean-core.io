#!/usr/bin/env node
/**
 * Security audit of one release on `main` — the CI entry point (.github/workflows/security-audit.yml, job `audit`).
 *
 *   node scripts/security/audit.mjs              CI: full audit, sealed with the public key
 *   SECURITY_AUDIT_MODE=self-test node scripts/security/audit.mjs
 *                                                the same chain on two files with a $0.20 cap — run on dev when the
 *                                                agent itself changes, so every link is proven before main
 *
 * Guardrails (docs/SECURITY-AUDIT-AGENT.md §2): a pipeline of model calls without tools. Five consultants receive
 * the code of their domain, the CISO receives their findings with the cited lines, and nothing else reaches the
 * model. Every outgoing text is redacted first. This job holds the model key and the public key only — it can seal
 * a report but not open one, and it never sees the mail key.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPublicByDesign, publicByDesignValues } from '../qa/lib/config.mjs';
import { callReviewer } from '../qa/lib/openrouter.mjs';
import { redactSecrets } from '../qa/lib/redact.mjs';
import { AUDIT_PUBLIC_PEM, sealFor } from './lib/envelope.mjs';
import { askAgainIfTruncated, coerceConsultant, coerceFindings, coerceNarrative, consultantMessage, dedupeCandidates, deepReadCoverage, failureReason, narrativeMessage, notVerifiedEntry, numbered, planBatches, planVerification, reportWithoutNarrative, runConsultants, runVerification, verificationLimitation, verificationMessage, withCountedCoverage } from './lib/pipeline.mjs';
import { surfaceMap } from './lib/surface.mjs';
import { AUDIT, CONSULTANTS, CONSULTANT_SCHEMA, FINDINGS_SCHEMA, NARRATIVE_SCHEMA } from './lib/team.mjs';

const SELF_TEST = process.env.SECURITY_AUDIT_MODE === 'self-test';
const WORK = join(AUDIT.workDir, 'work');
const OUT = join(AUDIT.workDir, 'out');
const CHARS_PER_TOKEN = 3.5;

/**
 * Two tasks, because one answer was too much to finish.
 *
 * The CISO used to write the verdict on every consultant finding and the whole
 * report around it in a single answer. Three release audits in a row came back
 * as a body that was not JSON, each time after some fifty consultant calls had
 * already been paid for and read. Sonny approved the split on 16.09.2026: the
 * findings first, the prose second, and whatever comes back is delivered even
 * if the other half does not.
 */
export const CISO_FINDINGS_TASK = [
  'Verify every candidate finding below against the code quoted with it, and answer with the findings that hold.',
  'Drop what the code does not support; merge duplicates among these candidates; correct a severity the code does not justify.',
  'Answer with findings only — no summary, no rating, no hardening list. Those are asked for separately.',
  'Every field of the schema is required for every finding, in German, in the voice your system prompt describes.',
].join(' ');

export const CISO_NARRATIVE_TASK = [
  'Write the report around the findings below: they are verified, and you neither add nor remove any.',
  'Executive summary, risk rating, hardening, positive observations, coverage notes and limitations, in German,',
  'in the voice your system prompt describes.',
].join(' ');

const estimate = (chars, maxOutputTokens) => (chars / CHARS_PER_TOKEN / 1e6) * AUDIT.price.input + (maxOutputTokens / 1e6) * AUDIT.price.output;

async function main() {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set — the audit cannot run.');

  const started = Date.now();
  const surface = surfaceMap();
  writeFileSync(join(WORK, 'surface.json'), JSON.stringify(surface, null, 2));

  // Nothing leaves the runner unredacted. A hit is reported as a finding — without its value.
  const secretHits = [];
  const publicValues = publicByDesignValues();
  const clean = (path, text) => {
    const r = redactSecrets(text, publicValues);
    for (const h of r.hits) secretHits.push({ path, ...h });
    return r.text;
  };
  const raw = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
  // A location the model names is looked up only among the files of the map: never an absolute path, never
  // something outside the repository, never a file the map excludes.
  const inScope = new Set(surface.files.list.map((f) => f.path));
  const readLines = (path) => {
    const text = inScope.has(path) ? raw(path) : null;
    return text === null ? null : clean(path, text).split(/\r?\n/);
  };

  const cap = SELF_TEST ? AUDIT.selfTestCostUsd : AUDIT.maxCostUsd;
  const consultantTokens = SELF_TEST ? 12_000 : AUDIT.consultantOutputTokens;
  const cisoTokens = SELF_TEST ? 20_000 : AUDIT.cisoOutputTokens;
  const brief = readFileSync(AUDIT.briefPath, 'utf8');

  const plan = planBatches(surface.files.list, (path) => clean(path, numbered(raw(path) ?? '')), { only: SELF_TEST ? AUDIT.selfTestFiles : null, maxCalls: SELF_TEST ? 1 : AUDIT.maxConsultantCalls });
  // Every CISO call is reserved out of the cap before any consultant spends —
  // each verification call at the size verificationMessage enforces, plus the
  // brief and the task around it, and the narrative — so the consultants can
  // never use up what verifying their findings needs.
  const maxVerificationCalls = SELF_TEST ? 1 : AUDIT.maxVerificationCalls;
  const verificationCallWorst = estimate(brief.length + CISO_FINDINGS_TASK.length + 2 + AUDIT.verificationInputChars, cisoTokens);
  const narrativeReserve = estimate(brief.length + CISO_NARRATIVE_TASK.length + 2 + AUDIT.narrativeInputChars, SELF_TEST ? 6_000 : AUDIT.narrativeOutputTokens);
  const cisoReserve = maxVerificationCalls * verificationCallWorst + narrativeReserve;

  const run = await runConsultants({
    batches: plan.batches,
    capUsd: cap,
    concurrency: SELF_TEST ? 1 : AUDIT.concurrency,
    messageFor: (batch, i) => ({ system: CONSULTANTS[batch.consultant].prompt, user: clean('outgoing message', consultantMessage({ surface, batch, index: i, count: plan.batches.length })) }),
    fits: (committed, chars) => committed + estimate(chars, consultantTokens) + cisoReserve <= cap,
    worstCase: (chars) => estimate(chars, consultantTokens),
    call: ({ system, user }) =>
      callReviewer({ apiKey, system, user, schema: CONSULTANT_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.consultantEffort, model: AUDIT.model, providers: AUDIT.providers, maxTokens: consultantTokens, name: 'security_consultant', title: 'Clean-Core.io Security Audit', timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: coerceConsultant }),
  });
  const { results } = run;
  // Why the calls that failed, failed — a fixed word per reason and a count, never
  // a message and never a finding (lib/pipeline.mjs failureReason).
  for (const { reason, count } of run.failureReasons) console.warn(`Consultant calls failed: ${reason} ×${count}`);
  const notRead = [...plan.notRead, ...run.notReviewed];
  const unread = new Set(notRead.map((n) => n.path));
  // A file in parts counts once, and only if none of its parts failed.
  // A pinned reference file (lib/team.mjs PINNED) rides along in every call of
  // its consultant, so it counts as read as soon as one of those calls came
  // back — that is the whole point of pinning it, and subtracting it because
  // some other call failed would report the coverage the old packing had.
  const pinnedRead = new Set(results.flatMap((r) => r?.pinned || []));
  const deepRead = [...new Set(plan.batches.flatMap((b) => b.files.map((f) => f.path)))].filter(
    (p) => !unread.has(p) || pinnedRead.has(p),
  );
  for (const p of pinnedRead) if (!deepRead.includes(p)) deepRead.push(p);

  const filesInScope = SELF_TEST ? AUDIT.selfTestFiles.length : surface.files.total;
  const coverage = {
    files_in_scope: filesInScope,
    deep_read: deepRead.length,
    pattern_scanned_only: filesInScope - deepRead.length,
    notes: SELF_TEST ? 'Selbsttest: nur zwei Dateien, ein Berater.' : `Tiefe Lektüre durch fünf Berater in ${plan.batches.length} Aufrufen; Testdateien nur über das Muster-Scanning der Angriffsflächenkarte.`,
  };

  // An audit that read a sixth of what it set out to read is not an audit.
  //
  // Until now the only thing that could stop the run was both CISO calls
  // failing. In run 35842725923 (23.09.2026) 51 of 60 consultant calls failed,
  // and had either CISO call come back, a report would have gone out under the
  // CISO's name with a verdict on the ninth of the code that was read — the
  // coverage numbers are in the sealed report, but they are three integers
  // beside an executive summary that reads like a full audit. The precedent is
  // on record: at v2.14.0 ten of fifty-one calls failed and the model rated
  // three findings `kritisch` on files it never received (lib/team.mjs PINNED).
  //
  // The floor is on what this run planned to read, not on the repository: files
  // beyond the `maxConsultantCalls` limit are a designed limitation, named in
  // the report, and never enter a batch. So this measures exactly the loss that
  // is not by design. Below the floor the job fails loudly and no mail goes out;
  // a re-run costs minutes and a few cents, a believed report costs more.
  const planned = deepReadCoverage({ batches: plan.batches, deepRead });
  if (planned.ratio < AUDIT.minDeepReadRatio) {
    throw new Error(
      `too little was read for this to be an audit (${planned.read} of ${planned.planned} planned files, ${Math.round(planned.ratio * 100)}% < ${Math.round(AUDIT.minDeepReadRatio * 100)}%; consultant calls ${results.length}, failed ${run.failedCalls})`,
    );
  }

  // Each CISO call is asked once more when its 200 arrives with a body that is
  // not JSON (askAgainIfTruncated in lib/pipeline.mjs says why, and
  // tests/security-audit-guard.spec.ts exercises it). The consultants are never
  // wrapped: one lost batch is one hole, not a lost audit.
  const CISO_TRUNCATED_RETRIES = 1;

  // Verification in batches (Sonny, 24.09.2026, option A). At v2.18.0 one CISO
  // call was handed 194 candidates, reached its input limit before any of their
  // code, confirmed nothing, and the mail said "0 findings, risk low". Now: merge
  // duplicates, order by severity, verify twenty at a time, each with its code,
  // and name every candidate that was not verified.
  const merged = dedupeCandidates(results);
  const plannedCheck = planVerification(merged, { maxCalls: maxVerificationCalls });
  const candidateCount = plannedCheck.candidates.length;
  const VERIFY_PREFIX = `${CISO_FINDINGS_TASK}\n\n`;
  const VERIFY_CAP = AUDIT.verificationInputChars;
  // Redaction can lengthen a message after it is built; the bound holds for what is sent. A batch that still does
  // not fit is not sent at all — its candidates are named as not verified rather than shown without their code.
  const verifyMessages = plannedCheck.batches.map((batch, i) => {
    const build = (maxChars) => clean('outgoing message', VERIFY_PREFIX + verificationMessage({ batch, index: i, count: plannedCheck.batches.length, total: candidateCount, readLines, maxChars }));
    let user = build(VERIFY_CAP - VERIFY_PREFIX.length);
    for (let attempt = 0; user.length > VERIFY_CAP && attempt < 3; attempt++) user = build(Math.max(1_000, VERIFY_CAP - VERIFY_PREFIX.length - (user.length - VERIFY_CAP)));
    return user.length > VERIFY_CAP ? null : user;
  });
  const sendable = plannedCheck.batches.filter((_, i) => verifyMessages[i] !== null);
  const sendableUsers = verifyMessages.filter((m) => m !== null);
  const oversized = plannedCheck.batches.filter((_, i) => verifyMessages[i] === null).flat().map((candidate) => ({ candidate, reason: 'input over the limit after redaction' }));
  const check = await runVerification({
    batches: sendable,
    capUsd: cap,
    concurrency: SELF_TEST ? 1 : AUDIT.concurrency,
    messageFor: (_, i) => ({ system: clean('outgoing message', brief), user: sendableUsers[i] }),
    // Checked against what was actually spent: the consultants' cost, the verification calls settled or in flight,
    // this call's worst case, and the narrative still to come.
    fits: (committed, chars) => run.spent + committed + estimate(chars, cisoTokens) + narrativeReserve <= cap,
    worstCase: (chars) => estimate(chars, cisoTokens),
    call: ({ system, user }) =>
      askAgainIfTruncated(
        () => callReviewer({ apiKey, system, user, schema: FINDINGS_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.cisoEffort, model: AUDIT.model, providers: AUDIT.providers, maxTokens: cisoTokens, timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: (answer) => ({ findings: coerceFindings(answer), notes: String(answer?.notes || '') }) }),
        { retries: CISO_TRUNCATED_RETRIES, warn: (n) => console.warn(`CISO verification call ${n} answered with a body that is not JSON — asking once more.`) },
      ),
  });
  // A fixed word per reason and a count — never a message, never a candidate.
  for (const { reason, count } of check.failureReasons) console.warn(`CISO verification calls failed: ${reason} ×${count} — their candidates are listed as not verified.`);
  const notVerified = [...check.notVerified, ...oversized, ...plannedCheck.beyond].map(notVerifiedEntry);
  const verifiedCount = candidateCount - notVerified.length;
  const reports = results.reduce((n, r) => n + (r.review?.findings?.length || 0), 0);
  const verification = { reports, candidates: candidateCount, verified: verifiedCount, calls: check.results.length, failedCalls: check.failedCalls, notVerified };
  const verifiedNote = check.results.map((r) => r.review.notes).filter(Boolean).join(' ');
  const findings = check.results.flatMap((r) => r.review.findings);
  const synthesis = { findings: !candidateCount ? 'no-candidates' : !notVerified.length ? 'ciso' : check.results.length ? 'ciso-partial' : 'none', narrative: 'ciso' };

  // Redaction runs after the message is built and replaces a secret-shaped
  // value with a longer marker, so the cleaned message can be larger than the
  // reserve it was costed with (QA review of 0bf8637953a3, a05856ec23f4). The
  // reserve is what this call was priced at, so it holds unconditionally: the
  // body is rebuilt with the room redaction took, and if that still does not
  // fit — a message that is nothing but redaction markers — the payload is cut
  // at the reserve and says so, because a request larger than its budget is a
  // request the cap did not authorise.
  const NARRATIVE_PREFIX = `${CISO_NARRATIVE_TASK}\n\n`;
  const buildNarrative = (maxChars) => clean('outgoing message', NARRATIVE_PREFIX + narrativeMessage({ surface, coverage, findings, notRead, failed: run.failedCalls, droppedNote: verifiedNote, verification, maxChars }));
  const NARRATIVE_CAP = AUDIT.narrativeInputChars;
  let narrativeUser = buildNarrative(NARRATIVE_CAP - NARRATIVE_PREFIX.length);
  for (let attempt = 0; narrativeUser.length > NARRATIVE_CAP && attempt < 3; attempt++) {
    const overflow = narrativeUser.length - NARRATIVE_CAP;
    narrativeUser = buildNarrative(Math.max(1_000, NARRATIVE_CAP - NARRATIVE_PREFIX.length - overflow));
  }
  let narrativeTruncated = false;
  if (narrativeUser.length > NARRATIVE_CAP) {
    narrativeTruncated = true;
    narrativeUser = `${narrativeUser.slice(0, NARRATIVE_CAP - 120)}\n\n(Cut here: the message did not fit the reserve for this call. Findings beyond this point are in the report and counted above.)`;
  }
  let narrative = null;
  try {
    narrative = await askAgainIfTruncated(
      () => callReviewer({ apiKey, system: clean('outgoing message', brief), user: narrativeUser, schema: NARRATIVE_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.cisoEffort, model: AUDIT.model, providers: AUDIT.providers, maxTokens: SELF_TEST ? 6_000 : AUDIT.narrativeOutputTokens, timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: coerceNarrative }),
      { retries: CISO_TRUNCATED_RETRIES, warn: (n) => console.warn(`CISO narrative call ${n} answered with a body that is not JSON — asking once more.`) },
    );
  } catch (err) {
    console.warn(`CISO narrative call failed (${failureReason(String(err?.message || err).split('\n')[0])}) — the findings are reported without a synthesis.`);
    synthesis.narrative = 'none';
  }
  if (candidateCount && !check.results.length && !narrative) {
    // Nothing verified and no synthesis: there is nothing a model contributed,
    // and a report of raw candidates under a CISO's name would be a claim nobody made.
    throw new Error(`the audit did not produce a report (every CISO call failed; consultant calls ${results.length}, failed ${run.failedCalls}; verification calls failed ${check.failedCalls})`);
  }

  // A credential in the code is reported without a model and without its value; a public-by-design value is not.
  const secretFindings = [...new Map(secretHits.filter((h) => h.path !== 'outgoing message' && !isPublicByDesign(h)).map((h) => [`${h.path}|${h.kind}`, h])).values()].map((h) => ({
    title: `Mögliches Geheimnis im Code: ${h.kind}`,
    severity: 'kritisch',
    category: 'CWE-798',
    locations: [{ file: h.path, line: 0 }],
    description: `${h.count} Wert(e), die dem Muster „${h.kind}" entsprechen, stehen in dieser Version.`,
    preconditions: 'Lesezugriff auf das Repository.',
    impact: 'Wer das Repository lesen kann, kann den Wert nutzen, bis er rotiert ist.',
    evidence: 'Vor dem Versand geschwärzt; der Wert steht nicht im Bericht.',
    recommendation: 'Zuerst rotieren, dann aus Datei und Historie entfernen und in einen Secret-Store verschieben.',
    verification: `Die Datei ${h.path} auf das Muster prüfen.`,
    confidence: 0.9,
  }));
  // The rating of a report without a synthesis is the worst finding it carries,
  // so it is computed from the findings the report will actually have — an
  // empty list rated everything 'niedrig' (QA review of 7b8add43fa26,
  // 4930d2571216).
  const reported = [...secretFindings, ...findings];
  const base = narrative
    ? { ...narrative.review, findings: [] }
    : reportWithoutNarrative({ findings: reported, coverage, reason: 'der abschließende Aufruf kam nicht zurück.' });
  const report = withCountedCoverage(
    {
      ...base,
      findings: reported,
      limitations: [
        ...[verificationLimitation({ candidates: candidateCount, verified: verifiedCount, notVerified })].filter(Boolean),
        ...(base.limitations || []),
        ...(verifiedNote ? [`Aus der Verifikation: ${verifiedNote}`] : []),
      ],
    },
    coverage,
  );

  const usages = [...results.map((r) => r.usage), ...check.results.map((r) => r.usage), narrative?.usage].filter(Boolean);
  const costUsd = !run.failedCalls && !check.failedCalls && usages.every((u) => typeof u?.cost === 'number') ? Number(usages.reduce((n, u) => n + u.cost, 0).toFixed(4)) : null;
  const payload = {
    version: 2,
    head: surface.head,
    createdAt: new Date().toISOString(),
    model: AUDIT.model,
    selfTest: SELF_TEST,
    durationMs: Date.now() - started,
    costUsd,
    calls: results.length + check.results.length + (narrative ? 1 : 0),
    // Which half of the report a model wrote, and which one is missing.
    synthesis,
    failedCalls: run.failedCalls + check.failedCalls,
    // How many candidates were verified, and every one that was not — by name,
    // with its reason. The mail's headline is built from this, not from the rating.
    verification,
    verificationInput: { maxChars: Math.max(0, ...sendableUsers.map((m) => m.length)), reservedChars: AUDIT.verificationInputChars },
    narrativeInput: { chars: narrativeUser.length, reservedChars: AUDIT.narrativeInputChars, truncated: narrativeTruncated },
    redactedSecrets: secretHits.length,
    surface: { files: surface.files.total, byDomain: surface.files.byDomain, apiRoutes: surface.apiRoutes.length, sinks: surface.sinks.length, dependencies: surface.dependencies.vulnerabilities || null },
    report,
  };

  writeFileSync(join(OUT, 'security-audit.enc.json'), JSON.stringify(sealFor(payload, readFileSync(AUDIT_PUBLIC_PEM, 'utf8'))));

  // Only metadata reaches the public log: counts and cost, never a finding.
  const line = `Security audit ${surface.head.slice(0, 12)}: completed, sealed · calls=${payload.calls} failed=${payload.failedCalls} candidates=${candidateCount} verified=${verifiedCount} notVerified=${notVerified.length} cost=$${costUsd ?? 'unknown'}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Security audit\n\n${line}\n\nThe report is sealed and goes to the owner by mail.\n`);
}

main().catch((err) => {
  console.error(`Security audit failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
