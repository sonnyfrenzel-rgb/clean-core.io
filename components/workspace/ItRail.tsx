'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcDisclosure from '@/components/cc/Disclosure';
import CcLinkButton from '@/components/cc/LinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcStateText from '@/components/cc/StateText';
import { getAuth } from '@/lib/firebase';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { itAtcComparison, wt } from '@/lib/workspace-messages';
import { routesNamed, type CatalogProfile } from '@/lib/it-view';
import type { ItFindingsSource } from '@/lib/it-findings';
import { contractForDisplay, type ArchitectureContract } from '@/lib/architecture-contract';
import type { GenerationDecision } from '@/lib/generation-direction';
import type { Project } from '@/lib/types';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { joinAtcWithEvidence, summarizeAtcComparison } from '@/lib/abap/atc-join';

/**
 * The IT view's side column — mockup v2.8 `s4`'s `aside`: what the findings are
 * measured against and where they go.
 *
 *   1. **Target profile** — the edition and release the project declares, and
 *      the SAP catalog snapshot the findings route says it read (roadmap 7.10).
 *   2. **The route** — the architecture contract as the server derives it
 *      (`GET /api/projects/{id}/contract`, roadmap 8.2/8.3): its status, the
 *      recommendation, the seven fields and the four alternatives one level
 *      deeper; and beside it the routes the deterministic router named on the
 *      findings. Nothing is decided here — the decision card binds the contract.
 *   3. **Imports** — the usage and ATC imports on record, inside the profile's
 *      card since 03.10.2026 (§2.11: at most two side cards); without either, one
 *      sentence that says usage is *not determined* until one exists, never
 *      "unused" — no empty-state box. The routes the router named are drawn
 *      only where there are findings to name them on.
 *
 * Read-only. The contract route is a GET that writes nothing; the imports are
 * read off the project the page already holds.
 */
