'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import CcSwitch from '@/components/cc/Switch';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';
import { getAuth } from '@/lib/firebase';
import {
  MODEL_STAGE_LABELS,
  MODEL_STAGE_DESCRIPTIONS,
  offeredModelStages,
  type ModelStage,
} from '@/lib/model-stages';
import { useModelAvailability } from '@/hooks/useModelAvailability';

/** Spelled out, because the sentence starts with it. */
const COUNT_WORDS: Record<number, string> = { 5: 'Five', 6: 'Six', 7: 'Seven' };

/**
 * The model stages, switchable one at a time — roadmap 1.2.
 *
 * All five were previously one decision: either a key existed and every stage
 * called the model, or none did and the workflow stopped at the first one. An
 * account that wants the evidence but not the prose, or the design but not the
 * generated code, had no way to say so; and a key-less account was told nothing
 * about which of the two facts — no key, or a switch — was in its way.
 *
 * The switch is written by the server (`POST /api/model-stages`) because
 * `firestore.rules` allows a client to write only the fields in
 * `userClientUpdateKeys()`, and `modelStages` is deliberately not one of them.
 * That is also why no rules deploy was needed to add it.
 *
 * Turning a stage off never affects the Analyze stage's evidence: findings, the
 * extensibility route and the Clean Core Score are computed by the deterministic
 * engine and the run is signed either way.
 *
 * `showPreviewStages` adds the stages of the new workspace (roadmap 2.4's
 * business names). The settings page passes it only for an account whose
 * workspace preview is on; everybody else sees the five rows they saw before.
 */
export default function ModelStagesCard({ showPreviewStages = false }: { showPreviewStages?: boolean }) {
  const model = useModelAvailability();
  const stages = offeredModelStages(showPreviewStages);
  const [saving, setSaving] = useState<ModelStage | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ModelStage | null>(null);

  const toggle = async (stage: ModelStage) => {
    setError('');
    setSaved(null);
    setSaving(stage);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Sign in again to change this setting.');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/model-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ stages: { [stage]: !model.stages[stage] } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The setting could not be saved.');
      await model.refresh();
      setSaved(stage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div data-model-stages-card className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      {/* The head of every settings card (`CardHead` on /settings): a quiet
          mark, the title, and what belongs beside it. The mark used to be a
          chip — §3.1 keeps model work out of the iconography — so it is the
          sliders a setting is. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden={true}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface-muted text-cc-ink-muted"
          >
            <SlidersHorizontal size={20} />
          </span>
          <h2 className="m-0 cc-text-h2 text-cc-ink">Where the model is used</h2>
        </div>
        {model.known && !model.keyAvailable && (
          <span data-no-model-key>
            <CcTag>No key available</CcTag>
          </span>
        )}
      </div>

      <p className="mb-6 cc-text-body text-cc-ink-muted">
        {COUNT_WORDS[stages.length] ?? stages.length} stages send a prompt to Google Gemini. Switch any of them off and that stage says
        &ldquo;not generated&rdquo; instead of asking for a key. The Analyze stage&rsquo;s evidence — the findings, the
        extensibility route and the Clean Core Score — is computed without a model, and the analysis run is signed
        either way.
      </p>

      {error && (
        <div className="mb-6">
          <CcMessageStrip state="error" headline="The setting was not saved." announce>
            {error}
          </CcMessageStrip>
        </div>
      )}

      {/* A switch, not a checkbox: each one is saved the moment it is flipped
          (`POST /api/model-stages`), which is the switch contract of §2.7. */}
      <ul className="space-y-3">
        {stages.map((stage) => {
          const on = model.stages[stage];
          return (
            <li
              key={stage}
              data-model-stage={stage}
              data-model-stage-on={on ? 'true' : 'false'}
              className="rounded-cc-row border border-cc-line px-4 py-3"
            >
              <CcSwitch
                label={MODEL_STAGE_LABELS[stage]}
                help={MODEL_STAGE_DESCRIPTIONS[stage]}
                checked={on}
                onChange={() => toggle(stage)}
                disabled={saving !== null || model.loading}
                valueState={saving === stage ? 'information' : saved === stage ? 'success' : undefined}
                message={saving === stage ? 'Saving…' : saved === stage ? `Saved — ${on ? 'on' : 'off'}` : undefined}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
