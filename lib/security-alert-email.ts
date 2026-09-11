/**
 * The mail an admin gets when a scheduled Security CI run goes red.
 *
 * Why it exists: on 7 September the Monday run went red on six High advisories
 * and stayed red for three days while a critical Next.js advisory ran in
 * production. Nobody pushed, so nobody looked, and a scheduled run that fails
 * tells no one. The deploy gate would have caught it — on the next deploy.
 *
 * Mail and not a GitHub issue: the repository is public, and an issue would
 * announce the open window to everyone before the one person who can close it
 * had read it.
 *
 * Pure, no imports — rendered by scripts/send-security-alert.ts and tested
 * directly.
 */

export interface SecurityAlertInput {
  /** Names of the jobs that failed, as GitHub reports them. */
  failedJobs: string[];
  /** Link to the failed run. */
  runUrl: string;
  /** When the run started, ISO. */
  runStartedAt: string;
  /** A manual test of the alert path, not a real failure. */
  test?: boolean;
}

/** Job ids in security-ci.yml → the names GitHub shows, and the mail explains. */
const JOB_NAMES: Record<string, string> = {
  'secret-scan': 'Secret scan (gitleaks)',
  'dependency-audit': 'Dependency audit (npm audit)',
  sbom: 'SBOM (CycloneDX)',
};

/**
 * The jobs whose result was `failure`, by display name, from the workflow's
 * `needs` context passed as JSON. Unparseable input is no list, not a crash:
 * the alert still goes out, saying no job name was reported.
 */
export function failedJobsFrom(needsJson: string | undefined): string[] {
  if (!needsJson) return [];
  try {
    const needs = JSON.parse(needsJson) as Record<string, { result?: string }>;
    return Object.entries(needs)
      .filter(([, v]) => v?.result === 'failure')
      .map(([id]) => JOB_NAMES[id] ?? id);
  } catch {
    return [];
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What to do about each job, in the order someone would do it. */
const WHAT_IT_MEANS: Record<string, string> = {
  'Dependency audit (npm audit)':
    'A High or Critical advisory was published for a dependency that has not changed. Run `npm audit` locally, update or override the package, and push. Until then every deploy is blocked by the same threshold.',
  'Secret scan (gitleaks)':
    'Something in the repository history looks like a credential. Check the finding in the run log first; if it is real, rotate the secret before anything else.',
  'SBOM (CycloneDX)':
    'The bill of materials could not be generated — usually a broken lockfile rather than a security finding. Check the run log.',
};

export function renderSecurityAlert(input: SecurityAlertInput) {
  const day = input.runStartedAt.slice(0, 10);
  const jobs = input.failedJobs.length > 0 ? input.failedJobs : ['(no job name reported)'];
  const subject = `${input.test ? '[TEST] ' : ''}Security CI is red — scheduled run of ${day}`;

  const lines = jobs.map((j) => `- ${j}: ${WHAT_IT_MEANS[j] ?? 'See the run log.'}`);
  const text = [
    input.test ? 'TEST — this is a manual check of the alert path. Nothing failed.\n' : '',
    `The scheduled Security CI run of ${day} failed.`,
    '',
    'Failed:',
    ...lines,
    '',
    `Run: ${input.runUrl}`,
    '',
    'This mail goes to the admin only. It is deliberately not a GitHub issue: the repository is public.',
  ]
    .filter((l, i) => l !== '' || i > 0)
    .join('\n');

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
${input.test ? '<p style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;font-size:13px"><strong>TEST</strong> — a manual check of the alert path. Nothing failed.</p>' : ''}
<h1 style="font-size:20px;margin:0 0 12px">Security CI is red</h1>
<p style="font-size:14px;line-height:1.5">The scheduled run of <strong>${escapeHtml(day)}</strong> failed.</p>
<ul style="font-size:14px;line-height:1.5;padding-left:18px">
${jobs.map((j) => `<li><strong>${escapeHtml(j)}</strong> — ${escapeHtml(WHAT_IT_MEANS[j] ?? 'See the run log.')}</li>`).join('\n')}
</ul>
<p style="font-size:14px"><a href="${escapeHtml(input.runUrl)}" style="color:#006b2c;font-weight:700">Open the run</a></p>
<p style="font-size:12px;color:#64748b;line-height:1.5">This mail goes to the admin only. It is deliberately not a GitHub issue: the repository is public, and an issue would announce the open window first.</p>
</body></html>`;

  return { subject, text, html };
}