export default function ItRail({
  projectId,
  project,
  source,
  profile,
  demo,
}: {
  projectId: string;
  project: Project | null;
  source: ItFindingsSource | null;
  profile: CatalogProfile;
  /** The demo workspace: no project behind it a route could read, and no stage to send a reader to. */
  demo: boolean;
}) {
  const routes = useMemo(() => routesNamed(source?.rows ?? []), [source]);
  /**
   * The ATC import compared with the engine per object — `lib/abap/atc-join.ts`,
   * the comparison the Analyze stage shows, never a merge. The join reads only
   * `id` and `objectName` of an engine finding, which the rows carry.
   */
  const atc = useMemo(() => {
    if (!project?.atcReport || !source) return null;
    const engine = source.rows.map((r) => ({ id: r.id, objectName: r.objectName ?? undefined })) as unknown as EvidenceFinding[];
    return summarizeAtcComparison(joinAtcWithEvidence(project.atcReport, { findings: engine }));
  }, [project, source]);
  const contract = useContract(projectId, !demo);
  const toAnalyze = stageHref({ base: `/project/${projectId}`, path: 'analyze', view: 'it', from: WORKSPACE_RETURN.tools });

  return (
    <aside data-it-rail="" aria-label={wt('it.railLabel')} className="flex min-w-0 flex-col gap-4">
      {/* 1. Target profile */}
      <CcCard title={wt('it.profileTitle')}>
        <dl data-it-profile="" className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.profileEdition')}</dt>
          <dd className="m-0 text-[13px] font-semibold text-cc-ink">
            {profile.edition}
            {profile.editionDeclared ? null : (
              <span className="block text-[12px] font-medium text-cc-ink-muted">{wt('it.profileEditionDefault')}</span>
            )}
          </dd>
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.profileRelease')}</dt>
          <dd className="m-0 text-[13px] font-semibold text-cc-ink">
            {profile.release ?? <span className="font-medium text-cc-ink-muted">{wt('it.notDeclared')}</span>}
          </dd>
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.profileCatalog')}</dt>
          <dd data-it-profile-catalog="" className="m-0 text-[13px] font-medium text-cc-ink">
            {profile.catalog ?? <span className="text-cc-ink-muted">{wt('it.notRecorded')}</span>}
            {profile.catalogKey ? (
              <span className="mt-1 block font-mono text-[11px] text-cc-ink-muted">{profile.catalogKey}</span>
            ) : null}
          </dd>
        </dl>
        <p className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('it.profileNote')}</p>
        {/* Imports — what the findings can be compared with. In the profile's
            card rather than a third one (§2.11: at most two side cards), and
            one sentence when there are none, not an empty-state box. */}
        <div data-it-imports="" className="mt-4 border-t border-cc-line pt-3">
          <h4 className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.importsTitle')}</h4>
          {!project?.atcReport && !project?.usageReport ? (
            <div className="mt-1">
              <p data-it-import="none" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {wt('itv.importsNoneSummary')}
              </p>
              <p data-it-import="usage-none" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {wt('it.usageNoneBody')}
              </p>
              {demo ? null : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <CcLinkButton href={toAnalyze} data-it-import-atc="">
                    {wt('it.atcImport')}
                  </CcLinkButton>
                  <CcLinkButton href={toAnalyze} data-it-import-usage="">
                    {wt('it.usageImport')}
                  </CcLinkButton>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-1 flex flex-col gap-3">
              {project?.atcReport ? (
                <div data-it-import="atc">
                  <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('it.atcTitle')}</p>
                  <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {project.atcReport.findings.length}{' '}
                    {project.atcReport.findings.length === 1 ? wt('it.finding') : wt('it.findings')} ·{' '}
                    {wt('it.importedOn')} {isoDay(project.atcReport.importedAt)}
                  </p>
                  {atc ? (
                    <p data-it-atc-compare="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                      {itAtcComparison(atc.both, atc.atcOnly, atc.engineOnly)}
                    </p>
                  ) : null}
                  <div className="mt-1">
                    <CcProvenanceChip value="imported" />
                  </div>
                </div>
              ) : (
                <div data-it-import="atc-none" className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-cc-ink-muted">{wt('it.atcNone')}</span>
                  {demo ? null : (
                    <CcLinkButton href={toAnalyze} data-it-import-atc="">
                      {wt('it.atcImport')}
                    </CcLinkButton>
                  )}
                </div>
              )}

              {project?.usageReport ? (
                <div data-it-import="usage">
                  <p className="m-0 text-[13px] font-semibold text-cc-ink">
                    {wt('it.usageTitle')} · {project.usageReport.source.toUpperCase()}
                  </p>
                  <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {project.usageReport.records.length} {wt('it.usageRecords')}
                    {project.usageReport.observedFrom && project.usageReport.observedTo
                      ? ` · ${wt('it.usageSeen')} ${isoDay(project.usageReport.observedFrom)} ${wt('it.to')} ${isoDay(project.usageReport.observedTo)}`
                      : ''}
                  </p>
                  <div className="mt-1">
                    <CcProvenanceChip value="imported" />
                  </div>
                </div>
              ) : (
                <p data-it-import="usage-none" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {wt('it.usageNoneBody')}
                </p>
              )}
            </div>
          )}
        </div>
      </CcCard>

      {/* 2. The route — architecture contract and the router's routes */}
      <CcCard
        title={
          contract.state === 'ready' && contract.value.contract
            ? `${wt('it.contractTitle')} ${contract.value.contract.contractId}`
            : wt('it.routeTitle')
        }
        meta={
          contract.state === 'ready' && contract.value.contract ? (
            <ContractStatus status={contract.value.contract.status} />
          ) : null
        }
      >
        <div data-it-route="">
          {demo ? (
            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('it.contractDemo')}</p>
          ) : contract.state === 'loading' ? (
            <CcSkeleton shape="text" count={3} label={wt('it.routeTitle')} />
          ) : contract.state === 'absent' ? (
            <p data-it-contract-absent="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
              <span className="font-semibold text-cc-ink">{wt('it.notDetermined')}: </span>
              {contract.reason}
            </p>
          ) : contract.value.contract ? (
            <ContractBody contract={contract.value.contract} decision={contract.value.decision} projectId={projectId} />
          ) : (
            <p data-it-contract-absent="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
              <span className="font-semibold text-cc-ink">{wt('it.notDetermined')}: </span>
              {contract.value.decision.ok ? '' : contract.value.decision.sentence}
            </p>
          )}

          {/* The routes the router named on the findings — nothing to count
              where there are none, so nothing is drawn. */}
          {(source?.rows.length ?? 0) > 0 ? (
            <div className="mt-3 border-t border-cc-line pt-3">
              <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                {wt('it.routesNamed')}
              </p>
              {routes.length > 0 ? (
                <ul data-it-routes="" className="m-0 mt-1 list-none p-0">
                  {routes.map((r) => (
                    <li key={r.route} className="flex items-baseline justify-between gap-3 py-1 text-[12px] font-medium text-cc-ink">
                      <span className="min-w-0">{r.route}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {r.count} {r.count === 1 ? wt('it.place') : wt('it.places')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('it.routesNone')}</p>
              )}
              <div className="mt-1">
                <CcProvenanceChip value={routes.length > 0 ? 'reconstructed' : 'not-determined'} />
              </div>
            </div>
          ) : null}
        </div>
      </CcCard>

    </aside>
  );
}

type ContractRead =
  | { state: 'loading' }
  | { state: 'absent'; reason: string }
  | { state: 'ready'; value: { contract: ArchitectureContract | null; decision: GenerationDecision } };

/**
 * The contract of the project, as the server derives it. A failed or refused
 * read is *not determined* with the route's own sentence — never a contract
 * guessed from the router's recommendation.
 */
function useContract(projectId: string, enabled: boolean): ContractRead {
  const [read, setRead] = useState<{ projectId: string; value: ContractRead } | null>(null);
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    const done = (value: ContractRead) => {
      if (!cancelled) setRead({ projectId, value });
    };
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return done({ state: 'absent', reason: wt('it.contractUnread') });
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contract`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as
          | { error?: string; contract?: ArchitectureContract | null; decision?: GenerationDecision }
          | null;
        if (!res.ok || !body || !body.decision) {
          return done({ state: 'absent', reason: body?.error || wt('it.contractUnread') });
        }
        done({ state: 'ready', value: { contract: body.contract ? contractForDisplay(body.contract) : null, decision: body.decision } });
      } catch {
        done({ state: 'absent', reason: wt('it.contractUnread') });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);
  if (!enabled) return { state: 'loading' };
  return read && read.projectId === projectId ? read.value : { state: 'loading' };
}

function ContractStatus({ status }: { status: ArchitectureContract['status'] }) {
  return status === 'confirmed' ? (
    <CcStateText state="information">{wt('it.contractConfirmed')}</CcStateText>
  ) : status === 'superseded' ? (
    <CcStateText state="neutral" hollow>
      {wt('it.contractSuperseded')}
    </CcStateText>
  ) : (
    <CcStateText state="warning">{wt('it.contractDraft')}</CcStateText>
  );
}

function ContractBody({
  contract,
  decision,
  projectId,
}: {
  contract: ArchitectureContract;
  decision: GenerationDecision;
  projectId: string;
}) {
  const recommended = contract.alternatives.find((a) => a.id === contract.route.recommended);
  const chosen = contract.alternatives.find((a) => a.id === contract.route.chosen);
  return (
    <div data-it-contract={contract.contractId}>
      <p className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">{contract.summary}</p>
      <dl className="m-0 mt-2 grid gap-1">
        <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.recommended')}</dt>
        <dd className="m-0 text-[12px] font-medium text-cc-ink">{recommended?.label ?? contract.route.recommended}</dd>
        {contract.route.deviation ? (
          <>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('it.chosenInstead')}</dt>
            <dd className="m-0 text-[12px] font-medium text-cc-ink">
              {chosen?.label ?? contract.route.chosen} — {contract.route.deviation.reason}
            </dd>
          </>
        ) : null}
      </dl>
      <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {decision.ok ? decision.sentence : decision.sentence}
      </p>
      <div className="mt-2 flex flex-col gap-1">
        <CcDisclosure title={wt('it.contractFields')} count={contract.fields.length}>
          <dl data-it-contract-fields="" className="m-0 grid gap-2">
            {contract.fields.map((f) => (
              <div key={f.key}>
                <dt className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-cc-ink">
                  {f.label} <CcProvenanceChip value={f.provenance} />
                </dt>
                <dd className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {f.statement ?? f.notDeterminedReason}
                </dd>
              </div>
            ))}
          </dl>
        </CcDisclosure>
        <CcDisclosure title={wt('it.contractAlternatives')} count={contract.alternatives.length}>
          <ul className="m-0 grid list-none gap-2 p-0">
            {contract.alternatives.map((a) => (
              <li key={a.id}>
                <span className="text-[12px] font-semibold text-cc-ink">{a.label}</span>{' '}
                <span className="text-[12px] font-medium text-cc-ink-muted">· {VERDICT_WORDS[a.verdict]}</span>
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{a.reason}</p>
              </li>
            ))}
          </ul>
        </CcDisclosure>
      </div>
      <div className="mt-3">
        <CcLinkButton
          href={`/project/${encodeURIComponent(projectId)}?view=management#decision-card`}
          variant="secondary"
          data-it-review-contract=""
        >
          {wt('it.reviewInDecision')}
        </CcLinkButton>
      </div>
    </div>
  );
}

const VERDICT_WORDS: Record<ArchitectureContract['alternatives'][number]['verdict'], string> = {
  chosen: wt('it.verdictChosen'),
  rejected: wt('it.verdictRejected'),
  'not-determined': wt('it.verdictOpen'),
};

/** `2026-09-04` from an ISO timestamp — the machine form §3 asks for in metadata. */
function isoDay(value: string): string {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : value;
}
