/**
 * Which model provider an account's own key belongs to — and what a reader is
 * told about the provider, the model and the key that answered.
 *
 * Roadmap 3.0.15, "Data sovereignty over the model", part B: Claude as a BYOK
 * provider beside Gemini. One own key per account, of one provider. The
 * platform's own key (the community key) stays Gemini; part A — moving the
 * platform's calls to Claude — is not built here and needs the quality
 * comparison the roadmap names first. The seam for it is `PLATFORM_PROVIDER`
 * below: the proxy reads it and nothing else decides the platform's provider.
 *
 * **Read bridge, no migration.** Keys stored before 3.0.15 carry no `provider`
 * on their record and the profile carries no `byokProvider`: both read as
 * `gemini`, which is what every one of them is. Nothing in production is
 * rewritten.
 *
 * Pure: no imports, so the settings screen, the proxy and the specs share it.
 */

/** The providers an own key can belong to. */
export const MODEL_KEY_PROVIDERS = ['gemini', 'anthropic'] as const;
export type ModelKeyProvider = (typeof MODEL_KEY_PROVIDERS)[number];

export function isModelKeyProvider(value: unknown): value is ModelKeyProvider {
  return typeof value === 'string' && (MODEL_KEY_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The provider of the platform's own key. Part A of 3.0.15 changes this, and
 * only after the quality comparison; until then the community key is Gemini.
 */
export const PLATFORM_PROVIDER: ModelKeyProvider = 'gemini';

/**
 * Whether an own Claude key is offered in Settings and accepted by the save
 * route. One switch for both, so the page and the route cannot disagree.
 * The owner turns it off here should the privacy texts for Anthropic as a
 * recipient not be live when this reaches production.
 */
export const ANTHROPIC_OWN_KEY_OFFERED = true;

/** The providers a save may name today. */
export function offeredKeyProviders(): ModelKeyProvider[] {
  return MODEL_KEY_PROVIDERS.filter((p) => p !== 'anthropic' || ANTHROPIC_OWN_KEY_OFFERED);
}

/**
 * The provider id a model receipt and a signed run carry. `google-gemini` is
 * the value every receipt and run before 3.0.15 carries
 * (`MODEL_PROVIDER_ID` in `lib/model-receipt.ts`); it is unchanged, so those
 * verify as before.
 */
export const RECEIPT_PROVIDER_ID: Readonly<Record<ModelKeyProvider, string>> = {
  gemini: 'google-gemini',
  anthropic: 'anthropic',
};

/** What a person reads for a provider. */
export const PROVIDER_LABEL: Readonly<Record<ModelKeyProvider, string>> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
};

/** The label for a provider id as a receipt or a run records it; the id itself when it is not one of ours. */
export function providerLabelOfReceiptId(id: string | null | undefined): string | null {
  if (!id) return null;
  for (const p of MODEL_KEY_PROVIDERS) if (RECEIPT_PROVIDER_ID[p] === id) return PROVIDER_LABEL[p];
  return id;
}

/** How a key of each provider begins — a placeholder, never a check. */
export const KEY_PLACEHOLDER: Readonly<Record<ModelKeyProvider, string>> = {
  gemini: 'AIzaSy...',
  anthropic: 'sk-ant-...',
};

/**
 * The Claude model an own Claude key runs — **the one place it is set**.
 *
 * Every stage asks the proxy for a Gemini model name (`PRODUCT_GEMINI_MODEL`,
 * the naming stage's lighter one); with an own Claude key those requests run
 * on this model instead. Changing it is a reviewed commit, because the model's
 * name goes into the model receipt, as with `PRODUCT_GEMINI_MODEL`.
 */
export const OWN_CLAUDE_MODEL = 'claude-sonnet-5-5';

/** The Claude models the proxy may call. Only a model named here is ever sent. */
export const ALLOWED_CLAUDE_MODELS: ReadonlySet<string> = new Set([OWN_CLAUDE_MODEL]);

/** Whose key answered: the account's own, or the platform's. */
export type KeyOwner = 'own' | 'platform';

export const KEY_OWNER_LABEL: Readonly<Record<KeyOwner, string>> = {
  own: 'your own key',
  platform: 'the platform key',
};

/**
 * The provider of the account's own key, read from the profile — the read
 * bridge. `null` when no own key is configured. A profile that says a key is
 * configured and names no provider is a key saved before 3.0.15: Gemini.
 * A provider value this code does not know is returned as `'unknown'`, so the
 * caller refuses rather than guesses (and never falls back to the platform key).
 */
export function ownKeyProviderOf(
  profile: { byokConfigured?: unknown; byokProvider?: unknown } | null | undefined,
): ModelKeyProvider | 'unknown' | null {
  if (!profile) return null;
  const named = profile.byokProvider;
  if (named !== undefined && named !== null) return isModelKeyProvider(named) ? named : 'unknown';
  return profile.byokConfigured === true ? 'gemini' : null;
}

/**
 * The provider a stored key record belongs to — the same bridge for the
 * record in `user_secrets/{uid}/providers/{id}`. A record without `provider`
 * is a Gemini record from before 3.0.15 and is only valid under the `gemini`
 * document; a record whose `provider` disagrees with its document is not read.
 */
export function storedKeyProviderOf(record: { provider?: unknown }, docId: string): ModelKeyProvider | null {
  const p = record.provider === undefined || record.provider === null ? 'gemini' : record.provider;
  return isModelKeyProvider(p) && p === docId ? p : null;
}

/** What `/api/gemini` records per stage on the account: the last answer and who served it. */
export interface StageAnswerRecord {
  provider: string;
  modelId: string;
  keyOwner: KeyOwner;
  /** ISO time of the call. */
  at: string;
}

export function isStageAnswerRecord(v: unknown): v is StageAnswerRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.provider === 'string' && typeof r.modelId === 'string' && (r.keyOwner === 'own' || r.keyOwner === 'platform') && typeof r.at === 'string';
}

