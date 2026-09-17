'use client';

import { useState } from 'react';
import { Cpu, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
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
    <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300 hover:shadow-md">
      <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-slate-500 to-slate-700" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-slate-600/10 p-2.5 rounded-2xl">
            <Cpu className="text-slate-700" size={22} />
          </div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Where the model is used</h2>
        </div>
        {model.known && !model.keyAvailable && (
          <span
            data-no-model-key
            className="text-[10px] md:text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full border border-slate-200"
          >
            No key available
          </span>
        )}
      </div>

      <p className="text-gray-600 font-medium mb-8 text-sm md:text-base leading-relaxed">
        {COUNT_WORDS[stages.length] ?? stages.length} stages send a prompt to Google Gemini. Switch any of them off and that stage says
        &ldquo;not generated&rdquo; instead of asking for a key. The Analyze stage&rsquo;s evidence — the findings, the
        extensibility route and the Clean Core Score — is computed without a model, and the analysis run is signed
        either way.
      </p>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="space-y-3">
        {stages.map((stage) => {
          const on = model.stages[stage];
          return (
            <li
              key={stage}
              data-model-stage={stage}
              data-model-stage-on={on ? 'true' : 'false'}
              className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900">{MODEL_STAGE_LABELS[stage]}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-gray-600">
                  {MODEL_STAGE_DESCRIPTIONS[stage]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(stage)}
                disabled={saving !== null || model.loading}
                aria-pressed={on}
                className={clsx(
                  'shrink-0 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50',
                  on
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
                )}
              >
                {saving === stage ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : saved === stage ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={12} /> {on ? 'On' : 'Off'}
                  </span>
                ) : on ? (
                  'On'
                ) : (
                  'Off'
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
