/**
 * Who names a successor on a finding — SAP's data, or Clean-Core.io's own
 * curated mapping — said in words a reader cannot mistake for each other.
 *
 * The engine writes the answer as `sapReplacement.confidence`
 * (`lib/abap/evidence-model.ts`, `replacementProvenance()`): `'Catalog Match'`
 * is a lookup in SAP's published release data; `'Verified'` is the hand-written
 * field-level mapping in `lib/abap/sap-api-catalog.ts`, which is often the more
 * practical target but is not SAP's answer. `VBAK` shows the difference: SAP
 * names `I_SALESDOCUMENT`, the curated mapping names `API_SALES_ORDER_SRV`.
 *
 * Every surface that shows a successor next to its source reads this module,
 * so a curated pairing is never labelled as SAP's — external audit PRV-01.
 * Pure: no imports, safe for client components, exports and server routes.
 */

export type SuccessorSource = 'sap' | 'curated' | 'unconfirmed';

/** Where the named successor comes from, from the engine's confidence word. */
export function successorSource(confidence: string | null | undefined): SuccessorSource {
  if (confidence === 'Catalog Match') return 'sap';
  if (confidence === 'Verified') return 'curated';
  return 'unconfirmed';
}

/** The words for each source. */
export const SUCCESSOR_SOURCE_LABEL: Readonly<Record<Exclude<SuccessorSource, 'unconfirmed'>, string>> = Object.freeze({
  sap: 'SAP catalog',
  curated: 'Clean-Core.io curated mapping',
});

/**
 * The short source note for a successor: "SAP catalog", "Clean-Core.io curated
 * mapping", or — for a candidate nobody confirmed — the engine's own word, or
 * "to be checked" when it has none.
 */
export function successorSourceNote(confidence: string | null | undefined): string {
  const source = successorSource(confidence);
  if (source !== 'unconfirmed') return SUCCESSOR_SOURCE_LABEL[source];
  return confidence ? confidence.toLowerCase() : 'to be checked';
}
