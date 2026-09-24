import { useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { callGemini } from '@/lib/gemini';
import { useUserProfile } from './useUserProfile';
import type { Project, TestCase } from '@/lib/types';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { parseGeneratedPackage, replaceFileContent, repairTarget } from '@/lib/generated-package';
import { applyRunnerVerdicts } from '@/lib/test-verdicts';
import type { TestRunReceipt } from '@/lib/test-receipt';
import { candidateDigests, storedSuiteSource, type RepairDraftTarget } from '@/lib/repair-draft';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';

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
  const { profile } = useUserProfile();

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
  const repairDraftCall = async (body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> => {
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
    return { ok: res.ok, data };
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
      const adopted = await repairDraftCall({ action: 'adopt', draftId: ran.id, expectedDraftDigest: ran.digest });
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

    const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');
    if (isAbapCloud) {
      try {
        const isLiveMode = project?.s4Environment === 'live' && project?.s4Config?.url;

        if (isLiveMode) {
          // ── LIVE TENANT VALIDATION ──────────────────────────────
          // Generate real validation test cases based on what we can actually verify
          setSandboxOutput('Initializing S/4HANA Live Tenant Validation...\n');
          await new Promise(resolve => setTimeout(resolve, 400));

          const liveResults: TestCase[] = [];
          const tenantUrl = project.s4Config!.url;

          // ── TC_CONN: Endpoint Reachability ──
          setSandboxOutput(prev => prev + `\n[TC_CONN] Testing endpoint reachability: ${tenantUrl}\n`);
          let connectionResult: { status: string; message: string; httpStatus?: number };
          try {
            const token = await (await import('@/lib/firebase')).getAuth().currentUser?.getIdToken();
            const connResponse = await fetch('/api/test-s4-connection', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                useStoredCredentials: true,
              })
            });
            connectionResult = await connResponse.json();
          } catch (err) {
            connectionResult = { status: 'failed', message: err instanceof Error ? err.message : 'Network error' };
          }

          const tenantReachable = connectionResult.status === 'connected';
          const httpStatus = connectionResult.httpStatus || 0;
          const isAuthFailed = httpStatus === 401 || httpStatus === 403;
          const isFullyConnected = tenantReachable && !isAuthFailed;

          // Every check below reaches the tenant; none of them runs the generated
          // code. They report `Connectivity` or `Error`, never `Passed` (E07-F01-
          // US02: "a metadata call writes connectivity"). They used to write
          // `Passed`, and a tenant that answered its login page produced a row of
          // green verdicts in a "Live Tenant Validation Report".
          liveResults.push({
            id: 'TC_CONN',
            name: 'Endpoint Reachability',
            description: 'Verifies that the S/4HANA tenant URL is reachable via HTTPS',
            category: 'Connectivity',
            priority: 'Critical' as any,
            status: tenantReachable ? 'Connectivity' : 'Error',
            message: tenantReachable
              ? `Endpoint responded (HTTP ${httpStatus})`
              : `Unreachable: ${connectionResult.message}`
          });

          setSandboxOutput(prev => prev + `  → ${tenantReachable ? '🔌 REACHED' : '❌ ERROR'}: ${connectionResult.message}\n`);

          // ── TC_AUTH: Authentication Validation ──
          setSandboxOutput(prev => prev + `\n[TC_AUTH] Validating ${project.s4Meta?.authType || project.s4Config?.authType || 'basic'} authentication...\n`);
          liveResults.push({
            id: 'TC_AUTH',
            name: `${(project.s4Meta?.authType || project.s4Config?.authType || 'basic').toUpperCase()} Authentication`,
            description: 'Validates that the provided credentials are accepted by the tenant',
            category: 'Security',
            priority: 'Critical' as any,
            status: isFullyConnected ? 'Connectivity' : 'Error',
            message: isAuthFailed
              ? `Credentials rejected (HTTP ${httpStatus}) — verify username/password`
              : !tenantReachable
                ? 'Skipped — endpoint unreachable'
                : `Authenticated successfully (HTTP ${httpStatus})`
          });

          setSandboxOutput(prev => prev + `  → ${isFullyConnected ? '🔌 LOGGED IN' : '❌ ERROR'}: ${isAuthFailed ? 'HTTP ' + httpStatus + ' — credentials rejected' : isFullyConnected ? 'HTTP ' + httpStatus : 'Skipped'}\n`);

          // ── TC_META: OData $metadata Accessibility ──
          let metadataServices: { name: string; type: string }[] = [];

          if (isFullyConnected) {
            setSandboxOutput(prev => prev + `\n[TC_META] Fetching OData $metadata...\n`);
            await new Promise(resolve => setTimeout(resolve, 300));

            try {
              const metaToken = await getAuth().currentUser?.getIdToken();
              const metaResponse = await fetch('/api/fetch-s4-metadata', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(metaToken ? { 'Authorization': `Bearer ${metaToken}` } : {}),
                },
                body: JSON.stringify({
                  useStoredCredentials: true,
                  servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER'
                })
              });
              const metaResult = await metaResponse.json();

              if (metaResult.status === 'success' && metaResult.services) {
                metadataServices = metaResult.services;
              }
            } catch (metaErr) {
              // metadata fetch failed
            }

            const hasMetadata = metadataServices.length > 0;
            const entitySets = metadataServices.filter(s => s.type === 'EntitySet');
            const entityTypes = metadataServices.filter(s => s.type === 'EntityType');

            liveResults.push({
              id: 'TC_META',
              name: 'OData $metadata Accessibility',
              description: 'Fetches the OData $metadata document to discover available EntitySets and types',
              category: 'Functional',
              priority: 'High' as any,
              status: hasMetadata ? 'Connectivity' : 'Error',
              message: hasMetadata
                ? `${entityTypes.length} EntityTypes, ${entitySets.length} EntitySets discovered`
                : 'OData $metadata not accessible — the API service path may be incorrect or requires additional permissions'
            });

            setSandboxOutput(prev => prev + `  → ${hasMetadata ? '🔌 READ' : '❌ ERROR'}: ${hasMetadata ? entitySets.length + ' EntitySets found' : 'Metadata unavailable'}\n`);

            // ── TC_ENTITY_*: Individual EntitySet Schema Availability ──
            if (hasMetadata && entitySets.length > 0) {
              setSandboxOutput(prev => prev + `\n[TC_ENTITY] Validating discovered OData EntitySets...\n`);
              const maxSchemaEntities = Math.min(entitySets.length, 8);
              for (let i = 0; i < maxSchemaEntities; i++) {
                const es = entitySets[i];
                liveResults.push({
                  id: `TC_ES_${String(i + 1).padStart(2, '0')}`,
                  name: `EntitySet: ${es.name}`,
                  description: `Verifies that EntitySet ${es.name} is declared in the OData schema`,
                  category: 'Functional',
                  priority: 'Medium' as any,
                  status: 'Connectivity',
                  message: `EntitySet "${es.name}" declared in the $metadata schema`
                });
                setSandboxOutput(prev => prev + `  → 🔌 ${es.name}\n`);
              }
              if (entitySets.length > maxSchemaEntities) {
                setSandboxOutput(prev => prev + `  ... and ${entitySets.length - maxSchemaEntities} more EntitySets available\n`);
              }

              // ── TC_READ_*: Live OData GET Reads ──
              setSandboxOutput(prev => prev + `\n[TC_READ] Executing live OData GET reads against tenant...\n`);
              const maxReadTests = Math.min(entitySets.length, 5);
              for (let i = 0; i < maxReadTests; i++) {
                const es = entitySets[i];
                setSandboxOutput(prev => prev + `  [${i + 1}/${maxReadTests}] GET ${es.name}?$top=1 ...`);

                try {
                  const readToken = await getAuth().currentUser?.getIdToken();
                  const readResp = await fetch('/api/test-s4-odata-read', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(readToken ? { 'Authorization': `Bearer ${readToken}` } : {}),
                    },
                    body: JSON.stringify({
                      useStoredCredentials: true,
                      servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
                      entitySet: es.name,
                    })
                  });
                  const readResult = await readResp.json();

                  const readPassed = readResult.status === 'success';
                  liveResults.push({
                    id: `TC_RD_${String(i + 1).padStart(2, '0')}`,
                    name: `OData Read: ${es.name}`,
                    description: `Executes GET ${es.name}?$top=1 to verify data accessibility`,
                    category: 'Connectivity',
                    priority: 'High' as any,
                    status: readPassed ? 'Connectivity' : 'Error',
                    message: readPassed
                      ? `${readResult.recordCount} record(s), fields: [${(readResult.sampleFields || []).join(', ')}]`
                      : readResult.message || 'OData read failed'
                  });
                  setSandboxOutput(prev => prev + ` ${readPassed ? '✅' : '❌'} ${readResult.message}\n`);
                } catch (readErr) {
                  liveResults.push({
                    id: `TC_RD_${String(i + 1).padStart(2, '0')}`,
                    name: `OData Read: ${es.name}`,
                    description: `Executes GET ${es.name}?$top=1 to verify data accessibility`,
                    category: 'Connectivity',
                    priority: 'High' as any,
                    status: 'Error',
                    message: `Network error: ${readErr instanceof Error ? readErr.message : 'Unknown'}`
                  });
                  setSandboxOutput(prev => prev + ` ❌ Network error\n`);
                }
              }
            }
          } else {
            // Auth failed or unreachable — skip metadata tests
            liveResults.push({
              id: 'TC_META',
              name: 'OData $metadata Accessibility',
              description: 'Fetches the OData $metadata document to discover available EntitySets and types',
              category: 'Functional',
              priority: 'High' as any,
              status: 'Not run',
              message: isAuthFailed
                ? 'Not run — authentication failed, cannot access $metadata'
                : 'Not run — endpoint unreachable'
            });
            setSandboxOutput(prev => prev + `\n[TC_META] Skipped — ${isAuthFailed ? 'authentication failed' : 'endpoint unreachable'}\n`);
          }

          // ── TC_CSRF ──
          // This used to be `Passed` whenever the login worked, with the message
          // "CSRF token can be fetched" — and no x-csrf-token request was ever
          // made. It is reported as what it is: not checked.
          liveResults.push({
            id: 'TC_CSRF',
            name: 'CSRF Token Handling',
            description: 'Would verify that the tenant issues an x-csrf-token for write operations',
            category: 'Security',
            priority: 'Medium' as any,
            status: 'Not run',
            message: 'Not checked — no x-csrf-token request is made by this validation.'
          });

          setTestResults(liveResults);

          // ── Build Report ──
          const reached = liveResults.filter(r => r.status === 'Connectivity').length;
          const errors = liveResults.filter(r => r.status === 'Error').length;
          const notRun = liveResults.filter(r => r.status === 'Not run').length;
          const timestamp = new Date().toLocaleString();

          let finalReport = `==================================================\n`;
          finalReport += `S/4HANA LIVE TENANT CONNECTIVITY REPORT - ${timestamp}\n`;
          finalReport += `==================================================\n\n`;
          finalReport += `Tenant: ${tenantUrl}\n`;
          finalReport += `Auth Method: ${project.s4Meta?.authType || project.s4Config?.authType || 'basic'}\n`;
          finalReport += `Connectivity: ${tenantReachable ? 'CONNECTED' : 'FAILED'}\n`;
          finalReport += `Auth Status: ${isAuthFailed ? 'REJECTED (HTTP ' + httpStatus + ')' : isFullyConnected ? 'OK (HTTP ' + httpStatus + ')' : 'N/A'}\n`;

          const entitySets = metadataServices.filter(s => s.type === 'EntitySet');
          if (metadataServices.length > 0) {
            const entityTypes = metadataServices.filter(s => s.type === 'EntityType');
            finalReport += `OData Metadata: READABLE (${entityTypes.length} EntityTypes, ${entitySets.length} EntitySets)\n`;
          } else if (isFullyConnected) {
            finalReport += `OData Metadata: NOT AVAILABLE\n`;
          }

          finalReport += `\nSummary:\n`;
          finalReport += `- Connectivity checks: ${liveResults.length}\n`;
          finalReport += `- Reached:     ${reached}\n`;
          finalReport += `- Errors:      ${errors}\n`;
          if (notRun > 0) finalReport += `- Not run:     ${notRun}\n`;
          finalReport += `\nNo test of the generated code was executed. These checks show that the\n`;
          finalReport += `tenant can be reached, logged into and read — not that the transformed\n`;
          finalReport += `code works. An ABAP Unit run in the tenant is what would show that.\n\n`;
          finalReport += `Detailed Results:\n`;
          liveResults.forEach((r, i) => {
            finalReport += `${i + 1}. [${r.status!.toUpperCase()}] ${r.id}: ${r.name}\n`;
            if (r.message) finalReport += `   → ${r.message}\n`;
          });
          finalReport += `\n==================================================\n`;
          finalReport += `End of Live Tenant Connectivity Report\n`;

          setSandboxOutput(finalReport);
          return liveResults;
        } else {
          // Mock mode: simulated ABAP Unit execution
          setSandboxOutput('[SIMULATED] Initializing SAP ADT Test Cockpit Environment...\n');
          await new Promise(resolve => setTimeout(resolve, 600));

          setSandboxOutput(prev => prev + '[SIMULATED] Registering SQL Test Double Framework local stubs...\n');
          await new Promise(resolve => setTimeout(resolve, 500));

          setSandboxOutput(prev => prev + '[SIMULATED] Executing ABAP Unit Test Class ZCL_DEMO_RAP_TEST...\n\n');
          await new Promise(resolve => setTimeout(resolve, 700));

          // A mock run is not a pass. The message said `[SIMULATED]` and the status
          // said `Passed`, and everything downstream — the report arithmetic, the
          // delivery page's "tests verified" line — reads the status.
          const results = selectedTestCases.map((tc) => {
            return {
              ...tc,
              status: 'Simulated' as const,
              message: `[SIMULATED] CL_AUNIT_ASSERT=>ASSERT_EQUALS passed in mock context — nothing was executed against an SAP system. A connected tenant can check the connection, but running tests against it is locked.`
            };
          });

          setTestResults(results);

          const timestamp = new Date().toLocaleString();
          let finalReport = `==================================================\n`;
          finalReport += `SIMULATED ABAP UNIT TEST REPORT - ${timestamp}\n`;
          finalReport += `==================================================\n`;
          finalReport += `⚠️  These results are SIMULATED. No S/4HANA tenant was contacted.\n`;
          finalReport += `    Running tests against a connected tenant is locked (${LIVE_TEST_EXECUTION.id}); the tenant tab only checks the connection.\n\n`;
          finalReport += `Summary:\n`;
          finalReport += `- Total Tests: ${results.length}\n`;
          finalReport += `- Simulated Passed: ${results.length}\n\n`;
          finalReport += `Detailed Results:\n`;
          results.forEach((r, i) => {
            finalReport += `${i + 1}. [SIMULATED PASS] ${r.id}: ${r.name}\n`;
          });
          finalReport += `\n==================================================\n`;
          finalReport += `End of Simulated Report — no real ABAP Unit verdict exists for this code yet.\n`;

          setSandboxOutput(finalReport);
          return results;
        }
      } catch (err) {
        console.error('Test execution failed:', err);
        setSandboxOutput(prev => prev + `\n\nExecution Error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      } finally {
        setIsRunning(false);
      }
    }
    
    // A locked path is not attempted and not explained by a model: the server would
    // refuse it (403), and the refusal used to reach the terminal as an "Execution
    // Error" and go to Gemini for an explanation of a failure that was a decision.
    if (project?.s4Environment === 'live' && LIVE_TEST_EXECUTION.locked) {
      setSandboxOutput(`Live test execution is locked (${LIVE_TEST_EXECUTION.id}).\n\n${LIVE_TEST_EXECUTION.userNotice}\n\nSwitch to the Mock Environment to run the tests in the sandbox.`);
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
      await explainTestFailure('', message);
      return null;
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, testResults, sandboxOutput, setSandboxOutput, aiExplanation, runTestCases, stubbedPackages };
};
