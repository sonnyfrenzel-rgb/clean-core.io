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
import { cisoMessage, coerceConsultant, coerceReport, consultantMessage, numbered, planBatches, runConsultants, withCountedCoverage } from './lib/pipeline.mjs';
import { surfaceMap } from './lib/surface.mjs';
import { AUDIT, CONSULTANTS, CONSULTANT_SCHEMA, REPORT_SCHEMA } from './lib/team.mjs';

const SELF_TEST = process.env.SECURITY_AUDIT_MODE === 'self-test';
const WORK = join(AUDIT.workDir, 'work');
const OUT = join(AUDIT.workDir, 'out');
const CHARS_PER_TOKEN = 3.5;

export const CISO_TASK = [
  'Write the security audit report of this release as the CISO described in your system prompt.',
  'Verify every consultant finding against the code shown under it before it enters the report; drop what the code does not support and say in limitations what you could not settle.',
  'One finding per root cause, all its locations. Write every text field in German.',
].join('\n');

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
  const cisoReserve = estimate(brief.length + CISO_TASK.length + 2 + AUDIT.cisoInputChars, cisoTokens);

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

  const cisoUser = clean('outgoing message', `${CISO_TASK}\n\n${cisoMessage({ surface, results, coverage, notRead, failed: run.failedCalls, readLines })}`);
  // The CISO call is the last of some sixty and the only one whose loss costs
  // the whole audit. The client deliberately never retries an answer that may
  // already have been generated and billed, and for the consultants that is
  // right: one lost batch is one hole in the coverage. Here it is not. On
  // 2026-09-15 the release audit of 33471220d6e9 ran for seventy minutes, all
  // 57 consultant calls succeeded, and the CISO's HTTP 200 arrived with a body
  // that was not JSON — cut off in transit — so three dollars of audit produced
  // nothing. One second bill for that one call is the cheaper outcome. Only
  // that error, only once; a wrong answer or a refusal is still final.
  const CISO_TRUNCATED_RETRIES = 1;
  let ciso;
  for (let attempt = 0; ; attempt++) {
    try {
      ciso = await callReviewer({ apiKey, system: clean('outgoing message', brief), user: cisoUser, schema: REPORT_SCHEMA, effort: SELF_TEST ? 'low' : AUDIT.cisoEffort, model: AUDIT.model, maxTokens: cisoTokens, name: 'security_audit_report', title: 'Clean-Core.io Security Audit', timeoutMs: AUDIT.requestTimeoutMs, retries: AUDIT.rateLimitRetries, retryDelayMs: AUDIT.rateLimitDelayMs, coerce: coerceReport });
      break;
    } catch (err) {
      const message = String(err?.message || err).split('\n')[0];
      if (attempt < CISO_TRUNCATED_RETRIES && /response that is not JSON/.test(message)) {
        console.warn(`CISO call ${attempt + 1} answered with a body that is not JSON — asking once more.`);
        continue;
      }
      throw new Error(`the audit did not produce a report (CISO call: ${message}; consultant calls ${results.length}, failed ${run.failedCalls}).`);
    }
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
  const report = withCountedCoverage({ ...ciso.review, findings: [...secretFindings, ...ciso.review.findings] }, coverage);

  const usages = [...results.map((r) => r.usage), ciso.usage];
  const costUsd = !run.failedCalls && usages.every((u) => typeof u?.cost === 'number') ? Number(usages.reduce((n, u) => n + u.cost, 0).toFixed(4)) : null;
  const payload = {
    version: 2,
    head: surface.head,
    createdAt: new Date().toISOString(),
    model: AUDIT.model,
    selfTest: SELF_TEST,
    durationMs: Date.now() - started,
    costUsd,
    calls: results.length + 1,
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
