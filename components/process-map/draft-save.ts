/**
 * The order of a save in the BPMN editor, kept apart from the component so a
 * spec can run it (QA full review of 81810c8, 68c8263e20f6).
 *
 * The editor marked itself dirty synchronously on every change but updated its
 * copy of the XML only when an asynchronous `saveXML` resolved, in whatever
 * order those resolved. Save pressed right after an edit therefore kept the XML
 * from before it, and `setDirty(false)` after the save wiped the "Unsaved
 * changes" of edits made while the save was in flight.
 *
 * Two rules, both here:
 *   - the XML that is kept is serialised from the canvas at the moment Save is
 *     pressed, not read from a copy an earlier change left behind;
 *   - the draft is reported clean only when no change happened between that
 *     moment and the answer. `changes` is a counter the editor increments on
 *     every change; the same counter lets a late `saveXML` resolution see that
 *     it is no longer the newest and drop itself.
 *
 * No imports: the editor is a client component.
 */

export interface KeepResult {
  ok: boolean;
  message: string;
}

export interface SaveDraftInput<R extends KeepResult> {
  /** The canvas, serialised now. `undefined` when there is no canvas to read. */
  serialise: () => Promise<string | undefined>;
  /** What to keep when there is no canvas: the last published draft. */
  fallbackXml: string;
  /** The editor's change counter, read now. */
  changes: () => number;
  /** Where the draft goes. */
  keep: (xml: string) => Promise<R>;
}

export async function saveDraft<R extends KeepResult>(
  input: SaveDraftInput<R>,
): Promise<{ result: R; clean: boolean }> {
  const before = input.changes();
  const fresh = await input.serialise();
  const result = await input.keep(fresh || input.fallbackXml);
  return { result, clean: result.ok && input.changes() === before };
}
