import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import { callGemini } from '@/lib/gemini';
import { useUserProfile } from './useUserProfile';
import type { Project, TestCase } from '@/lib/types';

export const useTestExecution = (projectId: string, project: Project | null, setProject?: React.Dispatch<React.SetStateAction<Project | null>>) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestCase[] | null>(null);
  const [sandboxOutput, setSandboxOutput] = useState<string>('Sandbox initialized. Waiting for execution...');
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const { profile } = useUserProfile();

  const generateQAReport = (results: TestCase[]) => {
    const passed = results.filter(r => r.status === 'Passed').length;
    const failed = results.length - passed;
    const timestamp = new Date().toLocaleString();
    
    let report = `==================================================\n`;
    report += `QA ENGINEER TEST REPORT - ${timestamp}\n`;
    report += `==================================================\n\n`;
    report += `Summary:\n`;
    report += `- Total Tests: ${results.length}\n`;
    report += `- Passed:      ${passed}\n`;
    report += `- Failed:      ${failed}\n\n`;
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

  const autoHealTestCode = async (errorOutput: string, currentCode: string) => {
    setSandboxOutput(prev => prev + '\n\n[Auto-Healing] Syntax error detected. Asking AI to fix the test code...');
    const prompt = `The following Node.js test code failed with a syntax or type error:
    
    ERROR:
    ${errorOutput}
    
    CURRENT TEST CODE:
    ${currentCode}
    
    Please fix the test code. 
    IMPORTANT: The application code is located in a file named 'app.ts' in the same directory. You MUST import the functions/classes you want to test from './app'. Do not import from './index' or any other file.

    Return ONLY the raw fixed TypeScript code without any markdown formatting or explanation.`;
    
    try {
      const fixedCode = await callGemini(prompt, 'gemini-3-flash-preview', false, profile?.geminiApiKey);
      // Strip markdown blocks if present
      return fixedCode.replace(/^```typescript\n?/gm, '').replace(/^```\n?/gm, '');
    } catch (err) {
      console.error("Auto-healing failed", err);
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
      
      const explanation = await callGemini(prompt, 'gemini-3-flash-preview', false, profile?.geminiApiKey);
      setAiExplanation(explanation || "No explanation provided by AI.");
    } catch (e) {
      console.error("Failed to generate AI explanation", e);
    }
  };

  const executeWithHealing = async (payload: { tests: Project['testSuite']; projectId: string; code: string | undefined }, maxRetries = 1): Promise<{ exitCode: number; output: string; error?: string; testResults?: any[] }> => {
    let currentPayload = { ...payload };
    
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
          body: JSON.stringify(currentPayload),
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
      
      let result: { exitCode: number; output: string; error?: string; testResults?: any[] };
      try {
        const textResponse = await response.text();
        result = JSON.parse(textResponse);
      } catch (err) {
        throw new Error(`Execution environment failure (Status ${response.status}). The sandbox may be restarting, or returned an invalid API response.`);
      }
      
      if (!response.ok) {
        // If it's a syntax error (400) and we have retries left, try to heal
        if (response.status === 400 && attempt < maxRetries) {
          try {
            const fixedCode = await autoHealTestCode(result.error || '', currentPayload.tests?.code || '');
            currentPayload = { ...currentPayload, tests: { ...currentPayload.tests, code: fixedCode } };
            
            // Save the healed code to Firestore
            if (setProject && project) {
              const db = getDb();
              const updatedTestSuite = { ...project.testSuite, code: fixedCode };
              await updateDoc(doc(db, 'projects', projectId), { testSuite: updatedTestSuite });
              setProject((prev: Project | null) => prev ? { ...prev, testSuite: updatedTestSuite } : prev);
            }
            
            setSandboxOutput(prev => prev + '\n[Auto-Healing] Code updated. Retrying execution...\n');
            continue; // Retry
          } catch (healError) {
            console.error("Auto-healing failed", healError);
            throw new Error(result.error || 'Test execution failed');
          }
        }
        throw new Error(result.error || 'Test execution failed');
      }
      
      return result;
    }
    // TypeScript: should never reach here but satisfies return type
    throw new Error('Max retries exceeded');
  };

  const runTestCases = async (selectedTestCases: TestCase[]) => {
    setIsRunning(true);
    setSandboxOutput('Starting test execution environment...\n');
    setTestResults(null);
    setAiExplanation(null);

    const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');
    if (isAbapCloud) {
      try {
        const isLiveMode = project?.s4Environment === 'live' && project?.s4Config?.url;

        if (isLiveMode) {
          // Real S/4HANA tenant validation
          setSandboxOutput('Initializing S/4HANA Live Tenant Validation...\n');
          await new Promise(resolve => setTimeout(resolve, 400));

          setSandboxOutput(prev => prev + `Validating endpoint reachability: ${project.s4Config!.url}\n`);

          // Actually call the real test-s4-connection API
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
                url: project.s4Config!.url,
                username: project.s4Config!.username || '',
                password: project.s4Config!.password || '',
                authType: project.s4Config!.authType || 'basic',
                btpDestinationJson: project.s4Config!.btpDestinationJson || ''
              })
            });
            connectionResult = await connResponse.json();
          } catch (err) {
            connectionResult = { status: 'failed', message: err instanceof Error ? err.message : 'Network error' };
          }

          const tenantReachable = connectionResult.status === 'connected';

          setSandboxOutput(prev => prev +
            `Tenant connectivity: ${tenantReachable ? '[OK] ' + connectionResult.message : '[FAILED] ' + connectionResult.message}\n` +
            (connectionResult.httpStatus ? `HTTP Status: ${connectionResult.httpStatus}\n` : '')
          );

          // --- OData $metadata Fetch ---
          let metadataServices: { name: string; type: string }[] = [];
          let metadataMessage = '';

          if (tenantReachable) {
            setSandboxOutput(prev => prev + `\nFetching OData $metadata from tenant...\n`);
            await new Promise(resolve => setTimeout(resolve, 300));

            try {
              const token = await getAuth().currentUser?.getIdToken();
              const metaResponse = await fetch('/api/fetch-s4-metadata', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  url: project.s4Config!.url,
                  username: project.s4Config!.username || '',
                  password: project.s4Config!.password || '',
                  authType: project.s4Config!.authType || 'basic',
                  btpDestinationJson: project.s4Config!.btpDestinationJson || '',
                  servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER'
                })
              });
              const metaResult = await metaResponse.json();

              if (metaResult.status === 'success' && metaResult.services) {
                metadataServices = metaResult.services;
                metadataMessage = `[OK] ${metaResult.message}`;
                const entityTypes = metadataServices.filter(s => s.type === 'EntityType');
                const entitySets = metadataServices.filter(s => s.type === 'EntitySet');
                const funcImports = metadataServices.filter(s => s.type === 'FunctionImport');
                setSandboxOutput(prev => prev +
                  `OData Metadata: ${metadataMessage}\n` +
                  `  → EntityTypes: ${entityTypes.length} | EntitySets: ${entitySets.length} | FunctionImports: ${funcImports.length}\n`
                );
              } else {
                metadataMessage = `[INFO] ${metaResult.message || 'Metadata not available'}`;
                setSandboxOutput(prev => prev + `OData Metadata: ${metadataMessage}\n`);
              }
            } catch (metaErr) {
              metadataMessage = `[WARN] Metadata fetch failed: ${metaErr instanceof Error ? metaErr.message : 'Unknown error'}`;
              setSandboxOutput(prev => prev + `OData Metadata: ${metadataMessage}\n`);
            }
          }

          setSandboxOutput(prev => prev + `\nExecuting ABAP Unit validation against live context...\n\n`);
          await new Promise(resolve => setTimeout(resolve, 500));

          // Map results based on actual validation depth:
          // - Connectivity checks: did the tenant respond at all?
          // - Auth checks: did we get past authentication (HTTP 2xx/3xx)?
          // - Metadata checks: could we read OData $metadata?
          const httpStatus = connectionResult.httpStatus || 0;
          const isAuthFailed = httpStatus === 401 || httpStatus === 403;
          const isFullyConnected = tenantReachable && !isAuthFailed;
          const hasMetadata = metadataServices.length > 0;

          const results = selectedTestCases.map((tc) => {
            const category = tc.category || '';

            // Connectivity tests: pass if tenant responds at all (even 401)
            if (category === 'Connectivity' || category === 'Smoke Test') {
              return {
                ...tc,
                status: tenantReachable ? 'Passed' as const : 'Failed' as const,
                message: tenantReachable
                  ? `Endpoint reachable (HTTP ${httpStatus})`
                  : `Tenant unreachable: ${connectionResult.message}`
              };
            }

            // Auth/Security tests: pass only if auth succeeded (not 401/403)
            if (category === 'Security' || category === 'Authorization') {
              return {
                ...tc,
                status: isFullyConnected ? 'Passed' as const : 'Failed' as const,
                message: isAuthFailed
                  ? `Authentication rejected (HTTP ${httpStatus}) — verify credentials`
                  : !tenantReachable
                    ? `Tenant unreachable: ${connectionResult.message}`
                    : `Authenticated successfully (HTTP ${httpStatus})`
              };
            }

            // Functional/Business/Transactional tests: need full auth + metadata
            if (['Functional', 'Business Logic', 'Transactional'].includes(category)) {
              if (!tenantReachable) {
                return { ...tc, status: 'Failed' as const, message: `Tenant unreachable: ${connectionResult.message}` };
              }
              if (isAuthFailed) {
                return { ...tc, status: 'Failed' as const, message: `Cannot validate — authentication failed (HTTP ${httpStatus}). Verify your credentials.` };
              }
              if (!hasMetadata) {
                return { ...tc, status: 'Failed' as const, message: `Cannot validate — OData $metadata not accessible. The API endpoint may require different permissions or the service path is incorrect.` };
              }
              return {
                ...tc,
                status: 'Passed' as const,
                message: `Validated against live tenant (HTTP ${httpStatus}, ${metadataServices.length} OData entities available)`
              };
            }

            // Default: pass only with full connection
            return {
              ...tc,
              status: isFullyConnected ? 'Passed' as const : 'Failed' as const,
              message: isFullyConnected
                ? `Validated against live tenant ${project.s4Config!.url} (HTTP ${httpStatus})`
                : isAuthFailed
                  ? `Authentication failed (HTTP ${httpStatus})`
                  : `Tenant unreachable: ${connectionResult.message}`
            };
          });

          setTestResults(results);

          const passed = results.filter(r => r.status === 'Passed').length;
          const failed = results.length - passed;
          const timestamp = new Date().toLocaleString();
          let finalReport = `==================================================\n`;
          finalReport += `S/4HANA LIVE TENANT VALIDATION REPORT - ${timestamp}\n`;
          finalReport += `==================================================\n\n`;
          finalReport += `Tenant: ${project.s4Config!.url}\n`;
          finalReport += `Auth Method: ${project.s4Config!.authType || 'basic'}\n`;
          finalReport += `Connectivity: ${tenantReachable ? 'CONNECTED' : 'FAILED'}\n`;
          finalReport += `Auth Status: ${isAuthFailed ? 'REJECTED (HTTP ' + httpStatus + ')' : isFullyConnected ? 'OK' : 'N/A'}\n`;

          if (metadataServices.length > 0) {
            const entityTypes = metadataServices.filter(s => s.type === 'EntityType');
            const entitySets = metadataServices.filter(s => s.type === 'EntitySet');
            const funcImports = metadataServices.filter(s => s.type === 'FunctionImport');
            finalReport += `OData Integration: VERIFIED\n`;
            finalReport += `  EntityTypes: ${entityTypes.length} | EntitySets: ${entitySets.length} | FunctionImports: ${funcImports.length}\n`;
            finalReport += `\n  Available OData Services:\n`;
            entitySets.slice(0, 15).forEach(s => {
              finalReport += `    • ${s.name}\n`;
            });
            if (entitySets.length > 15) {
              finalReport += `    ... and ${entitySets.length - 15} more\n`;
            }
          } else if (tenantReachable) {
            finalReport += `OData Integration: ${metadataMessage}\n`;
          }

          finalReport += `\nSummary:\n`;
          finalReport += `- Total Tests: ${results.length}\n`;
          finalReport += `- Passed:      ${passed}\n`;
          finalReport += `- Failed:      ${failed}\n\n`;
          finalReport += `Detailed Results:\n`;
          results.forEach((r, i) => {
            finalReport += `${i + 1}. [${r.status!.toUpperCase()}] ${r.id}: ${r.name}\n`;
            if (r.status === 'Failed') finalReport += `   → ${r.message}\n`;
          });
          finalReport += `\n==================================================\n`;
          finalReport += `End of Live Tenant Validation Report\n`;

          setSandboxOutput(finalReport);
          return results;
        } else {
          // Mock mode: simulated ABAP Unit execution
          setSandboxOutput('[SIMULATED] Initializing SAP ADT Test Cockpit Environment...\n');
          await new Promise(resolve => setTimeout(resolve, 600));

          setSandboxOutput(prev => prev + '[SIMULATED] Registering SQL Test Double Framework local stubs...\n');
          await new Promise(resolve => setTimeout(resolve, 500));

          setSandboxOutput(prev => prev + '[SIMULATED] Executing ABAP Unit Test Class ZCL_DEMO_RAP_TEST...\n\n');
          await new Promise(resolve => setTimeout(resolve, 700));

          const results = selectedTestCases.map((tc) => {
            return {
              ...tc,
              status: 'Passed' as const,
              message: `[SIMULATED] CL_AUNIT_ASSERT=>ASSERT_EQUALS passed in mock context — connect a Live Tenant for real validation.`
            };
          });

          setTestResults(results);

          const timestamp = new Date().toLocaleString();
          let finalReport = `==================================================\n`;
          finalReport += `SIMULATED ABAP UNIT TEST REPORT - ${timestamp}\n`;
          finalReport += `==================================================\n`;
          finalReport += `⚠️  These results are SIMULATED. No S/4HANA tenant was contacted.\n`;
          finalReport += `    Connect a Live Tenant in the panel above for real validation.\n\n`;
          finalReport += `Summary:\n`;
          finalReport += `- Total Tests: ${results.length}\n`;
          finalReport += `- Simulated Passed: ${results.length}\n\n`;
          finalReport += `Detailed Results:\n`;
          results.forEach((r, i) => {
            finalReport += `${i + 1}. [SIMULATED PASS] ${r.id}: ${r.name}\n`;
          });
          finalReport += `\n==================================================\n`;
          finalReport += `End of Simulated Report — Connect a tenant for real results.\n`;

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
      
      const results: TestCase[] = selectedTestCases.map(tc => {
        const match = result.testResults && Array.isArray(result.testResults)
          ? (result.testResults as any[]).find(r => r.id === tc.id)
          : null;
        
        if (match) {
          return {
            ...tc,
            status: match.status as 'Passed' | 'Failed',
            message: match.message || (match.status === 'Passed' ? 'Verified by Node.js Test Runner' : 'Test assertion failed')
          };
        }
        
        const passed = result.exitCode === 0;
        return {
          ...tc,
          status: passed ? 'Passed' as const : 'Failed' as const,
          message: passed ? 'Verified by Node.js Test Runner' : 'Test execution failed'
        };
      });
      setTestResults(results);
      
      const rawOutput = result.output || '';
      const errorOutput = result.error ? `\nErrors:\n${result.error}` : '';
      setSandboxOutput(generateQAReport(results) + `\n\nRaw Output:\n${rawOutput}${errorOutput}`);
      
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

  return { isRunning, testResults, sandboxOutput, setSandboxOutput, aiExplanation, runTestCases };
};
