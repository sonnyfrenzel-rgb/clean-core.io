import { engineReads340Apply } from './engine-reads-340-gate';

/**
 * Input hygiene before the engine reads a source — release 3.4.0 (engine review of 22.11.2026, gated
 * `ENGINE_READS_340_FROM`).
 *
 *   - **A byte order mark is dropped.** `﻿` before `REPORT` made the first statement start with an invisible
 *     character, so the first keyword was not recognised.
 *   - **A line ending of a lone carriage return reads as a line ending.** The readers split on `\n` (with an optional
 *     `\r` before it); a file saved with classic Mac line ends (`\r` only) was one single line, a comment from its
 *     first `"` to the end of the file — the 300-line starter `Z_MM_PO_APPROVAL` read that way gave no finding and a
 *     coverage that claimed it was complete: a false clean bill. `\r\n` stays as it is, so no line number of any
 *     other source moves.
 *
 * Neither changes the number of a line. A run of an earlier engine reads the source as it signed it: the hygiene
 * applies only from 3.4.0. Pure.
 */
export function cleanSource(code: string): string {
  const noBom = code.charCodeAt(0) === 0xfeff ? code.slice(1) : code;
  return noBom.includes('\r') ? noBom.replace(/\r(?!\n)/g, '\n') : noBom;
}

/** The source as the given engine reads it: cleaned from 3.4.0, untouched before. */
export function sourceForEngine(code: string, engineVersion: string | null): string {
  return engineReads340Apply(engineVersion) ? cleanSource(code) : code;
}
