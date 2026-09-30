'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';
import type { Project } from '@/lib/types';
import { PROFILE_INPUT_ID, profileCoverage, type AbapLanguageVersion } from '@/lib/assessment-profile';
import { profileSummaryLine, recordedProfileOf } from '@/lib/assessment-target';
import { staleness } from '@/lib/workflow-steps';

/**
 * What the signed run was assessed against — roadmap 7.10 (CR-02), station 3.
 *
 * The run carries its target profile inside the signature: edition, release,
 * component levels, the language version of every object, the catalog
 * snapshot (key and digest) and the rule version. This card shows it, and it
 * shows what the result may claim: *covered*, or *unconfirmed* with every
 * reason as a sentence. What the owner has not stated (release, language
 * version) is a quiet note with the way to state it, not "unconfirmed"
 * (decision Sonny, 30.09.2026) — unconfirmed is kept for a catalog that does
 * not answer for this target. There is no third, quieter state — a profile nobody
 * could confirm is never shown as one somebody did.
 *
 * A run signed before 7.10 recorded no profile. The card says exactly that
 * and gives it none.
 */
const LANGUAGE_LABEL: Record<AbapLanguageVersion, string> = {
  standard: 'Standard ABAP',
  cloud: 'ABAP for Cloud Development',
  'key-user': 'ABAP for Key Users',
  unknown: 'not established',
};

export default function AssessmentProfileSummary({ project }: { project: Project }) {
  if (!project.activeRunId) return null;
  const profile = recordedProfileOf(project);

  if (!profile) {
    return (
      <div className="mb-4" data-assessment-profile="not-recorded">
        <CcMessageStrip state="neutral" headline="Target profile not recorded.">
          This run was signed before runs recorded the target profile they were assessed against. Its release,
          the language version of each object and the catalog snapshot are not determined, so its result is
          neither confirmed nor refused for a profile. Running the analysis again records one.
        </CcMessageStrip>
      </div>
    );
  }

  const coverage = profileCoverage(profile);
  const verdictGaps = coverage.gaps.filter((g) => g.severity !== 'notes');
  const notes = coverage.gaps.filter((g) => g.severity === 'notes');
  const moved = staleness(project).unverifiedInputs.some((u) => u.id === PROFILE_INPUT_ID);
  const subject = typeof project.assessmentSubject === 'string' ? project.assessmentSubject.slice(0, 12) : null;

  return (
    <div className="mb-4" data-assessment-profile={coverage.state}>
      <CcCard
        title="Target profile"
        meta={<CcTag>{coverage.state === 'covered' ? 'confirmed' : 'unconfirmed'}</CcTag>}
        density="compact"
      >
        <div className="space-y-3">
          <p className="cc-text-cell text-cc-ink font-cc-mono" data-profile-line="">
            {profileSummaryLine(profile)}
          </p>

          {coverage.state === 'covered' ? (
            <CcMessageStrip state="success" headline="Covered.">
              The catalog snapshot read is the one this target's verdicts come from.
            </CcMessageStrip>
          ) : (
            <CcMessageStrip state="warning" headline="Carried as unconfirmed.">
              <ul className="list-disc pl-4 space-y-1" data-profile-gaps="">
                {verdictGaps.map((g) => (
                  <li key={`${g.code}:${g.subject ?? ''}`} data-profile-gap={g.code}>
                    {g.sentence}
                  </li>
                ))}
              </ul>
            </CcMessageStrip>
          )}

          {notes.length > 0 && (
            <div data-profile-notes="">
              <CcMessageStrip state="neutral">
                <ul className="list-disc pl-4 space-y-1">
                  {notes.map((g) => (
                    <li key={`${g.code}:${g.subject ?? ''}`} data-profile-note={g.code}>
                      {g.sentence}
                    </li>
                  ))}
                </ul>
                <a href="#assessment-target" className="underline text-cc-ink">
                  State it under Target profile, then run the analysis again.
                </a>
              </CcMessageStrip>
            </div>
          )}

          {moved && (
            <CcMessageStrip state="error" headline="The target profile changed after this run.">
              What this project states now is not the profile the run was assessed against. The architecture
              sign-off, the decision and the audit pack wait for a new analysis under the current profile.
            </CcMessageStrip>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 cc-text-cell">
            <div>
              <dt className="text-cc-ink-muted">Components</dt>
              <dd className="text-cc-ink">
                {profile.components.length > 0
                  ? profile.components.map((c) => `${c.component} ${c.level}`).join(' · ')
                  : 'not declared'}
              </dd>
            </div>
            <div>
              <dt className="text-cc-ink-muted">Subject</dt>
              <dd className="text-cc-ink font-cc-mono">{subject ?? 'not recorded'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-cc-ink-muted">Language version per object</dt>
              <dd className="text-cc-ink">
                {profile.languageVersions.length > 0
                  ? profile.languageVersions.map((l) => `${l.object}: ${LANGUAGE_LABEL[l.languageVersion]}`).join(' · ')
                  : 'the source defines no repository object'}
              </dd>
            </div>
          </dl>
        </div>
      </CcCard>
    </div>
  );
}
