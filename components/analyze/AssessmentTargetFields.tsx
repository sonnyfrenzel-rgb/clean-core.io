'use client';

import React from 'react';
import CcField, { CC_CONTROL_HEIGHT } from '@/components/cc/Field';
import CcSelect from '@/components/cc/Select';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { cn } from '@/lib/utils';
import { profileCoverage, type AbapLanguageVersion } from '@/lib/assessment-profile';
import { buildAssessmentProfile, normaliseAssessmentTarget, type AssessmentTarget } from '@/lib/assessment-target';

/**
 * The target profile as an input — roadmap 7.10 (CR-02), station 1.
 *
 * Next to the deployment choice, because it is the same kind of fact: not a
 * preference, an input to the verdict. The owner names the release and the
 * ABAP language version of each object the source defines; everything the
 * owner does not name stays open and the run is carried as *unconfirmed* —
 * never quietly assessed as Standard ABAP on some release.
 *
 * The preview underneath is the rule the server applies, run here on the same
 * function (`profileCoverage`), with the catalog snapshot left to the server:
 * it names the catalog, the browser does not.
 */
const LANGUAGE_OPTIONS: { value: AbapLanguageVersion; label: string }[] = [
  { value: 'unknown', label: 'Not established' },
  { value: 'standard', label: 'Standard ABAP' },
  { value: 'cloud', label: 'ABAP for Cloud Development' },
  { value: 'key-user', label: 'ABAP for Key Users' },
];

export interface AssessmentTargetFieldsProps {
  deployment: 'public' | 'private' | null;
  /** Repository objects the staged source defines (`repositoryObjectsOf`). */
  objects: string[];
  value: AssessmentTarget;
  onChange: (next: AssessmentTarget) => void;
}

export default function AssessmentTargetFields({ deployment, objects, value, onChange }: AssessmentTargetFieldsProps) {
  const parsed = normaliseAssessmentTarget(value);
  const languageOf = (object: string): AbapLanguageVersion =>
    value.languageVersions.find((l) => l.object === object)?.languageVersion ?? 'unknown';

  const setLanguage = (object: string, languageVersion: AbapLanguageVersion) => {
    const rest = value.languageVersions.filter((l) => l.object !== object);
    onChange({ ...value, languageVersions: [...rest, { object, languageVersion }] });
  };

  // The preview: the same coverage rule the server applies. The digest is the
  // server's to name, so it stands in as a placeholder that is never empty.
  const preview =
    deployment && parsed.ok
      ? profileCoverage(
          buildAssessmentProfile({
            edition: deployment,
            target: parsed.target,
            objects,
            catalogSnapshot: { registryKey: 'latest', sourceSha256: 'named-by-the-server' },
            ruleVersion: 'rules-v1.0',
          }),
        )
      : null;

  return (
    <div className="space-y-4" data-assessment-target="">
      <div>
        <h3 className="cc-text-h3 text-cc-ink">Target profile</h3>
        <p className="cc-text-cell text-cc-ink-muted mt-1">
          The release and the language version of each object decide whether an object is released for you.
          Whatever you leave open is carried as unconfirmed in the signed run, not assumed.
        </p>
      </div>

      <CcField
        label="Target release"
        help="As SAP names it, for example 2508, 2023 FPS02 or PCE-2025-1."
        valueState={parsed.ok ? undefined : 'error'}
        message={parsed.ok ? undefined : `${parsed.error} Correct it, or leave the release empty.`}
      >
        {(control) => (
          <input
            id={control.id}
            aria-describedby={control.describedBy}
            aria-invalid={control.invalid || undefined}
            className={cn(control.className, CC_CONTROL_HEIGHT.compact)}
            value={value.release}
            maxLength={40}
            onChange={(event) => onChange({ ...value, release: event.target.value })}
            data-assessment-release=""
          />
        )}
      </CcField>

      {objects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {objects.map((object) => (
            <CcSelect<AbapLanguageVersion>
              key={object}
              label={`Language version of ${object}`}
              name={`language-${object}`}
              options={LANGUAGE_OPTIONS}
              value={languageOf(object)}
              onChange={(next) => setLanguage(object, next)}
            />
          ))}
        </div>
      )}

      {preview && preview.state === 'covered' && (
        <CcMessageStrip state="information" headline="This profile can be confirmed.">
          Every fact it names is one the run will read. The server adds the catalog snapshot it looks up.
        </CcMessageStrip>
      )}
      {preview && preview.state !== 'covered' && (
        <CcMessageStrip state="warning" headline="The run will be carried as unconfirmed.">
          <ul className="list-disc pl-4 space-y-1" data-assessment-target-gaps="">
            {preview.gaps.map((g) => (
              <li key={`${g.code}:${g.subject ?? ''}`}>{g.sentence}</li>
            ))}
          </ul>
        </CcMessageStrip>
      )}
    </div>
  );
}
