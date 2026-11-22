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