/** "Anthropic Claude · claude-sonnet-5-5 · your own key" — the line a stage shows. */
export function answeredByLine(a: { provider: string; modelId: string; keyOwner: KeyOwner }): string {
  return `${providerLabelOfReceiptId(a.provider)} · ${a.modelId} · ${KEY_OWNER_LABEL[a.keyOwner]}`;
}

/**
 * Whether a recorded answer is worth writing again: only when who answered
 * changed, or the record is older than the window — a generation makes up to
 * 64 calls, and the account needs to know who answered, not each call.
 */
export const STAGE_ANSWER_REFRESH_MS = 10 * 60 * 1000;

export function stageAnswerNeedsWrite(previous: unknown, next: StageAnswerRecord): boolean {
  if (!isStageAnswerRecord(previous)) return true;
  if (previous.provider !== next.provider || previous.modelId !== next.modelId || previous.keyOwner !== next.keyOwner) return true;
  const before = Date.parse(previous.at);
  const now = Date.parse(next.at);
  return !Number.isFinite(before) || !Number.isFinite(now) || now - before >= STAGE_ANSWER_REFRESH_MS;
}

/**
 * Where code goes, per provider — for the Trust page. Links to the provider's
 * own terms rather than a paraphrase of them: what a provider does with API
 * data, and where, is the provider's statement to make and to change.
 */
export const PROVIDER_TERMS: Readonly<Record<ModelKeyProvider, ReadonlyArray<{ label: string; href: string }>>> = {
  gemini: [
    { label: 'Gemini API Additional Terms of Service', href: 'https://ai.google.dev/gemini-api/terms' },
    { label: 'Google Privacy Policy', href: 'https://policies.google.com/privacy' },
  ],
  anthropic: [
    { label: 'Anthropic Commercial Terms of Service', href: 'https://www.anthropic.com/legal/commercial-terms' },
    { label: 'Anthropic Privacy Policy', href: 'https://www.anthropic.com/legal/privacy' },
  ],
};
