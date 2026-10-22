/**
 * The notice the glossary assistant shows at its input, permanently — Art.
 * 50(1) AI Act (in force since 02.08.2026, no transition period): a person
 * talking to an AI system is told so. Wording from the legal review of
 * 22.10.2026 (L3, taken unchanged from C8 of the legal texts 1.0), with the
 * provider and the model the account's calls actually go to filled in.
 *
 * Roadmap 3.0.21. Pure: no imports.
 */

export function aiAssistantNotice(providerLabel: string | null, modelId: string | null): string {
  const who = providerLabel && modelId ? ` (${providerLabel}, ${modelId})` : '';
  return `You are chatting with an AI system. Answers are produced by a generative model${who}; they are drafts, not professionally reviewed advice.`;
}

/** The German wording of the same notice (L3), for the German interface after 3.0. */
export function aiAssistantNoticeDe(providerLabel: string | null, modelId: string | null): string {
  const who = providerLabel && modelId ? ` (${providerLabel}, ${modelId})` : '';
  return `Sie schreiben mit einem KI-System. Die Antworten erzeugt ein generatives Modell${who}; sie sind Entwürfe, kein fachlich geprüfter Rat.`;
}
