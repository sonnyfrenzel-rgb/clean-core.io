'use client';

import CcRadioGroup from '@/components/cc/RadioGroup';
import {
  OWN_CLAUDE_MODEL_NAME,
  PROVIDER_LABEL,
  offeredKeyProviders,
  type ModelKeyProvider,
} from '@/lib/model-providers';

/**
 * Which provider the account's own key belongs to — roadmap 3.0.15, part B.
 *
 * A radio group, not a segmented control (DESIGN.md §1.5): it is a question in
 * the key form, answered before the key is saved, and each option needs a line
 * saying what choosing it means. The list comes from `offeredKeyProviders()`,
 * the same function the save route checks, so the page cannot offer a provider
 * the server refuses.
 */
const OPTION_HELP: Readonly<Record<ModelKeyProvider, string>> = {
  gemini: 'A Google Gemini API key. Every stage runs on the Gemini model the platform uses.',
  anthropic: `An Anthropic API key. Every stage runs on ${OWN_CLAUDE_MODEL_NAME}.`,
};

export interface OwnKeyProviderChoiceProps {
  value: ModelKeyProvider;
  onChange: (provider: ModelKeyProvider) => void;
  disabled?: boolean;
  /** The provider of the key saved now, when there is one. */
  savedProvider?: ModelKeyProvider | null;
}

export default function OwnKeyProviderChoice({ value, onChange, disabled, savedProvider }: OwnKeyProviderChoiceProps) {
  const options = offeredKeyProviders().map((p) => ({
    value: p,
    label: savedProvider === p ? `${PROVIDER_LABEL[p]} (saved)` : PROVIDER_LABEL[p],
    help: OPTION_HELP[p],
  }));
  return (
    <div data-own-key-provider={value}>
      <CcRadioGroup
        legend="Provider of your key"
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        help={
          <>
            One own key per account: saving a key of the other provider replaces the saved one. With your own key, no step
            of this account uses the platform key — if your key is missing or refused, the step stops and says so.
          </>
        }
      />
    </div>
  );
}
