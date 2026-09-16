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
import { isPublicByDesign } from '../qa/lib/config.mjs';
import { callReviewer } from '../qa/lib/openrouter.mjs';
import { redactSecrets } from '../qa/lib/redact.mjs';
import { AUDIT_PUBLIC_PEM, sealFor } from './lib/envelope.mjs';
import { askAgainIfTruncated, cisoMessage, coerceConsultant, coerceConsultantFindings, coerceFindings, coerceNarrative, consultantMessage, narrativeMessage, numbered, planBatches, reportWithoutNarrative, runConsultants, withCountedCoverage } from './lib/pipeline.mjs';
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
  'Verify every consultant finding below against the code quoted with it, and answer with the findings that hold.',
  'Drop what the code does not support; merge duplicates; correct a severity the code does not justify.',
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
  const clean = (path, text) => {
    const r = redactSecrets(text);
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
  // The CISO's call is reserved out of the cap before any consultant spends: a report is always written. The reserve
  // is the size cisoMessage enforces, plus the brief and the task around it.
  // Both CISO calls are reserved out of the cap before any consultant spends:
  // the audit is written even when the consultants have used everything else.
  const cisoReserve = estimate(brief.length + CISO_FINDINGS_TASK.length + 2 + AUDIT.cisoInputChars, cisoTokens)
    + estimate(brief.length + CISO_NARRATIVE_TASK.length + 2 + AUDIT.narrativeInputChars, SELF_TEST ? 6_000 : AUDIT.narrativeOutputTokens);

  const run = await runConsultants({
    batches: plan.batches,
    capUsd: cap,
    concurrency: SELF_TEST ? 1 : AUDIT.concurrency,
    messageFor: (batch, i) => ({ system: CONSULTANTS[batch.consultant].prompt, user: clean('outgoing message', consultantMessage({ surface, batch, index: i, count: plan.batches.length })) }),
    fits: (committed, chars) => committed + estimate(chars, consultantTokens) + cisoReserve <= cap,
    worstCase: (chars) => estimate(chars, consultantTokens),
    call: ({ system, user }) =>
      callReviewer({ apiKey, system, user, schema: CONSULTANT_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.consultantEffort, model: AUDIT.model, maxTokens: consultantTokens, name: 'security_consultant', title: 'Clean-Core.io Security Audit', timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: coerceConsultant }),
  });
  const { results } = run;
  const notRead = [...plan.notRead, ...run.notReviewed];
  const unread = new Set(notRead.map((n) => n.path));
  // A file in parts counts once, and only if none of its parts failed.
  const deepRead = [...new Set(plan.batches.flatMap((b) => b.files.map((f) => f.path)))].filter((p) => !unread.has(p));

  const filesInScope = SELF_TEST ? AUDIT.selfTestFiles.length : surface.files.total;
  const coverage = {
    files_in_scope: filesInScope,
    deep_read: deepRead.length,
    pattern_scanned_only: filesInScope - deepRead.length,
    notes: SELF_TEST ? 'Selbsttest: nur zwei Dateien, ein Berater.' : `Tiefe Lektüre durch fünf Berater in ${plan.batches.length} Aufrufen; Testdateien nur über das Muster-Scanning der Angriffsflächenkarte.`,
  };

  const cisoUser = clean('outgoing message', `${CISO_FINDINGS_TASK}\n\n${cisoMessage({ surface, results, coverage, notRead, failed: run.failedCalls, readLines })}`);
  // Each CISO call is asked once more when its 200 arrives with a body that is
  // not JSON (askAgainIfTruncated in lib/pipeline.mjs says why, and
  // tests/security-audit-guard.spec.ts exercises it). The consultants are never
  // wrapped: one lost batch is one hole, not a lost audit.
  const CISO_TRUNCATED_RETRIES = 1;
  const consultantFindings = coerceConsultantFindings(results);
  let verified = null;
  let verifiedNote = '';
  try {
    verified = await askAgainIfTruncated(
      () => callReviewer({ apiKey, system: clean('outgoing message', brief), user: cisoUser, schema: FINDINGS_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.cisoEffort, model: AUDIT.model, maxTokens: cisoTokens, timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: (answer) => ({ findings: coerceFindings(answer), notes: String(answer?.notes || '') }) }),
      { retries: CISO_TRUNCATED_RETRIES, warn: (n) => console.warn(`CISO findings call ${n} answered with a body that is not JSON — asking once more.`) },
    );
    verifiedNote = verified.review.notes || '';
  } catch (err) {
    // Fifty consultant calls are not thrown away because the last one failed.
    // Their findings go into the report unverified, and the report says so.
    console.warn(`CISO findings call failed (${String(err?.message || err).split('\n')[0]}) — the consultants' own findings are reported, unverified.`);
  }
  const findings = verified ? verified.review.findings : consultantFindings;
  const synthesis = { findings: verified ? 'ciso' : 'consultants-unverified', narrative: 'ciso' };

  const narrativeUser = clean('outgoing message', `${CISO_NARRATIVE_TASK}\n\n${narrativeMessage({ surface, coverage, findings, notRead, failed: run.failedCalls, droppedNote: verifiedNote })}`);
  let narrative = null;
  try {
    narrative = await askAgainIfTruncated(
      () => callReviewer({ apiKey, system: clean('outgoing message', brief), user: narrativeUser, schema: NARRATIVE_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.cisoEffort, model: AUDIT.model, maxTokens: SELF_TEST ? 6_000 : AUDIT.narrativeOutputTokens, timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: coerceNarrative }),
      { retries: CISO_TRUNCATED_RETRIES, warn: (n) => console.warn(`CISO narrative call ${n} answered with a body that is not JSON — asking once more.`) },
    );
  } catch (err) {
    console.warn(`CISO narrative call failed (${String(err?.message || err).split('\n')[0]}) — the findings are reported without a synthesis.`);
    synthesis.narrative = 'none';
  }
  if (!verified && !narrative) {
    // Both halves gone: there is nothing a model contributed, and a report of
    // raw consultant findings under a CISO's name would be a claim nobody made.
    throw new Error(`the audit did not produce a report (both CISO calls failed; consultant calls ${results.length}, failed ${run.failedCalls})`);
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
  const base = narrative
    ? { ...narrative.review, findings: [] }
    : reportWithoutNarrative({ findings: [], coverage, reason: 'der abschließende Aufruf kam nicht zurück.' });
  const report = withCountedCoverage(
    {
      ...base,
      findings: [...secretFindings, ...findings],
      limitations: [
        ...(base.limitations || []),
        ...(verified ? [] : ['Die Befunde sind Beraterbefunde ohne die zweite Prüfung am Code: der verifizierende Aufruf kam nicht zurück. Jeder Befund ist vor einer Änderung selbst zu prüfen.']),
        ...(verifiedNote ? [`Aus der Verifikation: ${verifiedNote}`] : []),
      ],
    },
    coverage,
  );

  const usages = [...results.map((r) => r.usage), verified?.usage, narrative?.usage].filter(Boolean);
  const costUsd = !run.failedCalls && usages.every((u) => typeof u?.cost === 'number') ? Number(usages.reduce((n, u) => n + u.cost, 0).toFixed(4)) : null;
  const payload = {
    version: 2,
    head: surface.head,
    createdAt: new Date().toISOString(),
    model: AUDIT.model,
    selfTest: SELF_TEST,
    durationMs: Date.now() - started,
    costUsd,
    calls: results.length + (verified ? 1 : 0) + (narrative ? 1 : 0),
    // Which half of the report a model wrote, and which one is missing.
    synthesis,
    failedCalls: run.failedCalls,
    // Above the reserve only when the findings' text alone outgrows it — the code was then left out, and the cost
    // estimate for the CISO was exceeded. Recorded in the sealed report, next to the actual cost.
    cisoInput: { chars: cisoUser.length, reservedChars: AUDIT.cisoInputChars },
    redactedSecrets: secretHits.length,
    surface: { files: surface.files.total, byDomain: surface.files.byDomain, apiRoutes: surface.apiRoutes.length, sinks: surface.sinks.length, dependencies: surface.dependencies.vulnerabilities || null },
    report,
  };

  writeFileSync(join(OUT, 'security-audit.enc.json'), JSON.stringify(sealFor(payload, readFileSync(AUDIT_PUBLIC_PEM, 'utf8'))));

  // Only metadata reaches the public log: counts and cost, never a finding.
  const line = `Security audit ${surface.head.slice(0, 12)}: completed, sealed · calls=${payload.calls} failed=${run.failedCalls} cost=$${costUsd ?? 'unknown'}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Security audit\n\n${line}\n\nThe report is sealed and goes to the owner by mail.\n`);
}

main().catch((err) => {
  console.error(`Security audit failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
