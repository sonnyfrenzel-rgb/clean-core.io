'use client';

import { useMemo } from 'react';
import { abapTestSentencesOfProject } from '@/lib/testing-abap-unit';
import { isAbapUnitRoute } from '@/lib/test-runnability';

type EvidenceProject = Parameters<typeof abapTestSentencesOfProject>[0] & { extensibilityRoute?: string | null };

/**
 * The ABAP Unit evidence of the Testing tool's run step (3.0.13 (6)): on the ABAP route only, the sentences
 * `abapTestSentencesOfProject` reads for the project — "passed in SAP" from the SAP result on record when it is
 * current for this package (3.0.18 item 13). A component of its own so the rendered sentence is tested, not only
 * the page source (QA review of 62eae6a082bb).
 */
export default function AbapUnitEvidence({ project }: { project: EvidenceProject | null | undefined }) {
  const sentences = useMemo(() => (isAbapUnitRoute(project) ? abapTestSentencesOfProject(project) : null), [project]);
  if (!sentences || sentences.length === 0) return null;
  return (
    <p data-test-evidence-abap-unit="" className="m-0 mt-3 cc-text-cell text-cc-ink">
      {sentences.join(' ')}
    </p>
  );
}
