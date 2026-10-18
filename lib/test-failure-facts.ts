/**
 * Facts the "AI Test Analysis" of the Testing page is given before the model explains a failed run (3.0.17
 * criterion 3). The 1,000-line starter example's run was refused by the original's AUTHORITY-CHECK — the package's
 * `srv/lib/authority.ts` fails closed until the authorization is mapped — and the model, seeing no run id, told the
 * user the system "did not generate a runId". A refused request has no run by design; the explanation stays a model
 * proposal, but it is handed the refusal the run output names, so it cannot invent another cause.
 *
 * Pure: run output in, sentences out. No model, no I/O.
 */

/** A refusal by the original's authorization check, as the Node package words it (scaffold version 16). */
const AUTHORITY_REFUSAL = /(L\d+): the authorization check at (L\d+)(?: \(([^)]*)\))? refused/gi;
/** The seam's own issue, also in packages from before scaffold version 16. */
const AUTHORITY_DENIED = /(L\d+) AUTHORITY-CHECK OBJECT '([^']+)'[^:]*: denied - this package checks no authorization yet/gi;

/** The deterministic facts about a failed run's output, one sentence each; empty when none is recognised. */
export function testFailureFacts(output: string): string[] {
  const text = String(output ?? '');
  const facts: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(AUTHORITY_REFUSAL)) {
    const key = `${m[1]}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(
      `The run was refused by the original's authorization check at ${m[2]}${m[3] ? ` (${m[3]})` : ''}, rule ${m[1]}: srv/lib/authority.ts denies every AUTHORITY-CHECK (fail closed) until it is mapped to the target's authorization, or granted for a test with CC_AUTHORITY_DEMO=grant. A refused request has no run and therefore no run id — that is the refusal, not a failure to generate one.`,
    );
  }
  for (const m of text.matchAll(AUTHORITY_DENIED)) {
    const key = `denied|${m[1]}`;
    if (seen.has(key) || [...seen].some((k) => k.endsWith(`|${m[1]}`))) continue;
    seen.add(key);
    facts.push(
      `The original's AUTHORITY-CHECK at ${m[1]} (object ${m[2]}) was denied by srv/lib/authority.ts, which fails closed until the authorization is mapped, or granted for a test with CC_AUTHORITY_DEMO=grant. A run refused there has no run id by design.`,
    );
  }
  return facts;
}

/** The facts as a block of the explanation prompt, or '' when there are none. */
export function testFailureFactsBlock(output: string): string {
  const facts = testFailureFacts(output);
  if (facts.length === 0) return '';
  return `FACTS (read deterministically from the run output by Clean-Core.io — the explanation must state them and must not contradict them or name another cause for them):\n${facts.map((f) => `- ${f}`).join('\n')}\n\n`;
}
