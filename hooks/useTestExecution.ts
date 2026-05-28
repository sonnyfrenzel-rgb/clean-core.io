import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
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

  const executeWithHealing = async (payload: { tests: Project['testSuite']; projectId: string; code: string | undefined }, maxRetries = 1): Promise<{ exitCode: number; output: string; error?: string }> => {
    let currentPayload = { ...payload };
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response;
      try {
        response = await fetch('/api/run-tests', {
          method: 'POST',
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
      
      let result: { exitCode: number; output: string; error?: string };
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
    
    const smokeTests = selectedTestCases.filter(tc => tc.category === 'Smoke Test' || tc.priority === 'High');
    
    try {
      const payload = { 
        tests: project?.testSuite, 
        projectId, 
        code: project?.generatedCode,
        selectedTestIds: selectedTestCases.map(tc => tc.id)
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

  return { isRunning, testResults, sandboxOutput, aiExplanation, runTestCases };
};
