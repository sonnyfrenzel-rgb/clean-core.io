/**
 * The version of the A–D level rule, derived from the rule itself.
 *
 * `/method/levels` publishes the precedence that turns SAP's two Cloudification
 * Repository files into one clean core level. A reader who is looking at a
 * level somewhere in the product needs to know *which* version of that rule
 * produced it — and a version string that someone types into the page is worth
 * nothing: it is correct on the day it is typed and silently wrong from the
 * first change afterwards. That is the exact failure the census on the page was
 * built to avoid for its counts; the version has the same problem.
 *
 * So the version is measured, not declared. The rule's inputs are a small,
 * closed set — a release state, a classification state, whether SAP named a
 * successor, whether the object is SAP's at all, whether it is the customer's,
 * and how the code uses it (not known, read, written) — so every input the rule
 * can distinguish is enumerated, the answer it gives for each is recorded, and
 * the whole table is hashed. Change one branch of `gradeFromSapStatesForUse`
 * (which includes `gradeFromSapStates`) and the fingerprint moves. Change
 * nothing and it cannot move, whatever anyone writes in the markup.
 *
 * The artifact half of the version lives in `catalog-service.ts`
 * (`getLevelRuleVersion`), because that is where the two generated files are
 * read. This module stays free of them on purpose: the rule's identity must not
 * depend on five megabytes of JSON being importable.
 */
import { createHash } from 'crypto';
import {
  gradeFromSapStatesForUse,
  type CloudReadinessGrade,
  type GradeProvenance,
  type ObjectUse,
  type SapObjectStates,
} from './abcd-classification';

/** The shape of the graded answer the fingerprint reads. */
export type LevelGrader = (states: SapObjectStates, use: ObjectUse | null) => {
  grade: CloudReadinessGrade;
  provenance: GradeProvenance;
};

/** The uses the rule can be asked about; `null` is "only the name is known". */
export const RULE_USES: readonly (ObjectUse | null)[] = [null, 'read', 'write'];

/**
 * The release-file states the rule branches on, verbatim from
 * `gradeFromSapStates`. `null` (absent) is added by the enumeration itself.
 */
export const RULE_RELEASE_STATES = ['released', 'deprecated', 'notToBeReleased'] as const;

/** The classification-file states the rule branches on. */
export const RULE_CLASSIFICATION_STATES = ['classicAPI', 'noAPI'] as const;

export interface LevelRuleDecision {
  releaseState: string | null;
  classificationState: string | null;
  hasSuccessor: boolean;
  isSapObject: boolean;
  isCustomerObject: boolean;
  use: ObjectUse | null;
  grade: CloudReadinessGrade;
  provenance: GradeProvenance;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

/**
 * Every input the rule can tell apart, with the answer it gives.
 *
 * `releaseStates` / `classificationStates` extend the closed set above with
 * whatever SAP actually ships. A state nobody anticipated falls through to the
 * residual branch today; listing it here means the fingerprint notices the day
 * that stops being true.
 *
 * `grade` is injectable so a test can enumerate a deliberately altered rule and
 * watch the fingerprint move. That is the only way to show the fingerprint is
 * reading the rule rather than a constant.
 */
export function enumerateLevelRule(
  options: {
    releaseStates?: readonly string[];
    classificationStates?: readonly string[];
    grade?: LevelGrader;
  } = {},
): LevelRuleDecision[] {
  const grade = options.grade ?? gradeFromSapStatesForUse;
  const releaseStates = dedupe([...RULE_RELEASE_STATES, ...(options.releaseStates ?? [])]);
  const classificationStates = dedupe([
    ...RULE_CLASSIFICATION_STATES,
    ...(options.classificationStates ?? []),
  ]);

  const decisions: LevelRuleDecision[] = [];
  for (const releaseState of [null, ...releaseStates]) {
    for (const classificationState of [null, ...classificationStates]) {
      for (const hasSuccessor of [false, true]) {
        for (const isSapObject of [false, true]) {
          for (const isCustomerObject of [false, true]) {
            for (const use of RULE_USES) {
              const answer = grade(
                {
                  releaseState: releaseState ?? undefined,
                  classificationState: classificationState ?? undefined,
                  hasSuccessor,
                  isSapObject,
                  isCustomerObject,
                },
                use,
              );
              decisions.push({
                releaseState,
                classificationState,
                hasSuccessor,
                isSapObject,
                isCustomerObject,
                use,
                grade: answer.grade,
                provenance: answer.provenance,
              });
            }
          }
        }
      }
    }
  }
  return decisions;
}

/**
 * The rule's fingerprint: twelve hex characters over the decision table.
 *
 * Sorted before hashing, so the fingerprint identifies the mapping and not the
 * order it happened to be produced in. Rearranging the branches without
 * changing an answer is not a new rule and does not get a new version.
 */
export function fingerprintLevelRule(decisions: readonly LevelRuleDecision[]): string {
  const canonical = decisions
    .map((d) =>
      [
        d.releaseState ?? '-',
        d.classificationState ?? '-',
        d.hasSuccessor ? 'successor' : 'no-successor',
        d.isSapObject ? 'sap' : 'non-sap',
        d.isCustomerObject ? 'customer' : 'not-customer',
        d.use ?? 'use-unknown',
        d.grade,
        d.provenance,
      ].join('|'),
    )
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}
