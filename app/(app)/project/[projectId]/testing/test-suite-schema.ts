/**
 * The shape this stage can actually render — checked before anything is stored.
 *
 * Roadmap 17.2, and the same defect `0cb64a5` fixed one stage over.
 * `hooks/useTestGeneration.ts` parsed the model's answer with `JSON.parse` and
 * then read `result.testCases || []`. `{}` is truthy, so an object went through
 * the fallback untouched, was written to Firestore with `status: 'testing'`,
 * and `testing/page.tsx` asked it for `.map`. The crash came back on every
 * reload, and — unlike the documentation stage — this segment had no
 * `error.tsx`, so it reached `app/error.tsx`, which replaces the whole screen
 * including the "Generate Test Suite" button that would have replaced the bad
 * suite. The boundary next to this file is the other half of the fix.
 *
 * What is checked was measured against `page.tsx` rather than taken from
 * `lib/types.ts`, because the types describe what was asked for and the page
 * decides what crashes.
 *
 * The containers the page walks:
 *
 *   - `testCases.map(…)`                          (page.tsx, the case list)
 *   - `testCases.length`, `selectedTestCases`     (the counter and the run button)
 *   - `manualTestingRequirements.length > 0` then `.map(…)`  (the HITL panel)
 *   - `project?.testSuite?.code`, `project?.coverageEstimate?.percentage`
 *
 * And the leaves that are handed to React *raw*, which is where the second
 * crash lives — the one the documentation stage only learned about a commit
 * later, when a node with a valid `id` got through and React was given an
 * object as a child:
 *
 *   - `{req.area}`, `{req.reason}`, `{req.verificationSteps}`   (page.tsx:1834–1837)
 *   - `{project?.coverageEstimate?.explanation}`                (page.tsx:1858)
 *   - `{project?.coverageEstimate?.missingCoverage}`            (page.tsx:1862)
 *   - `{project?.testSuite?.code}`                              (page.tsx:1799)
 *
 * Nothing on a `TestCase` is in that list, and that is not an oversight. Every
 * single test-case field the page shows — `id`, `name`, `category`,
 * `description`, `preconditions`, `steps`, `expectedResult`, `priority`,
 * `testData`, `status`, `message` — goes through the page's own
 * `renderSafeValue`, which turns an object into JSON text. Those values can be
 * ugly on screen; they cannot take the page down, and refusing a whole suite
 * over one of them would throw away suites this stage can display. The same
 * reasoning excuses `coverageEstimate.percentage`: it only ever lands inside a
 * template literal, so the worst it does is print `[object Object]% Coverage`.
 * Numbers are fine everywhere — React renders them.
 *
 * It checks types, not content. Nothing here judges whether the tests are any
 * good — only whether the page can draw what the model wrote.
 */

/** A plain `{…}` — not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const typeName = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
};

/** A value React can put on the screen. */
const isRenderable = (value: unknown): boolean => typeof value === 'string' || typeof value === 'number';

/** Every field this module insists on, in the words the reader sees. */
export type TestSuiteProblem = string;

export interface TestSuiteCheck {
  ok: boolean;
  /** Empty when `ok`. One sentence per field that has the wrong type. */
  problems: TestSuiteProblem[];
}

/**
 * The four fields the testing stage stores, as the hook parses them out of the
 * model's answer and as the page later reads them back off the project.
 */
export interface TestGenerationResult {
  testCases?: unknown;
  testSuite?: unknown;
  coverageEstimate?: unknown;
  manualTestingRequirements?: unknown;
}

/**
 * Does this generated suite have the shape the testing stage renders?
 *
 * Absent fields are allowed wherever the page already guards for absence: the
 * complaint is about a field that is *there* and is not what it is read as.
 */
