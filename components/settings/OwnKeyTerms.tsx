'use client';

import React from 'react';
import CcCheckbox from '@/components/cc/Checkbox';
import CcRadioGroup from '@/components/cc/RadioGroup';
import CcSwitch from '@/components/cc/Switch';
import CcMessageStrip from '@/components/cc/MessageStrip';
import {
  AUTO_STEPS_SWITCH_LABEL,
  BYOK_ADDENDUM_ACCEPT_TEXT,
  BYOK_ADDENDUM_LANGUAGES,
  BYOK_ADDENDUM_LANGUAGE_LABEL,
  BYOK_ADDENDUM_PATH,
  OWN_KEY_NOTICES,
  autoStepsNotice,
  type ByokAddendumLanguage,
} from '@/lib/byok-addendum';
import { PROVIDER_LABEL, providerSuspendedMessage, type ModelKeyProvider } from '@/lib/model-providers';

/**
 * The parts of the own-key card that the legal texts of 3.0.21 ask for
 * (legal review 22.10.2026, E26/E27; owner decision B6). Presentational: the
 * settings page holds the state and the calls, so a server-free render can
 * read every sentence.
 */

/** C3/C4 — what the reader is told before a key of this provider is stored. */
export function OwnKeyNotices({ provider }: { provider: ModelKeyProvider }) {
  const notices = OWN_KEY_NOTICES[provider];
  return (
    <div data-own-key-notices={provider} className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3">
      {notices.field ? <p className="m-0 cc-text-cell font-medium text-cc-ink">{notices.field}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {notices.points.map((point) => (
          <li key={point.title} className="cc-text-cell text-cc-ink-muted">
            <strong className="font-semibold text-cc-ink">{point.title}:</strong> {point.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * E26 — the acceptance of the Additional Agreement on Own Model Keys, in the
 * language version the reader chooses. The language recorded is the one whose
 * text was ticked, not the interface's.
 */
export function ByokAddendumAcceptance({
  checked,
  language,
  onChange,
  onLanguage,
  disabled,
}: {
  checked: boolean;
  language: ByokAddendumLanguage;
  onChange: (checked: boolean) => void;
  onLanguage: (language: ByokAddendumLanguage) => void;
  disabled?: boolean;
}) {
  const text = BYOK_ADDENDUM_ACCEPT_TEXT[language];
  const shown = language === 'de' ? 'clean-core.io/terms/byok-addendum/de' : 'clean-core.io/terms/byok-addendum';
  const [before, after] = text.split(shown);
  return (
    <div data-byok-addendum={language} className="flex min-w-0 flex-col gap-2">
      <CcRadioGroup
        legend="Language version of the agreement"
        options={BYOK_ADDENDUM_LANGUAGES.map((l) => ({ value: l, label: BYOK_ADDENDUM_LANGUAGE_LABEL[l] }))}
        value={language}
        onChange={(l) => {
          onLanguage(l);
          // A tick belongs to the wording it was given for.
          onChange(false);
        }}
        disabled={disabled}
      />
      <CcCheckbox
        data-byok-addendum-accept=""
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        required
        label={
          <span lang={language}>
            {before}
            <a href={BYOK_ADDENDUM_PATH[language]} target="_blank" rel="noopener noreferrer" className="underline">
              {shown}
            </a>
            {after}
          </span>
        }
      />
    </div>
  );
}

/** C3/C4 "Automatic steps" — the switch per own key, off by default (owner decision B6). */
export function OwnKeyAutoSteps({
  provider,
  checked,
  tested,
  busy,
  onChange,
}: {
  provider: ModelKeyProvider;
  checked: boolean;
  /** Only a key that passed its test may run automatic steps. */
  tested: boolean;
  busy?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div data-own-key-auto-steps={checked ? 'on' : 'off'}>
      <CcSwitch
        label={AUTO_STEPS_SWITCH_LABEL}
        checked={checked}
        onChange={onChange}
        disabled={busy || (!tested && !checked)}
        help={autoStepsNotice(PROVIDER_LABEL[provider])}
        message={tested ? undefined : 'Test your key first: automatic steps can be switched on only for a key that passed its test.'}
      />
    </div>
  );
}

/** The stored key has not passed a test: it does not count as configured. */
export function OwnKeyUntested() {
  return (
    <CcMessageStrip state="warning" headline="The key has not passed a test yet">
      Your key is stored, but it counts as configured only once it passes a test — until then, the free-run limit applies and automatic steps
      stay off. Choose “Test the key”.
    </CcMessageStrip>
  );
}

/** T01 — the operator switched the key's provider off. */
export function OwnKeyProviderSuspended({ provider }: { provider: ModelKeyProvider }) {
  return (
    <CcMessageStrip state="warning" headline={`Calls to ${PROVIDER_LABEL[provider]} are switched off`}>
      {providerSuspendedMessage(provider)}
    </CcMessageStrip>
  );
}
