/**
 * What a test run said, read without adding anything to it (roadmap E07-F01).
 *
 * Pure, no imports: the runner route uses it on the child's TAP output, and the
 * tests call it directly instead of grepping the route for the right words.
 */

/**
 * A verdict from the runner.
 *
 * `Skipped` and `Todo` are their own states (E07-F01-US01: "the regressions for
 * TAP SKIP/TODO deliver skipped and todo"). They used to fold into `Not run`,
 * which was honest about the pass and silent about why: a test someone skipped on
 * purpose and a test nobody wrote yet are different things to act on.
 */
export type RunnerVerdict = 'Passed' | 'Failed' | 'Skipped' | 'Todo';

export interface TestRunResult {
  id: string;
  name: string;
  status: RunnerVerdict;
  message?: string;
}

/**
 * Reads TAP, including the half of it that used to be discarded.
 *
 * A TAP line is `ok` or `not ok`, and either may carry a *directive* after a
 * hash: `# SKIP` for a test that was deliberately not executed, `# TODO` for one
 * that is not expected to work yet. Both are written as `ok` — that is the
 * protocol, not a quirk — so a parser that decides on the first token alone reads
 * "this did not run" as "this passed". This one did, and the delivery page then
 * described the result as verified.
 */
export function parseTapOutput(stdout: string): TestRunResult[] {
  const results: TestRunResult[] = [];
  const lines = stdout.split('\n');
  const testLineRegex = /^(ok|not ok)\s+\d+\s+-\s+([A-Za-z0-9_]+):?\s*(.*)$/;
  const directiveRegex = /#\s*(skip|todo)\b\s*(.*)$/i;

  let currentResult: TestRunResult | null = null;
  let inErrorBlock = false;
  let errorMessageLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(testLineRegex);

    if (match) {
      if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
        currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
      }

      const id = match[2];
      const rest = match[3] || '';
      const directive = rest.match(directiveRegex);
      const name = (directive ? rest.slice(0, directive.index).trim() : rest.trim()) || id;

      let status: RunnerVerdict;
      let message: string;
      if (directive) {
        const kind = directive[1].toUpperCase();
        const reason = directive[2].trim();
        status = kind === 'SKIP' ? 'Skipped' : 'Todo';
        message =
          (kind === 'SKIP' ? 'Skipped by the test suite — not executed' : 'Marked TODO in the test suite — not expected to pass yet') +
          (reason ? `: ${reason}` : '');
      } else if (match[1] === 'ok') {
        status = 'Passed';
        message = 'Passed in the Node.js test runner';
      } else {
        status = 'Failed';
        message = 'Test assertion failed';
      }

      currentResult = { id, name, status, message };
      results.push(currentResult);
      inErrorBlock = false;
      errorMessageLines = [];
    } else if (currentResult && currentResult.status === 'Failed') {
      if (trimmed.startsWith('error:')) {
        inErrorBlock = true;
        errorMessageLines.push(trimmed.replace(/^error:\s*/, ''));
      } else if (inErrorBlock && (trimmed.startsWith('stack:') || trimmed.startsWith('---') || trimmed.startsWith('...'))) {
        inErrorBlock = false;
      } else if (inErrorBlock) {
        errorMessageLines.push(trimmed);
      }
    }
  }

  if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
    currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  return results;
}

/**
 * The npm package a bare import specifier belongs to: `@sap/xssec/lib/x` →
 * `@sap/xssec`, `express/lib/router` → `express`. Used to name what the runner
 * replaced with its universal stub (CR-14).
 */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
}
