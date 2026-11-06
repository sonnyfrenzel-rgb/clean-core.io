'use client';

import React, { useCallback, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import type { ModelAvailability } from '@/hooks/useModelAvailability';
import {
  AUTO_STEPS_NOTICE_SEEN,
  autoStepsNoticeValues,
  autoStepsNoticeWanted,
  autoStepsSwitchBody,
  autoStepsSwitchOn,
} from '@/lib/auto-steps-notice';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSwitch from '@/components/cc/Switch';
import CcButton from '@/components/cc/Button';

/**
 * C14 — the one-time notice before the first automatic model call (3.0.21,
 * A10). The rule for when it shows and what it writes is
 * `lib/auto-steps-notice.ts`; the words are `CONSENT_TEXTS.autoStepsNotice`.
 *
 * Lives on the own-code upload only (`components/workspace/OwnCodeImport.tsx`),
 * above the source and so before the first own project exists: never on a
 * shared project, so an invited reader never meets it. A message strip in the
 * page, not a dialog — nothing is covered, and the upload stays usable while
 * it is there.
 *
 * The switch writes the account's main switch "Automatic AI steps" at once (a switch acts
 * when flipped, `components/cc/Switch.tsx`) and records the notice as
 * answered; "Got it" keeps the default and records it too. Either way it does
 * not come back for the account. After the switch was used the strip stays
 * until "Got it", so the reader sees what the switch now says.
 */
export default function AutoStepsNotice({ model, reader = false }: { model: ModelAvailability; reader?: boolean }) {
  const [pinned, setPinned] = useState(false);
  const [closed, setClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const post = useCallback(async (body: Record<string, unknown>) => {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Not signed in.');
    const res = await fetch('/api/model-stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
    const answer = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(answer.error || 'The setting could not be saved.');
  }, []);

  const flip = useCallback(
    async (on: boolean) => {
      setPinned(true);
      setSaving(true);
      setError('');
      try {
        await post(autoStepsSwitchBody(on));
        await model.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The setting could not be saved.');
      } finally {
        setSaving(false);
      }
    },
    [model, post],
  );

  const dismiss = useCallback(async () => {
    setClosed(true);
    try {
      await post({ autoStepsNotice: AUTO_STEPS_NOTICE_SEEN });
    } catch (err) {
      // Closed for this page either way; unrecorded, it shows once more next time.
      console.error('[AutoStepsNotice] not recorded', err);
    }
  }, [post]);

  const wanted = autoStepsNoticeWanted({
    known: model.known,
    keyAvailable: model.keyAvailable,
    autoSteps: model.autoSteps,
    stages: model.stages,
    seen: model.autoStepsNoticeSeen,
    reader,
  });
  if (closed || reader || !(pinned || wanted)) return null;

  const t = CONSENT_TEXTS.autoStepsNotice;
  const { model: modelLabel, company } = autoStepsNoticeValues(model.provider);
  const on = autoStepsSwitchOn(model);
  // C14's sentence about the two tools that started on opening: since 06.11.2026 they start
  // only on a click, and the parallel text change removes it. Shown only while the text has it.
  const toolsOnOpen = (t as { toolsOnOpen?: Parameters<typeof consentText>[0] }).toolsOnOpen;

  return (
    <section data-auto-steps-notice={on ? 'on' : 'off'} aria-label={consentText(t.title, 'en')}>
      <CcMessageStrip
        state="information"
        headline={consentText(t.title, 'en')}
        actions={
          <CcButton density="cozy" onClick={() => void dismiss()} disabled={saving} data-auto-steps-notice-dismiss="">
            {consentText(t.dismiss, 'en')}
          </CcButton>
        }
      >
        <p className="m-0" data-auto-steps-notice-lead="">
          {consentText(t.lead, 'en').replace('{Modell}', modelLabel).replace('{Anbieter}', company)}
        </p>
        <div className="my-2">
          <CcSwitch
            label={consentText(t.switchLabel, 'en')}
            checked={on}
            onChange={(next) => void flip(next)}
            disabled={saving}
            valueState={error ? 'error' : undefined}
            message={error || undefined}
            data-auto-steps-notice-switch=""
          />
        </div>
        {!on ? (
          <p className="m-0 font-semibold" role="status" data-auto-steps-notice-off="">
            {consentText(t.switchedOff, 'en')}
          </p>
        ) : null}
        {toolsOnOpen ? (
          <p className="m-0" data-auto-steps-notice-tools="">
            {consentText(toolsOnOpen, 'en')}
          </p>
        ) : null}
        <p className="m-0 text-cc-ink-muted" data-auto-steps-notice-after="">
          {consentText(t.after, 'en')}
        </p>
      </CcMessageStrip>
    </section>
  );
}