export function checkTestSuiteShape(parsed: unknown): TestSuiteCheck {
  const problems: TestSuiteProblem[] = [];

  if (!isPlainObject(parsed)) {
    return { ok: false, problems: [`The answer is ${typeName(parsed)}, not a JSON object.`] };
  }

  // `testCases` is the one the page cannot survive: it is walked with `.map`
  // in the case list, and an object there is the crash this module exists for.
  if (parsed.testCases !== undefined) {
    if (!Array.isArray(parsed.testCases)) {
      problems.push(`The test cases (\`testCases\`) are ${typeName(parsed.testCases)}, not a list.`);
    } else {
      parsed.testCases.forEach((tc, i) => {
        // The list reads `tc.id` and `tc.category` off every element. On `null`
        // that is a TypeError before any value is rendered.
        if (!isPlainObject(tc)) {
          problems.push(`Test case ${i + 1} (\`testCases[${i}]\`) is ${typeName(tc)}, not an object.`);
        }
      });
    }
  }

  if (parsed.manualTestingRequirements !== undefined) {
    if (!Array.isArray(parsed.manualTestingRequirements)) {
      problems.push(
        `The manual testing requirements (\`manualTestingRequirements\`) are ${typeName(parsed.manualTestingRequirements)}, not a list.`,
      );
    } else {
      parsed.manualTestingRequirements.forEach((req, i) => {
        if (!isPlainObject(req)) {
          problems.push(`Manual requirement ${i + 1} (\`manualTestingRequirements[${i}]\`) is ${typeName(req)}, not an object.`);
          return;
        }
        // `area` and `reason` are written straight into JSX — no `renderSafeValue`
        // on this panel — so an object here is *Objects are not valid as a React
        // child*, not a wrong-looking string.
        for (const field of ['area', 'reason'] as const) {
          if (req[field] !== undefined && !isRenderable(req[field])) {
            problems.push(`The ${field} of manual requirement ${i + 1} (\`manualTestingRequirements[${i}].${field}\`) is ${typeName(req[field])}, not text.`);
          }
        }
        // `verificationSteps` is rendered as one raw child. React draws an array
        // of strings by concatenating them, so a list is fine — but every
        // element of it is a child in its own right.
        const steps = req.verificationSteps;
        if (steps !== undefined) {
          if (Array.isArray(steps)) {
            steps.forEach((step, k) => {
              if (!isRenderable(step)) {
                problems.push(`Verification step ${k + 1} of manual requirement ${i + 1} (\`manualTestingRequirements[${i}].verificationSteps[${k}]\`) is ${typeName(step)}, not text.`);
              }
            });
          } else if (!isRenderable(steps)) {
            problems.push(`The verification steps of manual requirement ${i + 1} (\`manualTestingRequirements[${i}].verificationSteps\`) are ${typeName(steps)}, not text or a list of text.`);
          }
        }
      });
    }
  }

  if (parsed.coverageEstimate !== undefined) {
    if (!isPlainObject(parsed.coverageEstimate)) {
      problems.push(`The coverage estimate (\`coverageEstimate\`) is ${typeName(parsed.coverageEstimate)}, not an object.`);
    } else {
      // "Logic Analysis" and "Gaps Identified" are raw children. `percentage` is
      // not checked: it only reaches the screen through a template literal.
      for (const field of ['explanation', 'missingCoverage'] as const) {
        const value = parsed.coverageEstimate[field];
        if (value !== undefined && !isRenderable(value)) {
          problems.push(`The ${field === 'explanation' ? 'coverage explanation' : 'missing-coverage note'} (\`coverageEstimate.${field}\`) is ${typeName(value)}, not text.`);
        }
      }
    }
  }

  if (parsed.testSuite !== undefined) {
    if (!isPlainObject(parsed.testSuite)) {
      problems.push(`The test suite (\`testSuite\`) is ${typeName(parsed.testSuite)}, not an object.`);
    } else if (parsed.testSuite.code !== undefined && !isRenderable(parsed.testSuite.code)) {
      // The code pane prints it inside a `<pre>` with an `||` fallback that an
      // object walks straight past.
      problems.push(`The test suite code (\`testSuite.code\`) is ${typeName(parsed.testSuite.code)}, not text.`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * What the reader is told when a freshly generated suite is refused.
 *
 * It says what was wrong and that generating again is the way forward. It does
 * not say why the model answered like that, because nothing here knows: the
 * model is not asked for a reason and does not give one.
 */
export function testSuiteRejectionMessage(problems: TestSuiteProblem[]): string {
  const list = problems.slice(0, 4).join(' ');
  const more = problems.length > 4 ? ` (and ${problems.length - 4} more.)` : '';
  return (
    `The model's answer was not a test suite this stage can display, so nothing was saved. ${list}${more} ` +
    'Why the model answered this way is not recorded. Generate again; the previous suite, if there was one, is untouched.'
  );
}

/** The same refusal, for a suite an earlier build had already stored. */
export const STORED_TEST_SUITE_REJECTED =
  'A test suite is stored for this project, but it does not have the shape this stage can display, so it is not shown. ' +
  'Why it was stored in this form is not recorded. Generating again replaces it.';
