/**
 * saxen ships JavaScript only. This is the slice of its API `lib/process-revisions.ts`
 * uses to check that a revision is well-formed XML with a BPMN root; nothing else is
 * declared on purpose, so a wider use has to widen this file and say why.
 */
declare module 'saxen' {
  export interface SaxenElement {
    name: string;
    originalName: string;
    attrs: Record<string, string>;
    ns: Record<string, string>;
  }
  export class Parser {
    constructor(options?: { proxy?: boolean });
    ns(map: Record<string, string>): void;
    on(event: 'openTag', handler: (element: SaxenElement) => void): void;
    on(event: 'closeTag', handler: (element: SaxenElement) => void): void;
    on(event: 'error', handler: (error: Error) => void): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    parse(xml: string): void;
  }
}
