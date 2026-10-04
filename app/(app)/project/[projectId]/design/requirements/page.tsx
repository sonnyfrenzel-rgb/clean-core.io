'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { isProjectOwner } from '@/lib/project-readers';
import { sha256Hex } from '@/lib/artefact-digest';
import { workflowSteps } from '@/lib/workflow-steps';
import { BTP, isSideBySideRoute } from '@/lib/sap-naming';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useDesignEvidence } from '@/hooks/useDesignEvidence';
import { useProcessStates } from '@/hooks/useProcessStates';
import { useSignedInUid } from '@/components/workspace/BusinessRulesEditor';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcSkeleton from '@/components/cc/Skeleton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import FunctionalRequirements from '@/components/design/FunctionalRequirements';
import NonFunctionalRequirements from '@/components/design/NonFunctionalRequirements';
import RequirementsWorkspace from '@/components/requirements/RequirementsWorkspace';
import type { Project } from '@/lib/types';
import type { NFRData } from '@/lib/non-functional-requirements';
import type { RuleStateInput } from '@/lib/requirements-spec';

/**
 * The requirements workspace of the Design tool — its own page under Design
 * (ADR-078), so it has an address that survives a reload and can be sent to an
 * invited reader, and a way back to Design above the title.
 *
 * The page gathers what the workspace reads: the source the active run signed
 * (and nothing else — a line anchor never points into a source the run did
 * not see), the clean core levels of the objects, the answers of the process
 * review for the business rules, and the design model's proposals for the
 * non-functional targets. The workspace does the rest.
 */
export default function RequirementsPage() {
  const { projectId } = useParams();
  const id = projectId as string;
  useUserProfile();
  const modelAvailability = useModelAvailability();
  const [project, setProject] = useState<Project | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Who is signed in — read in the browser only; the server render has no account. */
  const [account, setAccount] = useState<{ uid: string | null; email: string | null }>({ uid: null, email: null });

  useEffect(() => {
    (async () => {
      try {
        const data = await loadProjectAndHydrate(id);
        if (!enforceActiveRun(data, id)) return;
        const user = getAuth().currentUser;
        setAccount({ uid: user?.uid ?? null, email: user?.email ?? null });
        setProject(data);
      } catch (err) {
        console.error('[Requirements] Project could not be loaded:', err);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // The uid from the auth store, so a sign-in change after loading is followed (QA 9ac48179a33c).
  const signedInUid = useSignedInUid();
  const owner = isProjectOwner(project, signedInUid);
  const designEvidence = useDesignEvidence(id, Boolean(project), 0);
  const { outcome } = useProcessStates(id, Boolean(project));

  const signedSource = useMemo(() => {
    const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
    if (!project?.activeRunId || !source.trim()) return null;
    const signed = (project as { inputFingerprint?: { sha256?: string; fileName?: string } }).inputFingerprint ?? project.auditMetadata?.inputFingerprint;
    if (!signed?.sha256 || sha256Hex(source) !== signed.sha256) return null;
    return { source, fileName: signed.fileName || 'source.abap' };
  }, [project]);

  const missingReason = !project?.activeRunId
    ? 'The requirements are read from the source of a signed analysis run. Run the analysis in Analyze first.'
    : !project?.legacyCode
      ? 'This project has no source to read requirements from.'
      : 'The source changed after the signed run. Re-run the analysis in Analyze; the requirements are read only from the source the run signed.';

  const ruleStates = useMemo<RuleStateInput[] | null>(() => {
    if (!outcome || !outcome.ok) return null;
    const labels = new Map(outcome.view.subjects.filter((s) => s.kind === 'rule').map((s) => [s.subject, s.label]));
    return outcome.view.entries
      .filter((e) => e.kind === 'rule')
      .map((e) => ({ subject: e.subject, state: e.state, note: e.note, by: e.account.name, at: e.confirmedAt, label: labels.get(e.subject) ?? null }));
  }, [outcome]);

  const route = project?.extensibilityRoute
    ? isSideBySideRoute(project.extensibilityRoute)
      ? `a side-by-side extension on ${BTP} (CAP)`
      : 'an on-stack extension in SAP S/4HANA with ABAP Cloud (RAP)'
    : null;
  const levels = designEvidence.state === 'ready' ? designEvidence.findings : null;
  const proposals = (project as { nonFunctionalRequirements?: NFRData | null } | null)?.nonFunctionalRequirements ?? null;
  const designAvailable = modelAvailability.enabled('design');
  const phases = workflowSteps(project);

  const back = (
    <nav aria-label="Breadcrumb" className="cc-no-print">
      <Link href={`/project/${encodeURIComponent(id)}/design`} data-spec-back-design="" className="inline-flex items-center gap-1 text-[13px] font-semibold text-cc-information underline-offset-2 hover:underline">
        <ChevronLeft size={16} aria-hidden={true} /> Design
      </Link>
      <span className="text-[13px] font-semibold text-cc-ink-muted"> › Requirements specification</span>
    </nav>
  );

  return (
    <StageFrame stage="design" className="min-h-screen pb-24" data-spec-page="">
      <StageHeader stage="design" title="Requirements specification" tools={{ steps: phases, current: 'design' }} projectName={project?.name} eyebrow={back}>
        The functional and non-functional requirements of the new solution, as one document an external implementer can build from.
      </StageHeader>
      {loading ? (
        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-8">
          <CcSkeleton shape="text" label="the requirements specification" count={6} />
        </div>
      ) : failed || !project ? (
        <CcMessageStrip state="error" headline="The project could not be loaded.">
          This is usually a permissions or connectivity issue — reload the page.
        </CcMessageStrip>
      ) : (
        <RequirementsWorkspace
          mode={owner ? 'owner' : 'reader'}
          projectId={id}
          projectName={project.name || ''}
          fileName={signedSource?.fileName || 'source.abap'}
          source={signedSource?.source ?? null}
          missingReason={signedSource ? null : missingReason}
          levels={levels}
          ruleStates={ruleStates}
          proposals={proposals}
          route={route}
          accountEmail={account.email}
          engineReading={
            <>
              <FunctionalRequirements
                projectId={id}
                projectName={project.name || ''}
                fileName={signedSource?.fileName || 'source.abap'}
                source={signedSource?.source ?? null}
                missingReason={signedSource ? null : missingReason}
                levels={levels}
                wording={{
                  enabled: designAvailable,
                  reason: designAvailable
                    ? null
                    : modelAvailability.keyAvailable
                      ? 'the Design stage is switched off in Settings.'
                      : 'no Gemini key is available for this account; add your own in Settings.',
                }}
              />
              <NonFunctionalRequirements
                projectId={id}
                projectName={project.name || ''}
                fileName={signedSource?.fileName || 'source.abap'}
                source={signedSource?.source ?? null}
                missingReason={signedSource ? null : missingReason}
                proposals={proposals}
                levels={levels}
              />
            </>
          }
        />
      )}
    </StageFrame>
  );
}
