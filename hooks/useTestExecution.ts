import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth, getDb } from '@/lib/firebase';
import { callGemini } from '@/lib/gemini';
import type { Project, TestCase } from '@/lib/types';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { parseGeneratedPackage, replaceFileContent, repairTarget } from '@/lib/generated-package';
import { applyRunnerVerdicts } from '@/lib/test-verdicts';
import type { TestRunReceipt } from '@/lib/test-receipt';
import { candidateDigests, storedSuiteSource, type RepairDraftTarget } from '@/lib/repair-draft';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { isAbapUnitRoute, ABAP_UNIT_NOT_RUNNABLE } from '@/lib/test-runnability';

export const useTestExecution = (projectId: string, project: Project | null, setProject?: React.Dispatch<React.SetStateAction<Project | null>>) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestCase[] | null>(null);
  const [sandboxOutput, setSandboxOutput] = useState<string>('Sandbox initialized. Waiting for execution...');
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  /**
   * npm packages the runner replaced with its universal stub in the last run
   * (CR-14). A pass against a stubbed `express` or `typeorm` says the business
   * logic ran, not that it works with those libraries — so they are named.
   */
  const [stubbedPackages, setStubbedPackages] = useState<string[]>([]);
  /**
   * Why the last run produced no verdict at all, in words for the page — a
   * refused request, a runner that is not there, code that did not compile, a
   * suite whose tests the runner never reported. Null when the run gave at
   * least one verdict, or none has been asked for. The reason used to reach
   * only the folded console, and the page showed a wall of "Not determined".
   */
  const [runError, setRunError] = useState<string | null>(null);

  const generateQAReport = (results: TestCase[], stubs: string[] = []) => {
    // "everything that did not pass, failed" stops being true the moment a status
    // can also mean "no verdict". Each bucket is counted, and the ones that carry
    // no verdict are named rather than folded into the failures.
    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.filter(r => r.status === 'Failed').length;
    const notRun = results.filter(r => r.status === 'Not run').length;
    const skipped = results.filter(r => r.status === 'Skipped').length;
    const todo = results.filter(r => r.status === 'Todo').length;
    const simulated = results.filter(r => r.status === 'Simulated').length;
    const timestamp = new Date().toLocaleString();

    let report = `==================================================\n`;
    report += `QA ENGINEER TEST REPORT - ${timestamp}\n`;
    report += `==================================================\n\n`;
    report += `Summary:\n`;
    report += `- Total Tests: ${results.length}\n`;
    report += `- Passed:      ${passed}\n`;
    report += `- Failed:      ${failed}\n`;
    if (skipped > 0) report += `- Skipped:     ${skipped}  (skipped by the suite — not executed)\n`;
    if (todo > 0) report += `- Todo:        ${todo}  (marked TODO — not expected to pass yet)\n`;
    if (notRun > 0) report += `- Not run:     ${notRun}  (the runner reported no result)\n`;
    if (simulated > 0) report += `- Simulated:   ${simulated}  (mock context — nothing ran against an SAP system)\n`;
    if (stubs.length > 0) {
      report += `\nRan against stubs for: ${stubs.join(', ')}\n`;
      report += `These packages were replaced by an empty proxy. A pass shows the logic ran,\n`;
      report += `not that it works with them.\n`;
    }
    report += `\n`;
    report += `Detailed Results:\n`;
    results.forEach((r, i) => {
      report += `${i + 1}. [${(r.status || 'Unknown').toUpperCase()}] ${r.id}: ${r.name}\n`;
      if (r.status === 'Failed') {
        report += `   Error: ${r.message}\n`;
      }
    });
    report += `\n==================================================\n`;
    report += `End of Report\n`;
    return report;
  };

  /** The first non-empty line of a runner's error text, cut to a sentence's length. */
  const firstLine = (text: string | undefined): string => {
    const line = (text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    return line.length > 240 ? `${line.slice(0, 239)}…` : line;
  };

  const stripCodeFences = (s: string) =>
    s.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '').trim();


  /**
   * Auto-healing: on a compilation/syntax error, ask the AI to repair the
   * offending generated code and return the fixed source. `kind` selects whether
   * we are fixing the transformed application module (app.ts) or the test suite,
   * because either can carry an AI-introduced syntax error.
   */
  const autoHealCode = async (errorOutput: string, currentCode: string, kind: 'module' | 'test', filePath?: string) => {
    const label = kind === 'module'
      ? (filePath ? `generated source file \`${filePath}\`` : 'transformed application module (app.ts)')
      : 'Node.js test suite (test.ts)';
    setSandboxOutput(prev => prev + `\n\n[Auto-Healing] Compilation error detected. Asking the AI to repair ${kind === 'module' ? (filePath || 'the module') : 'the test'} code...`);
    const prompt = `The following ${label} failed to compile in an esbuild/TypeScript sandbox. Fix ONLY what is needed so it compiles and runs — preserve the intended behaviour, imports, and test cases. Do not remove test cases or change business logic.

Common causes: a colon used where a semicolon/comma was expected, a missing bracket, an invalid TypeScript annotation, or a bad import path.
${kind === 'test'
  ? "IMPORTANT: the application under test is in './app' (app.ts) in the same directory — import from './app', not './index'."
  : filePath
    ? `IMPORTANT: this is one file of a multi-file package and other files import from it. Keep every export and every import path exactly as they are; return this one file only.`
    : "IMPORTANT: this is a self-contained module; keep all exported functions/classes so the tests can import them from './app'."}

COMPILER ERROR:
${errorOutput}

CURRENT CODE:
${currentCode}

Return ONLY the raw, corrected TypeScript source — no markdown fences, no commentary.`;

    try {
      const fixedCode = await callGemini(prompt, PRODUCT_GEMINI_MODEL, false, 'testing');
      const cleaned = stripCodeFences(fixedCode);
      return cleaned && cleaned.length > 0 ? cleaned : currentCode;
    } catch (err) {
      console.error('Auto-healing failed', err);
      return currentCode;
    }
  };

  const explainTestFailure = async (rawOutput: string, errorOutput: string) => {
    try {
      const prompt = `The following test execution failed. Please explain to a non-technical user WHY it failed in 2-3 short sentences. Focus on the business logic mismatch or the technical issue, not the stack trace.
      
      OUTPUT:
      ${rawOutput}
      
      ERROR:
      ${errorOutput}`;
      
      const explanation = await callGemini(prompt, PRODUCT_GEMINI_MODEL, false, 'testing');
      setAiExplanation(explanation || "No explanation provided by AI.");
    } catch (e) {
      console.error("Failed to generate AI explanation", e);
    }
  };

  type RunResult = { exitCode: number; output: string; error?: string; testResults?: any[]; buildError?: boolean; stubbedPackages?: string[]; receipt?: TestRunReceipt | null; draftId?: string; draftReceipt?: TestRunReceipt | null };

  /** POST to the repair-draft route (roadmap 8.7). Returns the parsed body and whether it was accepted. */
  const repairDraftCall = async (body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> => {
    const auth = getAuth();
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch(`/api/projects/${projectId}/repair-drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const executeWithHealing = async (payload: { tests: Project['testSuite']; projectId: string; code: string | undefined }, maxRetries = 2): Promise<RunResult> => {
    let currentPayload = { ...payload };
    /**
     * Roadmap 8.7 (CR-10): a repair is a draft on the server, not a patch in
     * this function's memory.
     *
     * The runner executes only what the server holds (E07-F02), so a repair
     * kept here was never run: every retry executed the stored, broken code and
     * ended in "nothing was saved". Now the model's answer for the one file the
     * compiler named goes to `/api/projects/{id}/repair-drafts`, which cuts an
     * immutable draft from its own copy of the code; the retry names that draft
     * and the runner executes exactly it; and only a draft whose run compiled
     * is adopted — by the server, as a compare-and-swap against the revision it
     * was cut from. This hook writes nothing to Firestore on this path.
     *
     * `currentPayload` still tracks the candidate locally, but only to aim the
     * next repair at the right file and to name the base digests the server
     * compares against; what runs is the draft.
     */
    let draft: { id: string; digest: string } | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response;
      try {
        // Get the current user's ID token for authenticated API calls
        const auth = getAuth();
        const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

        response = await fetch('/api/run-tests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify(draft ? { ...currentPayload, draftId: draft.id } : currentPayload),
        });
      } catch (err) {
        // If it's a network error and we have retries left, wait and retry
        if (attempt < maxRetries) {
          setSandboxOutput(prev => prev + '\n[Retry] Connection failed. The test sandbox might be busy. Retrying in 2s...\n');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error('Network error. Test Sandbox might be restarting.');
      }

      let result: RunResult;
      try {
        const textResponse = await response.text();
        result = JSON.parse(textResponse);
      } catch (err) {
        throw new Error(`Execution environment failure (Status ${response.status}). The sandbox may be restarting, or returned an invalid API response.`);
      }

      // Compilation/syntax error in AI-generated code (returned as HTTP 200 + buildError).
      // Auto-heal the offending source — one file of the generated package, the
      // flat legacy module, or the test suite — then retry against a server-side
      // draft. Which of the three is `repairTarget`'s decision and nothing
      // else's: it used to be `/app\.ts/.test(errText)`, which misses every other
      // path a generated package contains and sent the repair at the test suite
      // instead (QA 1c8234b64f35).
      if (result.buildError && attempt < maxRetries) {
        const errText = result.error || '';
        const target = repairTarget({ code: currentPayload.code, suite: currentPayload.tests?.code, errorText: errText });
        try {
          if (target.kind === 'none') {
            setSandboxOutput(prev => prev + `\n[Auto-Healing] ${target.reason} — nothing is repaired and the generated package is left as it is.\n`);
            return result;
          }
          // The base the model is shown, named by digest so the server can
          // refuse a repair of something it no longer holds.
          const base = candidateDigests(currentPayload.code || '', storedSuiteSource(currentPayload.tests));
          let draftTarget: RepairDraftTarget;
          let repaired: string;
          let nextPayload: typeof currentPayload;
          if (target.kind === 'package') {
            // A package is repaired file by file. The model is asked for one
            // module, so one module is what it is allowed to replace — and the
            // server, not this hook, puts it into the stored package.
            const pkg = parseGeneratedPackage(currentPayload.code)!;
            const idx = target.index;
            repaired = await autoHealCode(errText, pkg[idx].content, 'module', pkg[idx].path);
            draftTarget = { kind: 'package', index: idx, path: pkg[idx].path };
            nextPayload = { ...currentPayload, code: replaceFileContent(pkg, idx, repaired) };
          } else if (target.kind === 'module') {
            repaired = await autoHealCode(errText, currentPayload.code || '', 'module');
            draftTarget = { kind: 'module' };
            nextPayload = { ...currentPayload, code: repaired };
          } else {
            repaired = await autoHealCode(errText, currentPayload.tests?.code || '', 'test');
            draftTarget = { kind: 'test' };
            nextPayload = { ...currentPayload, tests: { ...currentPayload.tests, code: repaired } as Project['testSuite'] };
          }

          const proposed = await repairDraftCall({
            action: 'propose',
            parentDraftId: draft ? draft.id : null,
            expectedCodeDigest: base.codeDigest,
            expectedSuiteDigest: base.suiteDigest,
            target: draftTarget,
            content: repaired,
          });
          if (!proposed.ok || typeof proposed.data?.draftId !== 'string') {
            setSandboxOutput(prev => prev + `\n[Auto-Healing] The repair could not be drafted: ${proposed.data?.error || 'the server refused it.'} Nothing was changed.\n`);
            return result;
          }
          const created = { id: proposed.data.draftId as string, digest: proposed.data.draftDigest as string };
          draft = created;
          currentPayload = nextPayload;
          const label = draftTarget.kind === 'package' ? draftTarget.path : draftTarget.kind === 'module' ? 'Module' : 'Test code';
          setSandboxOutput(prev => prev + `\n[Auto-Healing] ${label} repaired as draft ${created.id}. Running the draft — nothing is saved until it compiles...\n`);
          continue;
        } catch (healError) {
          console.error('Auto-healing failed', healError);
          return result;
        }
      }

      if (!response.ok) {
        throw new Error(result.error || 'Test execution failed');
      }

      if (!draft) return result;

      // A draft ran. Only one that got past the compiler is offered for
      // adoption, and the server decides: it swaps the draft onto the project
      // only if the project still stands where the draft was cut.
      const ran = draft;
      if (result.buildError) {
        setSandboxOutput(prev => prev + `\n[Auto-Healing] The repair still does not compile. Nothing was saved — the generated package is unchanged.\n`);
        return result;
      }
      if (!result.draftReceipt) {
        setSandboxOutput(prev => prev + `\n[Auto-Healing] The run of draft ${ran.id} was not recorded, so it cannot be adopted. Nothing was saved.\n`);
        return result;
      }
      const adoption = { action: 'adopt', draftId: ran.id, expectedDraftDigest: ran.digest };
      // A 5xx is not a refusal: the adoption may have committed before the
      // server failed to answer, so it takes the lost-answer path below (QA
      // slice review of 81810c8026e0, 95912ce88e0d).
      const adopt = async () => {
        const answer = await repairDraftCall(adoption);
        if (answer.status >= 500) throw new Error(`The adoption answered ${answer.status}.`);
        return answer;
      };
      let adopted: Awaited<ReturnType<typeof repairDraftCall>>;
      try {
        adopted = await adopt();
      } catch {
        // The request may have reached the server and committed while its
        // answer was lost (QA review of 4b4586aff273). Adoption is a
        // compare-and-swap that refuses a second adoption of the same draft by
        // name, so asking again is safe — and its answer says which it was.
        setSandboxOutput(prev => prev + `\n[Auto-Healing] The answer to the adoption of draft ${ran.id} did not arrive. Asking the server again...\n`);
        try {
          adopted = await adopt();
        } catch {
          throw new Error(`The adoption of draft ${ran.id} was sent, but no answer arrived. The project may already hold the repair — reload it to see what is stored.`);
        }
      }
      if (!adopted.ok && adopted.data?.code === 'already-adopted') {
        // The lost request was adopted. What it wrote is read back from the
        // project — the server's record, not this hook's guess.
        const snap = await getDoc(doc(getDb(), 'projects', projectId));
        const stored = (snap.exists() ? snap.data() : {}) as Partial<Project>;
        const storedReceipt = stored.testRunReceipt as TestRunReceipt | undefined;
        if (storedReceipt?.draft?.id === ran.id) {
          const fields: Partial<Project> = {
            generatedCode: stored.generatedCode,
            testSuite: stored.testSuite,
            testCases: stored.testCases,
            testRunReceipt: storedReceipt,
          };
          if (setProject) setProject((prev: Project | null) => (prev ? { ...prev, ...fields } : prev));
          setSandboxOutput(prev => prev + `\n[Auto-Healing] Draft ${ran.id} had been adopted by the request whose answer was lost. The project holds the repaired code.\n`);
          return { ...result, receipt: storedReceipt };
        }
      }
      if (!adopted.ok) {
        setSandboxOutput(prev => prev + `\n[Auto-Healing] The repair compiled but was not adopted: ${adopted.data?.error || 'the server refused it.'}\n`);
        return result;
      }
      const fields = (adopted.data?.fields || {}) as Partial<Project>;
      if (setProject) {
        setProject((prev: Project | null) => (prev ? { ...prev, ...fields } : prev));
      }
      setSandboxOutput(prev => prev + `\n[Auto-Healing] Draft ${ran.id} compiled and was adopted. The project now holds the repaired code, and its receipt names the draft that ran.\n`);
      return { ...result, receipt: (fields.testRunReceipt as TestRunReceipt | undefined) ?? null };
    }
    // TypeScript: should never reach here but satisfies return type
    throw new Error('Max retries exceeded');
  };

  const runTestCases = async (selectedTestCases: TestCase[]) => {
    setIsRunning(true);
    setSandboxOutput('Starting test execution environment...\n');
    setTestResults(null);
    setStubbedPackages([]);
    setAiExplanation(null);
    setRunError(null);

    // An ABAP Cloud suite is an ABAP Unit class. The isolated runner executes
    // node:test over JavaScript and TypeScript and nothing else, so there is no
    // run of it here — and none is made up. This branch used to write a
    // simulated ABAP Unit report and mark every selected case `Simulated` without
    // calling any server: the page then showed "10 of 10 produced no result",
    // which reads as a runner that failed, when no runner was ever asked
    // (owner report 02.10.2026). The page offers no run for this route; if a
    // caller asks anyway, it is told why and nothing is written.
    if (isAbapUnitRoute(project)) {
      setRunError(ABAP_UNIT_NOT_RUNNABLE);
      setSandboxOutput(`No run: ${ABAP_UNIT_NOT_RUNNABLE}\n`);
      setIsRunning(false);
      return null;
    }

    // A locked path is not attempted and not explained by a model: the server would
    // refuse it (403), and the refusal used to reach the terminal as an "Execution
    // Error" and go to Gemini for an explanation of a failure that was a decision.
    if (project?.s4Environment === 'live' && LIVE_TEST_EXECUTION.locked) {
      setSandboxOutput(`Live test execution is locked (${LIVE_TEST_EXECUTION.id}).\n\n${LIVE_TEST_EXECUTION.userNotice}\n\nThe scenarios run against mocks.`);
      setRunError(LIVE_TEST_EXECUTION.userNotice);
      setIsRunning(false);
      return null;
    }

    const smokeTests = selectedTestCases.filter(tc => tc.category === 'Smoke Test' || tc.priority === 'High');

    try {
      const payload = { 
        tests: project?.testSuite, 
        projectId, 
        code: project?.generatedCode,
        selectedTestIds: selectedTestCases.map(tc => tc.id),
        s4Environment: project?.s4Environment,
        s4Config: project?.s4Config
      };
      
      if (smokeTests.length > 0) {
        setSandboxOutput(prev => prev + 'Running Smoke Tests...\n');
      }
      
      const result = await executeWithHealing(payload);

      // One rule for what a run says about a case, shared with the route that
      // stores it (`lib/test-verdicts.ts`): the runner's verdict where there is
      // one, `Not run` where there is not. A test the runner never mentioned
      // used to inherit `result.exitCode === 0` and be labelled "Verified by
      // Node.js Test Runner".
      const reported = Array.isArray(result.testResults) ? result.testResults : [];
      const results = applyRunnerVerdicts(selectedTestCases, reported, result.exitCode) as TestCase[];
      setTestResults(results);

      // A run in which no scenario got a verdict says why, on the page. Each
      // case already carries its own "Not run" message; this is the one
      // sentence for the run as a whole.
      if (!results.some((r) => r.status === 'Passed' || r.status === 'Failed')) {
        const detail = firstLine(result.error);
        setRunError(
          result.buildError
            ? `The generated code did not compile in the runner, so no scenario ran${detail ? `: ${detail}` : '.'}`
            : reported.length === 0
              ? `The runner finished without a result for any selected scenario${detail ? `: ${detail}` : ' — the suite may not contain tests with these names.'}`
              : 'The runner reported on the scenarios, but none of them passed or failed — the run output says why for each.',
        );
      }

      // The project in this page's state, brought up to what the server just
      // wrote: the verdicts of this run and the receipt that attests to it. It is
      // a mirror, not a write — `/api/run-tests` stored both with the Admin SDK
      // (QA 6c38e0c7c620), and nothing here may put a verdict into Firestore,
      // because a verdict a browser can write is exactly what the receipt exists
      // to distinguish itself from. Without the receipt the page shows the
      // verdicts and the phase contract reads them as self-reported, which is
      // what an unrecorded run is.
      if (setProject && result.receipt) {
        const receipt = result.receipt;
        const executed = applyRunnerVerdicts(project?.testCases || [], reported, result.exitCode) as TestCase[];
        setProject((prev: Project | null) => (prev ? { ...prev, testCases: executed, testRunReceipt: receipt } : prev));
      }
      const stubs = Array.isArray(result.stubbedPackages) ? result.stubbedPackages : [];
      setStubbedPackages(stubs);

      const rawOutput = result.output || '';
      const errorOutput = result.error ? `\nErrors:\n${result.error}` : '';
      setSandboxOutput(generateQAReport(results, stubs) + `\n\nRaw Output:\n${rawOutput}${errorOutput}`);
      
      const overallFailed = result.exitCode !== 0;
      if (overallFailed) {
        await explainTestFailure(rawOutput, result.error || '');
      }
      
      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Test Runner failed:', err);
      setSandboxOutput(prev => prev + `\n\nExecution Error:\n${message}`);
      setRunError(message || 'The run could not be started.');
      await explainTestFailure('', message);
      return null;
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, testResults, sandboxOutput, setSandboxOutput, aiExplanation, runTestCases, stubbedPackages, runError };
};
