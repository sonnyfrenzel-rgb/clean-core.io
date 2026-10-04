/**
 * The phone's view of a reading map, for `BpmnCanvas`'s `phoneXml` (ADR-072,
 * amended 04.10.2026).
 *
 * On a phone the canvas draws the same process laid out narrower — a wide
 * level wraps after fewer columns — so it fits the card at the 40 % floor.
 * It is built from the source the reading map was built from, in this
 * browser, for the canvas only (`buildPhoneReadingXml`): never stored, never
 * exported, never handed to the editor, a revision or a comparison. Those keep
 * reading `model.xml`.
 *
 * The layout costs about as much as the reading map's own, so one is kept per
 * file, variant and width: a canvas that is rebuilt for the same process (a
 * naming arrived, the reader went full screen and back) draws it again at once.
 */

export type PhoneXml = (fitWidth: number) => Promise<string | null>;

const KEEP = 4;
const held = new Map<string, Promise<string | null>>();

export function phoneLayout(input: {
  /** The source the reading map was built from, or how to fetch it. */
  source: string | (() => Promise<string>);
  processName: string;
  fileName: string;
  /** The file the canvas would otherwise draw — `model.xml`. */
  readingXml: string;
  technical: boolean;
}): PhoneXml {
  return (fitWidth) => {
    const width = Math.floor(fitWidth);
    const key = `${input.technical ? 't' : 'p'}|${width}|${input.fileName}|${input.readingXml}`;
    const kept = held.get(key);
    if (kept) return kept;
    const made = (async () => {
      const [{ buildPhoneReadingXml }, source] = await Promise.all([
        import('@/lib/bpmn/export'),
        typeof input.source === 'string' ? input.source : input.source(),
      ]);
      return buildPhoneReadingXml(
        source,
        { processName: input.processName, sourceFileName: input.fileName },
        { readingXml: input.readingXml, technical: input.technical, fitWidth: width },
      );
    })().catch(() => null);
    held.set(key, made);
    while (held.size > KEEP) held.delete(held.keys().next().value as string);
    return made;
  };
}
