/**
 * How much ABAP source one analysis reads — `MAX_ANALYSED_SOURCE_BYTES` in `app/api/runs/create/route.ts`, to the
 * byte (`tests/own-code-import.spec.ts` holds the two equal through `OWN_CODE_MAX_SOURCE_BYTES`).
 *
 * Its own module, with no imports, so every place a program is added — the home page's drop area, the own-code
 * import, Analyze's upload — can say the one limit in the one wording (`sourceSizeLimit` in
 * `lib/messages/own-code.ts`, UX review 22.11.2026 Q5) without pulling the import checks into its bundle.
 */
export const ANALYSED_SOURCE_MAX_BYTES = 256 * 1024;
