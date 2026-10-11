'use client';

import type { Project } from '@/lib/types';
import { ARCHITECTURE_OPTION } from '@/lib/decision-draft';
import { isTargetArchitecture, recommendedArchitecture, type TargetArchitectureCode } from '@/lib/project-commands';
import { sapNamesForDisplay } from '@/lib/sap-naming';
import { SAP_REFERENCE_ARCHITECTURES, raUrl, referencePatternLine } from '@/lib/sap-reference-architectures';
import { wt } from '@/lib/workspace-messages';

/**
 * The target and whether SAP documents a pattern for it, in one line
 * (roadmap 3.0.9, ADR-089): "SAP-documented pattern for this target: yes ·
 * partly · none". The Business view's line, under its next step; the
 * Management view says the same beside the decision's answer
 * (`DecisionOptionsView.reference`). Nothing when no target is known.
 */
export function targetOfProject(
  project: Pick<Project, 'approvedByArchitect' | 'targetArchitecture' | 'originalRecommendation' | 'extensibilityRoute'> | null,
): { code: TargetArchitectureCode; basis: 'signed-off' | 'recommended' } | null {
  if (!project) return null;
  if (project.approvedByArchitect === true && isTargetArchitecture(project.targetArchitecture)) {
    return { code: project.targetArchitecture, basis: 'signed-off' };
  }
  const recommended = recommendedArchitecture(project);
  return recommended ? { code: recommended, basis: 'recommended' } : null;
}

export default function TargetReferenceLine({ project }: { project: Project | null }) {
  const target = targetOfProject(project);
  if (!target) return null;
  const line = referencePatternLine(target.code);
  const label = sapNamesForDisplay(ARCHITECTURE_OPTION[target.code]?.label ?? target.code);
  return (
    <p
      data-target-reference={line.answer}
      data-target-reference-code={target.code}
      className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink-muted"
    >
      {wt('decide.refTarget')}: <span className="font-semibold text-cc-ink">{label}</span> (
      {wt(target.basis === 'signed-off' ? 'decide.refSignedOff' : 'decide.refRecommended')}) · {line.text}
      {line.ras.map((id) => (
        <span key={id}>
          {' '}
          <a
            href={raUrl(id)}
            target="_blank"
            rel="noopener noreferrer"
            title={SAP_REFERENCE_ARCHITECTURES[id].title}
            className="font-semibold text-cc-ink underline underline-offset-2"
          >
            {id}
          </a>
        </span>
      ))}
    </p>
  );
}
