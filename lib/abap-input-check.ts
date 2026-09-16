/**
 * Does this text contain ABAP at all?
 *
 * The analyze stage asked that question and answered it with "is the box not
 * empty?" — the keyword list was there, but an `|| code.trim().length > 0`
 * behind it meant a pasted e-mail passed, went to the model, cost a run of the
 * quota and was signed into the trust chain as legacy code (QA review of
 * 33471220d6e9, 2d714ac42b63).
 *
 * This is a gate, not a parser: it says "there is at least one ABAP top-level
 * construct in here", so a snippet, an include or a single form routine passes
 * and prose does not. The deterministic engine (`lib/abap/`) is what actually
 * reads the code afterwards.
 */

/** Top-level constructs. One of them appearing at the start of a line is ABAP. */
const CONSTRUCTS = [
  /^\s*REPORT\b/im,
  /^\s*PROGRAM\b/im,
  /^\s*(?:TYPE-POOL|TYPE-POOLS)\b/im,
  /^\s*INCLUDE\b/im,
  /^\s*FUNCTION\b/im,
  /^\s*FORM\b/im,
  /^\s*MODULE\b/im,
  /^\s*(?:CLASS|INTERFACE)\s+\S+\s+(?:DEFINITION|IMPLEMENTATION)\b/im,
  /^\s*METHOD\b/im,
  /^\s*START-OF-SELECTION\b/im,
  /^\s*(?:INITIALIZATION|AT SELECTION-SCREEN|END-OF-SELECTION|TOP-OF-PAGE)\b/im,
  /^\s*(?:DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|STATICS|PARAMETERS|SELECT-OPTIONS|TABLES)\b/im,
  /^\s*SELECT\b/im,
  /^\s*(?:LOOP\s+AT|READ\s+TABLE|CALL\s+FUNCTION|CALL\s+METHOD|PERFORM|WRITE|MOVE-CORRESPONDING|MODIFY|INSERT|UPDATE|DELETE)\b/im,
  /^\s*(?:DEFINE\s+VIEW|@AbapCatalog|@EndUserText)\b/im,
];

export function looksLikeAbap(code: string | null | undefined): boolean {
  if (typeof code !== 'string') return false;
  const text = code.trim();
  if (text.length === 0) return false;
  return CONSTRUCTS.some((rx) => rx.test(text));
}

/** Which construct answered — for messages that say what was recognised. */
export function abapConstructFound(code: string | null | undefined): boolean {
  return looksLikeAbap(code);
}
