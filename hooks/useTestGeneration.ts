import { useState, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { callGemini } from '@/lib/gemini';
import { useUserProfile } from './useUserProfile';
import type { Project, TestCase, TestSuite, CoverageEstimate, ManualTestRequirement } from '@/lib/types';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import {
  checkTestSuiteShape,
  testSuiteRejectionMessage,
} from '@/app/(app)/project/[projectId]/testing/test-suite-schema';

export const useTestGeneration = (projectId: string, project: Project | null, setProject: React.Dispatch<React.SetStateAction<Project | null>>) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<TestCase[] | null>(null);
  // The saved suite, until this session generates a new one. Seeding useState from `project` read it once, on the
  // first render, while the project was still loading: a saved suite never appeared after a reload, and the page
  // offered to generate it again (QA review of a0c108513165).
  //
  // The stored half also runs through the shape check, and for the same reason
  // the documentation stage does it: the gate below stops a bad suite being
  // written from now on, but a suite an earlier build already stored is still
  // in Firestore, and reading it back would crash the page exactly as before.
  // A rejected stored suite becomes no suite — which is the state the page
  // already knows how to draw, with the "Generate Test Suite" button on it —
  // and `storedSuiteRejected` is what lets the page say so instead of pretending
  // nothing was ever generated.
  //
  // It is all-or-nothing on purpose: the four fields are written in one update
  // and are one answer, so showing three of them beside a refused fourth would
  // be a screen no generation ever produced.
  const storedCheck = useMemo(() => {
    if (!project) return { ok: true, problems: [] };
    if (
      project.testCases === undefined &&
      project.testSuite === undefined &&
      project.coverageEstimate === undefined &&
      project.manualTestingRequirements === undefined
    ) {
      return { ok: true, problems: [] };
    }
    return checkTestSuiteShape({
      testCases: project.testCases,
      testSuite: project.testSuite,
      coverageEstimate: project.coverageEstimate,
      manualTestingRequirements: project.manualTestingRequirements,
    });
  }, [project]);

  /** True only for a suite that is stored and cannot be drawn — not for "nothing generated yet". */
  const storedSuiteRejected = generated === null && !storedCheck.ok;

  const testCases = useMemo(
    () => generated ?? (storedCheck.ok ? project?.testCases ?? [] : []),
    [generated, project?.testCases, storedCheck.ok],
  );
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
      
      const responseText = await callGemini(prompt, PRODUCT_GEMINI_MODEL, true, 'testing');
      
      const result = JSON.parse(responseText || '{}');

      // Parsing is not validation. `JSON.parse` proves the answer was JSON and
      // nothing else, and every `|| []` / `|| {}` fallback below waves a truthy
      // object of the wrong shape straight through — which is how `testCases`
      // came to be an object that `testing/page.tsx` asked for `.map`
      // (roadmap 17.2; the same defect `0cb64a5` fixed in `documentation`).
      // The gate belongs here, before the write, so a refused answer changes
      // nothing: no Firestore update, no `status: 'testing'`, and the suite
      // that was there before is still there.
      const shape = checkTestSuiteShape(result);
      if (!shape.ok) {
        throw new Error(testSuiteRejectionMessage(shape.problems));
      }

      const generatedTestCases: TestCase[] = result.testCases || [];
      const generatedTestSuite: TestSuite = result.testSuite || { code: '' };
      const coverageEstimate: CoverageEstimate = result.coverageEstimate || { percentage: 0, explanation: 'No coverage estimate available', missingCoverage: 'N/A' };
      const manualTestingRequirements: ManualTestRequirement[] = result.manualTestingRequirements || [];
      
      setGenerated(generatedTestCases);
      
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

  return { isGenerating, testCases, generateTestCases, storedSuiteRejected };
};
