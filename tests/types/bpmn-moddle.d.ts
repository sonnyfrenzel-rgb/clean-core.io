/**
 * `bpmn-moddle` (MIT) ships model types but declares none for its entry point,
 * so TypeScript sees the parser itself as an implicit `any`. This is the
 * smallest true declaration of what `tests/bpmn-export.spec.ts` calls: the
 * parser the BPMN export is read back with, and the one bpmn-js uses.
 */
declare module 'bpmn-moddle' {
  export interface ModdleAny {
    $type: string;
    [key: string]: unknown;
  }

  export interface ParseResult {
    rootElement: ModdleAny;
    elementsById: Record<string, ModdleAny>;
    references: unknown[];
    warnings: Array<{ message: string }>;
  }

  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    fromXML(xml: string, typeName?: string): Promise<ParseResult>;
    toXML(element: ModdleAny, options?: { format?: boolean; preamble?: boolean }): Promise<{ xml: string }>;
  }

  export default BpmnModdle;
}
