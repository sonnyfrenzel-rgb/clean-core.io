/**
 * Keyword tables more than one skeleton pass reads — engine 4 phase 3. Moved out of `process-skeleton.ts`
 * unchanged.
 */

/** Ranks of `RUNTIME_ORDER` (`process-skeleton.ts`) the run order of 3.0.7 (`chainReportEvents`) names. */
export const RANK_LOAD_OF_PROGRAM = 0;
export const RANK_START_OF_SELECTION = 5;
export const RANK_GET = 6;
export const RANK_END_OF_SELECTION = 7;

/** Blocks the walker descends into. Containers and macro bodies are not among them. */
export const FLOW_BLOCKS = new Set(['if', 'case', 'loop', 'do', 'while', 'select', 'try', 'at', 'provide']);

/**
 * ADR-054. The statements that hand control to the next arm of the construct
 * around them: falling through one of them means leaving that construct.
 */
export const ARM_HEADERS = new Set(['ELSE', 'ELSEIF', 'WHEN', 'CATCH', 'CLEANUP']);

/** ADR-054. Falling through one of these runs the loop again — something still follows. */
export const LOOP_CLOSERS = new Set(['ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDSELECT', 'ENDPROVIDE']);

/** Statements that declare rather than do. None of them is a step. */
export const DECLARATIVE = new Set([
  'REPORT', 'PROGRAM', 'FUNCTION-POOL', 'TABLES', 'TYPES', 'DATA', 'CONSTANTS',
  'FIELD-SYMBOLS', 'PARAMETERS', 'SELECT-OPTIONS', 'SELECTION-SCREEN', 'RANGES',
  'STATICS', 'CLASS-DATA', 'TYPE-POOLS', 'INFOTYPES', 'NODES', 'INCLUDE',
  'DEFINE', 'END-OF-DEFINITION', 'ENDFORM', 'ENDMODULE', 'ENDMETHOD',
  'ENDCLASS', 'ENDINTERFACE', 'CONTROLS', 'TYPE-POOL',
]);

/**
 * Everything `DECLARATIVE` holds, plus the words that open and close a named
 * region and the words a class or interface body declares with. A source in
 * which every statement is one of these **runs nothing** — roadmap 2.14 calls
 * that "not applicable" and says so, rather than returning zero steps in
 * silence. `METHOD`/`ENDMETHOD` belong here: an interface names methods and
 * implements none.
 */
export const DECLARES = new Set([
  ...DECLARATIVE,
  'CLASS', 'INTERFACE', 'METHOD', 'FUNCTION', 'ENDFUNCTION', 'FORM', 'MODULE',
  'PUBLIC', 'PROTECTED', 'PRIVATE', 'METHODS', 'CLASS-METHODS', 'INTERFACES',
  'ALIASES', 'EVENTS', 'CLASS-EVENTS', 'ENUM', 'ENDENUM', 'MESH',
]);
