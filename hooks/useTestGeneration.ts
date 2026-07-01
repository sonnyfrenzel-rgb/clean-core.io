import { useState, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { callGemini } from '@/lib/gemini';
import { useUserProfile } from './useUserProfile';
import type { Project, TestCase, TestSuite, CoverageEstimate, ManualTestRequirement } from '@/lib/types';

export const useTestGeneration = (projectId: string, project: Project | null, setProject: React.Dispatch<React.SetStateAction<Project | null>>) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>(project?.testCases || []);
  const { profile } = useUserProfile();

  const generateTestCases = async (previousError?: string) => {
    setIsGenerating(true);
    try {
      const isAbapCloud = (project?.extensibilityRoute || '').includes('ABAP Cloud');

      const prompt = isAbapCloud
        ? `Given the following context:
        Legacy Code: ${project?.legacyCode}
        Design: ${project?.solutionDesign}
        Generated ABAP Cloud RAP Code: ${project?.generatedCode}
        ${previousError ? `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n${previousError}\nPLEASE FIX THE CODE TO RESOLVE THIS ERROR.` : ''}
        
        Generate:
        1. 10 simple, robust ABAP Unit test cases designed for Developer Extensibility.
        2. A complete ABAP Unit test class definition and implementation verifying the behavior implementation class (e.g. \`BP_...\`) using \`cl_abap_unit_test\` and \`cl_aunit_assert\`.
        3. A list of areas that could not be fully unit-tested (e.g. real external service integrations, async queues, standard authority checks) and must be verified via "human-in-the-loop" testing.
        4. A coverageEstimate object with { percentage: number (0-100), explanation: string, missingCoverage: string }.
        
        CRITICAL GUIDELINES FOR ABAP UNIT:
        - The test class MUST use clean ABAP Cloud syntax: \`CLASS ltcl_test DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.\`
        - Use local test doubles and stubs to mock standard released table/view accesses.
        - TEST CASE ID NAMING CONVENTION (CRITICAL): The test method name in the local test class MUST incorporate or refer to the test case ID (e.g. \`methods tc_01_create_sales_order for testing.\`) so they can be mapped programmatically.
        - Use \`cl_abap_unit_test=>fail( ... )\` or \`cl_aunit_assert=>assert_equals( ... )\` or \`cl_aunit_assert=>assert_initial( ... )\` for assertion checking.
        
        Format the output as a JSON object with:
        - testCases: An array of test case objects (id, name, category, description, preconditions, steps, expectedResult, priority, testData, validationPoints)
        - testSuite: An object with the 'code' representing the complete ABAP Unit local test class code.
        - manualTestingRequirements: An array of objects (area, reason, verificationSteps)
        - coverageEstimate: { percentage: number, explanation: string, missingCoverage: string }.
        `
        : `Given the following context:
        Legacy Code: ${project?.legacyCode}
        Design: ${project?.solutionDesign}
        Generated Node.js Code: ${project?.generatedCode}
        ${previousError ? `\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n${previousError}\nPLEASE FIX THE CODE TO RESOLVE THIS ERROR.` : ''}
        
        Generate:
        1. 10 simple, robust test cases that are guaranteed to run in a restricted Node.js sandbox.
        2. A complete Node.js test suite using 'node:test' and 'node:assert'.
        3. A list of areas that could not be tested in the sandbox (e.g., real API calls, database connections, authentication flows) and must be verified via "human-in-the-loop" testing.
        4. A coverageEstimate object with { percentage: number (0-100), explanation: string, missingCoverage: string }.
        
        CRITICAL GUIDELINES FOR RELIABILITY:
        - The test suite MUST be a valid TypeScript file saved as 'test.ts'.
        - IT MUST BE SIMPLE: Avoid complex mocking, complex async logic, or external dependencies.
        - UNIT TESTS ONLY: Test ONLY service classes and pure functions.
        - ENVIRONMENT: Node.js v22.22.2. Use ESM syntax.
        - TEST CASE ID NAMING CONVENTION (CRITICAL): The test description title in each \`test(...)\` suite block MUST start exactly with the test case ID (e.g. \`test('TC_01: should handle business logic', ...)\` or \`test('TC_02: ...')\`) so that they can be filtered programmatically.
        - IMPORT SOURCE CODE: The application source files are mounted relative to the root directory. If the project contains modular files (e.g. 'srv/service.ts'), you MUST import from its exact path, for example: \`import { ... } from './srv/service'\`. Otherwise, if it is a flat legacy file, import from \`./app\`.
        - IMPORT COMPATIBILITY: 
          import { test } from 'node:test';
          import { strict as assert } from 'node:assert';
          import { mock } from 'node:test';
        
        PHASE 4: ROBUSTNESS & SIMPLICITY
        - Generate tests that are EASY to run in a restricted sandbox.
        - Focus on the CORE business logic transformations.
        - Ensure every test has a clear, single responsibility.
        
        MOCKING STRATEGY:
        - DO NOT use \`mock.module\`.
        - When using \`mock.method(object, 'methodName')\`, you MUST ensure that \`object.methodName\` actually exists and is a function. If it is undefined, you will get a TypeError.
        - If the method doesn't exist on the object yet, assign a dummy function first: \`object.methodName = () => {}; mock.method(object, 'methodName');\`
        - Mock dependencies by creating simple stub objects with the expected methods.
        - NO NETWORK/DB: Tests must be 100% isolated.
        
        Format the output as a JSON object with:
        - testCases: An array of test case objects (id, name, category, description, preconditions, steps, expectedResult, priority, testData, validationPoints)
        - testSuite: An object with the 'code' for 'test.ts'.
        - manualTestingRequirements: An array of objects (area, reason, verificationSteps)
        - coverageEstimate: { percentage: number, explanation: string, missingCoverage: string }.
        `;
      
      const responseText = await callGemini(prompt, 'gemini-3-flash-preview', true);
      
      const result = JSON.parse(responseText || '{}');
      const generatedTestCases: TestCase[] = result.testCases || [];
      const generatedTestSuite: TestSuite = result.testSuite || { code: '' };
      const coverageEstimate: CoverageEstimate = result.coverageEstimate || { percentage: 0, explanation: 'No coverage estimate available', missingCoverage: 'N/A' };
      const manualTestingRequirements: ManualTestRequirement[] = result.manualTestingRequirements || [];
      
      setTestCases(generatedTestCases);
      
      const db = getDb();
      await updateDoc(doc(db, 'projects', projectId), {
        testCases: generatedTestCases,
        testSuite: generatedTestSuite,
        coverageEstimate,
        manualTestingRequirements,
        status: 'testing'
      });
      
      setProject((prev: Project | null) => prev ? { ...prev, testCases: generatedTestCases, testSuite: generatedTestSuite, coverageEstimate, manualTestingRequirements } : prev);
      return { testCases: generatedTestCases, testSuite: generatedTestSuite, coverageEstimate, manualTestingRequirements };
    } catch (err: unknown) {
      console.error(err);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  return { isGenerating, testCases, generateTestCases };
};
