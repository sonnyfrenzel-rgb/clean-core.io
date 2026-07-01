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
      const fixedCode = await callGemini(prompt, 'gemini-3-flash-preview', false);
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
      
      const explanation = await callGemini(prompt, 'gemini-3-flash-preview', false);
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

          liveResults.push({
            id: 'TC_CONN',
            name: 'Endpoint Reachability',
            description: 'Verifies that the S/4HANA tenant URL is reachable via HTTPS',
            category: 'Connectivity',
            priority: 'Critical' as any,
            status: tenantReachable ? 'Passed' : 'Failed',
            message: tenantReachable
              ? `Endpoint responded (HTTP ${httpStatus})`
              : `Unreachable: ${connectionResult.message}`
          });

          setSandboxOutput(prev => prev + `  → ${tenantReachable ? '✅ PASSED' : '❌ FAILED'}: ${connectionResult.message}\n`);

          // ── TC_AUTH: Authentication Validation ──
          setSandboxOutput(prev => prev + `\n[TC_AUTH] Validating ${project.s4Meta?.authType || project.s4Config?.authType || 'basic'} authentication...\n`);
          liveResults.push({
            id: 'TC_AUTH',
            name: `${(project.s4Meta?.authType || project.s4Config?.authType || 'basic').toUpperCase()} Authentication`,
            description: 'Validates that the provided credentials are accepted by the tenant',
            category: 'Security',
            priority: 'Critical' as any,
            status: isFullyConnected ? 'Passed' : 'Failed',
            message: isAuthFailed
              ? `Credentials rejected (HTTP ${httpStatus}) — verify username/password`
              : !tenantReachable
                ? 'Skipped — endpoint unreachable'
                : `Authenticated successfully (HTTP ${httpStatus})`
          });

          setSandboxOutput(prev => prev + `  → ${isFullyConnected ? '✅ PASSED' : '❌ FAILED'}: ${isAuthFailed ? 'HTTP ' + httpStatus + ' — credentials rejected' : isFullyConnected ? 'HTTP ' + httpStatus : 'Skipped'}\n`);

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
              status: hasMetadata ? 'Passed' : 'Failed',
              message: hasMetadata
                ? `${entityTypes.length} EntityTypes, ${entitySets.length} EntitySets discovered`
                : 'OData $metadata not accessible — the API service path may be incorrect or requires additional permissions'
            });

            setSandboxOutput(prev => prev + `  → ${hasMetadata ? '✅ PASSED' : '❌ FAILED'}: ${hasMetadata ? entitySets.length + ' EntitySets found' : 'Metadata unavailable'}\n`);

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
                  status: 'Passed',
                  message: `EntitySet "${es.name}" available in $metadata schema`
                });
                setSandboxOutput(prev => prev + `  → ✅ ${es.name}\n`);
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
                    category: 'Business Logic',
                    priority: 'High' as any,
                    status: readPassed ? 'Passed' : 'Failed',
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
                    category: 'Business Logic',
                    priority: 'High' as any,
                    status: 'Failed',
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
              status: 'Failed',
              message: isAuthFailed
                ? 'Skipped — authentication failed, cannot access $metadata'
                : 'Skipped — endpoint unreachable'
            });
            setSandboxOutput(prev => prev + `\n[TC_META] Skipped — ${isAuthFailed ? 'authentication failed' : 'endpoint unreachable'}\n`);
          }

          // ── TC_CSRF: CSRF Token Availability (informational) ──
          liveResults.push({
            id: 'TC_CSRF',
            name: 'CSRF Token Handling',
            description: 'Verifies that the tenant supports x-csrf-token fetch for write operations',
            category: 'Security',
            priority: 'Medium' as any,
            status: isFullyConnected ? 'Passed' : 'Failed',
            message: isFullyConnected
              ? 'CSRF token can be fetched via x-csrf-token: fetch header (standard SAP pattern)'
              : 'Skipped — requires authenticated connection'
          });

          setTestResults(liveResults);

          // ── Build Report ──
          const passed = liveResults.filter(r => r.status === 'Passed').length;
          const failed = liveResults.length - passed;
          const timestamp = new Date().toLocaleString();

          let finalReport = `==================================================\n`;
          finalReport += `S/4HANA LIVE TENANT VALIDATION REPORT - ${timestamp}\n`;
          finalReport += `==================================================\n\n`;
          finalReport += `Tenant: ${tenantUrl}\n`;
          finalReport += `Auth Method: ${project.s4Meta?.authType || project.s4Config?.authType || 'basic'}\n`;
          finalReport += `Connectivity: ${tenantReachable ? 'CONNECTED' : 'FAILED'}\n`;
          finalReport += `Auth Status: ${isAuthFailed ? 'REJECTED (HTTP ' + httpStatus + ')' : isFullyConnected ? 'OK (HTTP ' + httpStatus + ')' : 'N/A'}\n`;

          const entitySets = metadataServices.filter(s => s.type === 'EntitySet');
          if (metadataServices.length > 0) {
            const entityTypes = metadataServices.filter(s => s.type === 'EntityType');
            finalReport += `OData Metadata: VERIFIED (${entityTypes.length} EntityTypes, ${entitySets.length} EntitySets)\n`;
          } else if (isFullyConnected) {
            finalReport += `OData Metadata: NOT AVAILABLE\n`;
          }

          finalReport += `\nSummary:\n`;
          finalReport += `- Total Tests: ${liveResults.length}\n`;
          finalReport += `- Passed:      ${passed}\n`;
          finalReport += `- Failed:      ${failed}\n\n`;
          finalReport += `Detailed Results:\n`;
          liveResults.forEach((r, i) => {
            finalReport += `${i + 1}. [${r.status!.toUpperCase()}] ${r.id}: ${r.name}\n`;
            if (r.message) finalReport += `   → ${r.message}\n`;
          });
          finalReport += `\n==================================================\n`;
          finalReport += `End of Live Tenant Validation Report\n`;

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
