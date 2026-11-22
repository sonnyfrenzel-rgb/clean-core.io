/**
 * Engine 4.0, layer L1: the table of statement kinds.
 *
 * Pure: imports only `./tokens`. A statement's kind is decided here and nowhere
 * else, by one rule in one order:
 *
 *   1. its shape — `x = …` is an assignment and `lo->m( ).` a call, whatever the
 *      first word is (`DATA(x) = 1.` assigns, it does not declare);
 *   2. the table below — the longest pattern of leading words that matches wins,
 *      table order breaks ties, a row's `when` must hold;
 *   3. a macro defined earlier in the source (`MacroCall`);
 *   4. otherwise `Unknown` — for this one statement only; its neighbours are
 *      read as if it were not there.
 *
 * A new statement kind is one row plus one spec. The block columns (`opens`,
 * `closes`, `middle`) are what L2 will build the block tree from; they live
 * here so that `CLASS … DEFINITION LOCAL FRIENDS`, `… DEFERRED` and `… LOAD`
 * are never openers by construction rather than by a regular expression at the
 * block layer.
 *
 * Patterns read *units*: words joined by `-`, `~`, `->`, `=>` written without
 * blanks are one unit (`END-OF-DEFINITION`, `CLASS-METHODS`, `if_x~m`), every
 * other token is its own unit, all upper-cased. In a pattern, `'*'` matches any
 * one unit, `'A|B'` either word, a regular expression one unit it accepts.
 */
import type { Token } from './tokens';

export type BlockKind =
  | 'if' | 'case' | 'loop' | 'do' | 'while' | 'try' | 'select' | 'at' | 'provide' | 'onChange'
  | 'catchSystemExceptions' | 'form' | 'method' | 'module' | 'function' | 'class' | 'interface'
  | 'define' | 'enhancement' | 'enhancementSection' | 'testSeam' | 'testInjection';

type Pattern = ReadonlyArray<string | RegExp>;

/**
 * What a statement does, in the classes the statement ledger accounts for (engine review of 22.11.2026, §3 L1).
 * `declaration` and `structure` have no effect of their own (a declaration's references are read by L4, a
 * structure statement opens or closes a block); every other class needs a consumer that claims it.
 *
 *   - `control`: branches, loops, leaving, raising, checks;
 *   - `compute`: assignments and internal-table and string operations;
 *   - `dbRead` / `dbWrite`: database access (Open SQL, RAP EML, logical-database `GET`);
 *   - `transaction`: the logical unit of work (`COMMIT`, `ROLLBACK`, update task, locks);
 *   - `callOut`: control leaves the statement for other code (PERFORM, CALL FUNCTION/METHOD/TRANSACTION, SUBMIT, …);
 *   - `ui`: screens, selection screens, lists, messages;
 *   - `fileMemory`: files, ABAP/SAP memory, parameters;
 *   - `authorization`: authority checks;
 *   - `dynamic`: code the reading cannot see (generated programs, native SQL, unexpanded macros);
 *   - `unknown`: a statement of no known kind.
 */
export type EffectClass =
  | 'declaration' | 'structure' | 'control' | 'compute' | 'dbRead' | 'dbWrite' | 'transaction' | 'callOut' | 'ui'
  | 'fileMemory' | 'authorization' | 'dynamic' | 'unknown';

export interface KindRow {
  readonly kind: string;
  /** What a statement of this kind does (the ledger's effect class). Every row has one. */
  readonly effect: EffectClass;
  readonly pattern: Pattern;
  readonly opens?: BlockKind;
  readonly closes?: BlockKind;
  /** A statement that splits a block without closing it: ELSE, WHEN, CATCH. */
  readonly middle?: BlockKind;
  /** Opens only if its closer follows before the enclosing block ends (`SELECT … ENDSELECT`). */
  readonly candidate?: boolean;
  /** An event block of a report. */
  readonly event?: boolean;
  readonly when?: (units: readonly string[]) => boolean;
}

const AGGREGATES = new Set(['COUNT', 'SUM', 'MAX', 'MIN', 'AVG']);
const AFTER_FIELDS = new Set(['WHERE', 'GROUP', 'HAVING', 'ORDER', 'INTO', 'APPENDING', 'UP', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT']);

/**
 * Is the SELECT list `units[from..to)` nothing but aggregates (`COUNT(*)`,
 * `SUM( netwr ) AS total`, …)? Then the result is one row and no loop opens.
 */
function aggregatesOnly(units: readonly string[], from: number, to: number): boolean {
  let i = from;
  let seen = false;
  while (i < to) {
    if (units[i] === 'DISTINCT' || units[i] === ',') { i += 1; continue; }
    if (!AGGREGATES.has(units[i]) || units[i + 1] !== '(') return false;
    let depth = 0;
    let j = i + 1;
    for (; j < to; j++) {
      if (units[j] === '(') depth += 1;
      else if (units[j] === ')' && --depth === 0) break;
    }
    if (j >= to) return false;
    i = j + 1;
    if (units[i] === 'AS') i += 2;
    seen = true;
  }
  return seen;
}

/** The SELECT list of a SELECT statement as a unit range: before FROM, or after FIELDS. */
function selectList(units: readonly string[]): [number, number] | null {
  if (units[0] !== 'SELECT') return null;
  const fields = units.indexOf('FIELDS');
  if (units[1] === 'FROM' && fields > 0) {
    let to = fields + 1;
    while (to < units.length && !AFTER_FIELDS.has(units[to])) to += 1;
    return [fields + 1, to];
  }
  const from = units.indexOf('FROM');
  return from > 1 ? [1, from] : null;
}

/**
 * Does a SELECT (or WITH) read row by row, so that an ENDSELECT may close it?
 * Not `SELECT SINGLE`, not `INTO TABLE` without `PACKAGE SIZE`, and not a SELECT
 * list of aggregates only without `GROUP BY` — its result is a single row.
 */
function selectMayLoop(units: readonly string[]): boolean {
  if (units[1] === 'SINGLE') return false;
  const joined = ` ${units.join(' ')} `;
  const intoTable = / (?:INTO|APPENDING) (?:CORRESPONDING FIELDS OF )?TABLE /.test(joined);
  if (intoTable && !/ PACKAGE SIZE /.test(joined)) return false;
  const range = selectList(units);
  if (range && !/ GROUP BY /.test(joined) && aggregatesOnly(units, range[0], range[1])) return false;
  return true;
}

/**
 * `GET <node> [LATE] [FIELDS f1 f2 …].` — the event of a logical database (ADR-134 Q9).
 * The node is one plain name; every other GET form is matched by its own row first.
 */
function isNodeEvent(units: readonly string[]): boolean {
  if (!/^[A-Z_\/][A-Z0-9_\/]*$/.test(units[1] ?? '')) return false;
  let i = 2;
  if (units[i] === 'LATE') i += 1;
  if (i === units.length) return true;
  return units[i] === 'FIELDS' && i + 1 < units.length;
}

const ROWS = [
  // Programs and includes
  { kind: 'Report', effect: 'structure', pattern: ['REPORT'] },
  { kind: 'Program', effect: 'structure', pattern: ['PROGRAM'] },
  { kind: 'FunctionPool', effect: 'structure', pattern: ['FUNCTION-POOL'] },
  { kind: 'ClassPool', effect: 'structure', pattern: ['CLASS-POOL'] },
  { kind: 'InterfacePool', effect: 'structure', pattern: ['INTERFACE-POOL'] },
  { kind: 'TypePool', effect: 'structure', pattern: ['TYPE-POOL'] },
  { kind: 'TypePools', effect: 'declaration', pattern: ['TYPE-POOLS'] },
  { kind: 'IncludeType', effect: 'declaration', pattern: ['INCLUDE', 'TYPE|STRUCTURE'] },
  { kind: 'Include', effect: 'structure', pattern: ['INCLUDE'] },
  // Classes and interfaces
  { kind: 'ClassDeferred', effect: 'structure', pattern: ['CLASS', '*', 'DEFINITION', 'DEFERRED'] },
  { kind: 'ClassLoad', effect: 'structure', pattern: ['CLASS', '*', 'DEFINITION', 'LOAD'] },
  { kind: 'ClassLoad', effect: 'structure', pattern: ['CLASS', '*', 'LOAD'] },
  { kind: 'ClassLocalFriends', effect: 'structure', pattern: ['CLASS', '*', 'DEFINITION', 'LOCAL', 'FRIENDS'] },
  { kind: 'ClassDefinition', effect: 'structure', pattern: ['CLASS', '*', 'DEFINITION'], opens: 'class' },
  { kind: 'ClassImplementation', effect: 'structure', pattern: ['CLASS', '*', 'IMPLEMENTATION'], opens: 'class' },
  { kind: 'EndClass', effect: 'structure', pattern: ['ENDCLASS'], closes: 'class' },
  { kind: 'InterfaceDeferred', effect: 'structure', pattern: ['INTERFACE', '*', 'DEFERRED'] },
  { kind: 'InterfaceLoad', effect: 'structure', pattern: ['INTERFACE', '*', 'LOAD'] },
  { kind: 'Interface', effect: 'structure', pattern: ['INTERFACE', '*'], opens: 'interface' },
  { kind: 'EndInterface', effect: 'structure', pattern: ['ENDINTERFACE'], closes: 'interface' },
  { kind: 'PublicSection', effect: 'structure', pattern: ['PUBLIC', 'SECTION'] },
  { kind: 'ProtectedSection', effect: 'structure', pattern: ['PROTECTED', 'SECTION'] },
  { kind: 'PrivateSection', effect: 'structure', pattern: ['PRIVATE', 'SECTION'] },
  { kind: 'Methods', effect: 'declaration', pattern: ['METHODS'] },
  { kind: 'ClassMethods', effect: 'declaration', pattern: ['CLASS-METHODS'] },
  { kind: 'Events', effect: 'declaration', pattern: ['EVENTS'] },
  { kind: 'ClassEvents', effect: 'declaration', pattern: ['CLASS-EVENTS'] },
  { kind: 'Interfaces', effect: 'declaration', pattern: ['INTERFACES'] },
  { kind: 'Aliases', effect: 'declaration', pattern: ['ALIASES'] },
  { kind: 'ClassData', effect: 'declaration', pattern: ['CLASS-DATA'] },
  // Procedures and macros
  { kind: 'MethodAmdp', effect: 'structure', pattern: ['METHOD', '*', 'BY', 'DATABASE'], opens: 'method' },
  { kind: 'Method', effect: 'structure', pattern: ['METHOD'], opens: 'method' },
  { kind: 'EndMethod', effect: 'structure', pattern: ['ENDMETHOD'], closes: 'method' },
  { kind: 'Form', effect: 'structure', pattern: ['FORM'], opens: 'form' },
  { kind: 'EndForm', effect: 'structure', pattern: ['ENDFORM'], closes: 'form' },
  { kind: 'Function', effect: 'structure', pattern: ['FUNCTION'], opens: 'function' },
  { kind: 'EndFunction', effect: 'structure', pattern: ['ENDFUNCTION'], closes: 'function' },
  { kind: 'Module', effect: 'structure', pattern: ['MODULE'], opens: 'module' },
  { kind: 'EndModule', effect: 'structure', pattern: ['ENDMODULE'], closes: 'module' },
  { kind: 'Define', effect: 'structure', pattern: ['DEFINE'], opens: 'define' },
  { kind: 'EndOfDefinition', effect: 'structure', pattern: ['END-OF-DEFINITION'], closes: 'define' },
  { kind: 'EnhancementPoint', effect: 'structure', pattern: ['ENHANCEMENT-POINT'] },
  { kind: 'EnhancementSection', effect: 'structure', pattern: ['ENHANCEMENT-SECTION'], opens: 'enhancementSection' },
  { kind: 'EndEnhancementSection', effect: 'structure', pattern: ['END-ENHANCEMENT-SECTION'], closes: 'enhancementSection' },
  { kind: 'Enhancement', effect: 'structure', pattern: ['ENHANCEMENT'], opens: 'enhancement' },
  { kind: 'EndEnhancement', effect: 'structure', pattern: ['ENDENHANCEMENT'], closes: 'enhancement' },
  { kind: 'TestSeam', effect: 'structure', pattern: ['TEST-SEAM'], opens: 'testSeam' },
  { kind: 'EndTestSeam', effect: 'structure', pattern: ['END-TEST-SEAM'], closes: 'testSeam' },
  { kind: 'TestInjection', effect: 'structure', pattern: ['TEST-INJECTION'], opens: 'testInjection' },
  { kind: 'EndTestInjection', effect: 'structure', pattern: ['END-TEST-INJECTION'], closes: 'testInjection' },
  // Event blocks of a report
  { kind: 'Initialization', effect: 'structure', pattern: ['INITIALIZATION'], event: true },
  { kind: 'StartOfSelection', effect: 'structure', pattern: ['START-OF-SELECTION'], event: true },
  { kind: 'EndOfSelection', effect: 'structure', pattern: ['END-OF-SELECTION'], event: true },
  { kind: 'LoadOfProgram', effect: 'structure', pattern: ['LOAD-OF-PROGRAM'], event: true },
  { kind: 'TopOfPage', effect: 'structure', pattern: ['TOP-OF-PAGE'], event: true },
  { kind: 'EndOfPage', effect: 'structure', pattern: ['END-OF-PAGE'], event: true },
  { kind: 'AtSelectionScreen', effect: 'structure', pattern: ['AT', 'SELECTION-SCREEN'], event: true },
  { kind: 'AtLineSelection', effect: 'structure', pattern: ['AT', 'LINE-SELECTION'], event: true },
  { kind: 'AtUserCommand', effect: 'structure', pattern: ['AT', 'USER-COMMAND'], event: true },
  { kind: 'AtPf', effect: 'structure', pattern: ['AT', /^PF\d+$/], event: true },
  // Declarations
  { kind: 'Data', effect: 'declaration', pattern: ['DATA'] },
  { kind: 'Types', effect: 'declaration', pattern: ['TYPES'] },
  { kind: 'Constants', effect: 'declaration', pattern: ['CONSTANTS'] },
  { kind: 'Statics', effect: 'declaration', pattern: ['STATICS'] },
  { kind: 'Parameters', effect: 'ui', pattern: ['PARAMETERS|PARAMETER'] },
  { kind: 'SelectOptions', effect: 'ui', pattern: ['SELECT-OPTIONS'] },
  { kind: 'SelectionScreen', effect: 'ui', pattern: ['SELECTION-SCREEN'] },
  { kind: 'Tables', effect: 'declaration', pattern: ['TABLES'] },
  { kind: 'Nodes', effect: 'declaration', pattern: ['NODES'] },
  { kind: 'FieldSymbols', effect: 'declaration', pattern: ['FIELD-SYMBOLS'] },
  { kind: 'Ranges', effect: 'declaration', pattern: ['RANGES'] },
  { kind: 'FieldGroups', effect: 'declaration', pattern: ['FIELD-GROUPS'] },
  { kind: 'Controls', effect: 'declaration', pattern: ['CONTROLS'] },
  { kind: 'Infotypes', effect: 'declaration', pattern: ['INFOTYPES'] },
  { kind: 'Local', effect: 'declaration', pattern: ['LOCAL'] },
  // Control structures
  { kind: 'If', effect: 'control', pattern: ['IF'], opens: 'if' },
  { kind: 'ElseIf', effect: 'control', pattern: ['ELSEIF'], middle: 'if' },
  { kind: 'Else', effect: 'control', pattern: ['ELSE'], middle: 'if' },
  { kind: 'EndIf', effect: 'structure', pattern: ['ENDIF'], closes: 'if' },
  { kind: 'Case', effect: 'control', pattern: ['CASE'], opens: 'case' },
  { kind: 'When', effect: 'control', pattern: ['WHEN'], middle: 'case' },
  { kind: 'EndCase', effect: 'structure', pattern: ['ENDCASE'], closes: 'case' },
  { kind: 'Loop', effect: 'control', pattern: ['LOOP'], opens: 'loop' },
  { kind: 'EndLoop', effect: 'structure', pattern: ['ENDLOOP'], closes: 'loop' },
  { kind: 'Do', effect: 'control', pattern: ['DO'], opens: 'do' },
  { kind: 'EndDo', effect: 'structure', pattern: ['ENDDO'], closes: 'do' },
  { kind: 'While', effect: 'control', pattern: ['WHILE'], opens: 'while' },
  { kind: 'EndWhile', effect: 'structure', pattern: ['ENDWHILE'], closes: 'while' },
  { kind: 'Try', effect: 'control', pattern: ['TRY'], opens: 'try' },
  { kind: 'CatchSystemExceptions', effect: 'control', pattern: ['CATCH', 'SYSTEM-EXCEPTIONS'], opens: 'catchSystemExceptions' },
  { kind: 'Catch', effect: 'control', pattern: ['CATCH'], middle: 'try' },
  { kind: 'Cleanup', effect: 'control', pattern: ['CLEANUP'], middle: 'try' },
  { kind: 'EndTry', effect: 'structure', pattern: ['ENDTRY'], closes: 'try' },
  { kind: 'EndCatch', effect: 'structure', pattern: ['ENDCATCH'], closes: 'catchSystemExceptions' },
  { kind: 'AtGroup', effect: 'control', pattern: ['AT', 'NEW|FIRST|LAST'], opens: 'at' },
  { kind: 'AtGroup', effect: 'control', pattern: ['AT', 'END', 'OF'], opens: 'at' },
  { kind: 'AtFieldGroup', effect: 'control', pattern: ['AT'], opens: 'at' },
  { kind: 'EndAt', effect: 'structure', pattern: ['ENDAT'], closes: 'at' },
  { kind: 'OnChange', effect: 'control', pattern: ['ON', 'CHANGE', 'OF'], opens: 'onChange' },
  { kind: 'EndOn', effect: 'structure', pattern: ['ENDON'], closes: 'onChange' },
  { kind: 'Provide', effect: 'control', pattern: ['PROVIDE'], opens: 'provide' },
  { kind: 'EndProvide', effect: 'structure', pattern: ['ENDPROVIDE'], closes: 'provide' },
  { kind: 'SelectLoop', effect: 'dbRead', pattern: ['SELECT'], opens: 'select', candidate: true, when: selectMayLoop },
  { kind: 'Select', effect: 'dbRead', pattern: ['SELECT'] },
  { kind: 'WithLoop', effect: 'dbRead', pattern: ['WITH'], opens: 'select', candidate: true, when: selectMayLoop },
  { kind: 'With', effect: 'dbRead', pattern: ['WITH'] },
  { kind: 'EndSelect', effect: 'structure', pattern: ['ENDSELECT'], closes: 'select' },
  // Leaving and raising
  { kind: 'Check', effect: 'control', pattern: ['CHECK'] },
  { kind: 'Exit', effect: 'control', pattern: ['EXIT'] },
  { kind: 'Continue', effect: 'control', pattern: ['CONTINUE'] },
  { kind: 'Return', effect: 'control', pattern: ['RETURN'] },
  { kind: 'Stop', effect: 'control', pattern: ['STOP'] },
  { kind: 'Reject', effect: 'control', pattern: ['REJECT'] },
  { kind: 'LeaveProgram', effect: 'control', pattern: ['LEAVE', 'PROGRAM'] },
  { kind: 'LeaveToTransaction', effect: 'callOut', pattern: ['LEAVE', 'TO', 'TRANSACTION'] },
  { kind: 'LeaveToScreen', effect: 'ui', pattern: ['LEAVE', 'TO', 'SCREEN'] },
  { kind: 'LeaveToListProcessing', effect: 'ui', pattern: ['LEAVE', 'TO', 'LIST-PROCESSING'] },
  { kind: 'LeaveScreen', effect: 'ui', pattern: ['LEAVE', 'SCREEN'] },
  { kind: 'LeaveListProcessing', effect: 'ui', pattern: ['LEAVE', 'LIST-PROCESSING'] },
  { kind: 'Leave', effect: 'control', pattern: ['LEAVE'] },
  { kind: 'RaiseException', effect: 'control', pattern: ['RAISE', 'EXCEPTION'] },
  { kind: 'RaiseException', effect: 'control', pattern: ['RAISE', 'RESUMABLE', 'EXCEPTION'] },
  { kind: 'RaiseEvent', effect: 'callOut', pattern: ['RAISE', 'EVENT'] },
  { kind: 'RaiseEntityEvent', effect: 'callOut', pattern: ['RAISE', 'ENTITY', 'EVENT'] },
  { kind: 'RaiseShortdump', effect: 'control', pattern: ['RAISE', 'SHORTDUMP'] },
  { kind: 'Raise', effect: 'control', pattern: ['RAISE'] },
  { kind: 'Resume', effect: 'control', pattern: ['RESUME'] },
  { kind: 'Retry', effect: 'control', pattern: ['RETRY'] },
  { kind: 'Assert', effect: 'control', pattern: ['ASSERT'] },
  { kind: 'BreakPoint', effect: 'control', pattern: ['BREAK-POINT|BREAK'] },
  { kind: 'LogPoint', effect: 'control', pattern: ['LOG-POINT'] },
  // Calls
  { kind: 'Perform', effect: 'callOut', pattern: ['PERFORM'] },
  { kind: 'CallFunction', effect: 'callOut', pattern: ['CALL', 'FUNCTION'] },
  { kind: 'CallMethod', effect: 'callOut', pattern: ['CALL', 'METHOD'] },
  { kind: 'CallTransaction', effect: 'callOut', pattern: ['CALL', 'TRANSACTION'] },
  { kind: 'CallScreen', effect: 'ui', pattern: ['CALL', 'SCREEN'] },
  { kind: 'CallSelectionScreen', effect: 'ui', pattern: ['CALL', 'SELECTION-SCREEN'] },
  { kind: 'CallBadi', effect: 'callOut', pattern: ['CALL', 'BADI'] },
  { kind: 'CallTransformation', effect: 'callOut', pattern: ['CALL', 'TRANSFORMATION'] },
  { kind: 'CallDialog', effect: 'callOut', pattern: ['CALL', 'DIALOG'] },
  { kind: 'CallCustomerFunction', effect: 'callOut', pattern: ['CALL', 'CUSTOMER-FUNCTION'] },
  { kind: 'CallDatabaseProcedure', effect: 'callOut', pattern: ['CALL', 'DATABASE', 'PROCEDURE'] },
  { kind: 'Call', effect: 'callOut', pattern: ['CALL'] },
  { kind: 'Submit', effect: 'callOut', pattern: ['SUBMIT'] },
  { kind: 'GetBadi', effect: 'callOut', pattern: ['GET', 'BADI'] },
  { kind: 'SetHandler', effect: 'callOut', pattern: ['SET', 'HANDLER'] },
  { kind: 'CreateObject', effect: 'callOut', pattern: ['CREATE', 'OBJECT'] },
  { kind: 'CreateData', effect: 'compute', pattern: ['CREATE', 'DATA'] },
  { kind: 'Message', effect: 'ui', pattern: ['MESSAGE'] },
  { kind: 'AuthorityCheck', effect: 'authorization', pattern: ['AUTHORITY-CHECK'] },
  // Database, files, RAP
  { kind: 'Insert', effect: 'dbWrite', pattern: ['INSERT'] },
  { kind: 'InsertReport', effect: 'dynamic', pattern: ['INSERT', 'REPORT'] },
  { kind: 'Update', effect: 'dbWrite', pattern: ['UPDATE'] },
  { kind: 'ModifyEntities', effect: 'dbWrite', pattern: ['MODIFY', 'ENTITY|ENTITIES'] },
  { kind: 'Modify', effect: 'dbWrite', pattern: ['MODIFY'] },
  { kind: 'DeleteDataset', effect: 'fileMemory', pattern: ['DELETE', 'DATASET'] },
  { kind: 'Delete', effect: 'dbWrite', pattern: ['DELETE'] },
  { kind: 'ReadEntities', effect: 'dbRead', pattern: ['READ', 'ENTITY|ENTITIES'] },
  { kind: 'CommitEntities', effect: 'transaction', pattern: ['COMMIT', 'ENTITIES'] },
  { kind: 'RollbackEntities', effect: 'transaction', pattern: ['ROLLBACK', 'ENTITIES'] },
  { kind: 'GetPermissions', effect: 'authorization', pattern: ['GET', 'PERMISSIONS'] },
  { kind: 'SetLocks', effect: 'transaction', pattern: ['SET', 'LOCKS'] },
  { kind: 'CommitWork', effect: 'transaction', pattern: ['COMMIT'] },
  { kind: 'RollbackWork', effect: 'transaction', pattern: ['ROLLBACK'] },
  { kind: 'OpenCursor', effect: 'dbRead', pattern: ['OPEN', 'CURSOR'] },
  { kind: 'Fetch', effect: 'dbRead', pattern: ['FETCH'] },
  { kind: 'CloseCursor', effect: 'dbRead', pattern: ['CLOSE', 'CURSOR'] },
  { kind: 'ExecSql', effect: 'dynamic', pattern: ['EXEC', 'SQL'] },
  { kind: 'EndExec', effect: 'dynamic', pattern: ['ENDEXEC'] },
  { kind: 'OpenDataset', effect: 'fileMemory', pattern: ['OPEN', 'DATASET'] },
  { kind: 'CloseDataset', effect: 'fileMemory', pattern: ['CLOSE', 'DATASET'] },
  { kind: 'ReadDataset', effect: 'fileMemory', pattern: ['READ', 'DATASET'] },
  { kind: 'Transfer', effect: 'fileMemory', pattern: ['TRANSFER'] },
  // Data and internal tables
  { kind: 'ReadTable', effect: 'compute', pattern: ['READ', 'TABLE'] },
  { kind: 'ReadReport', effect: 'dynamic', pattern: ['READ', 'REPORT'] },
  { kind: 'ReadLine', effect: 'ui', pattern: ['READ', 'LINE'] },
  { kind: 'Read', effect: 'compute', pattern: ['READ'] },
  { kind: 'Append', effect: 'compute', pattern: ['APPEND'] },
  { kind: 'Collect', effect: 'compute', pattern: ['COLLECT'] },
  { kind: 'Sort', effect: 'compute', pattern: ['SORT'] },
  { kind: 'Clear', effect: 'compute', pattern: ['CLEAR'] },
  { kind: 'Refresh', effect: 'compute', pattern: ['REFRESH'] },
  { kind: 'Free', effect: 'compute', pattern: ['FREE'] },
  { kind: 'Describe', effect: 'compute', pattern: ['DESCRIBE'] },
  { kind: 'MoveCorresponding', effect: 'compute', pattern: ['MOVE-CORRESPONDING'] },
  { kind: 'Move', effect: 'compute', pattern: ['MOVE'] },
  { kind: 'Assign', effect: 'compute', pattern: ['ASSIGN'] },
  { kind: 'Unassign', effect: 'compute', pattern: ['UNASSIGN'] },
  { kind: 'Concatenate', effect: 'compute', pattern: ['CONCATENATE'] },
  { kind: 'Split', effect: 'compute', pattern: ['SPLIT'] },
  { kind: 'Condense', effect: 'compute', pattern: ['CONDENSE'] },
  { kind: 'Translate', effect: 'compute', pattern: ['TRANSLATE'] },
  { kind: 'Replace', effect: 'compute', pattern: ['REPLACE'] },
  { kind: 'Find', effect: 'compute', pattern: ['FIND'] },
  { kind: 'Search', effect: 'compute', pattern: ['SEARCH'] },
  { kind: 'Shift', effect: 'compute', pattern: ['SHIFT'] },
  { kind: 'Overlay', effect: 'compute', pattern: ['OVERLAY'] },
  { kind: 'Add', effect: 'compute', pattern: ['ADD'] },
  { kind: 'Subtract', effect: 'compute', pattern: ['SUBTRACT'] },
  { kind: 'Multiply', effect: 'compute', pattern: ['MULTIPLY'] },
  { kind: 'Divide', effect: 'compute', pattern: ['DIVIDE'] },
  { kind: 'Compute', effect: 'compute', pattern: ['COMPUTE'] },
  { kind: 'GetReference', effect: 'compute', pattern: ['GET', 'REFERENCE'] },
  { kind: 'GetTime', effect: 'compute', pattern: ['GET', 'TIME'] },
  { kind: 'GetParameter', effect: 'fileMemory', pattern: ['GET', 'PARAMETER'] },
  // ADR-134 Q9: the other GET forms have rows of their own, so that only
  // `GET <node> [LATE] [FIELDS …].` — a logical-database node — is an event block.
  { kind: 'GetBit', effect: 'compute', pattern: ['GET', 'BIT'] },
  { kind: 'GetCursor', effect: 'ui', pattern: ['GET', 'CURSOR'] },
  { kind: 'GetLocale', effect: 'compute', pattern: ['GET', 'LOCALE'] },
  { kind: 'GetPfStatus', effect: 'ui', pattern: ['GET', 'PF-STATUS'] },
  { kind: 'GetRunTime', effect: 'compute', pattern: ['GET', 'RUN', 'TIME'] },
  { kind: 'GetDataset', effect: 'fileMemory', pattern: ['GET', 'DATASET'] },
  { kind: 'GetProperty', effect: 'callOut', pattern: ['GET', 'PROPERTY'] },
  { kind: 'GetNode', effect: 'dbRead', pattern: ['GET', '*'], event: true, when: isNodeEvent },
  { kind: 'Get', effect: 'unknown', pattern: ['GET'] },
  { kind: 'SetParameter', effect: 'fileMemory', pattern: ['SET', 'PARAMETER'] },
  { kind: 'SetPfStatus', effect: 'ui', pattern: ['SET', 'PF-STATUS'] },
  { kind: 'SetTitlebar', effect: 'ui', pattern: ['SET', 'TITLEBAR'] },
  { kind: 'SetScreen', effect: 'ui', pattern: ['SET', 'SCREEN'] },
  { kind: 'SetUpdateTask', effect: 'transaction', pattern: ['SET', 'UPDATE', 'TASK'] },
  { kind: 'Set', effect: 'compute', pattern: ['SET'] },
  { kind: 'Import', effect: 'fileMemory', pattern: ['IMPORT'] },
  { kind: 'Export', effect: 'fileMemory', pattern: ['EXPORT'] },
  { kind: 'Wait', effect: 'control', pattern: ['WAIT'] },
  { kind: 'Receive', effect: 'callOut', pattern: ['RECEIVE'] },
  { kind: 'Convert', effect: 'compute', pattern: ['CONVERT'] },
  { kind: 'Pack', effect: 'compute', pattern: ['PACK'] },
  { kind: 'Unpack', effect: 'compute', pattern: ['UNPACK'] },
  { kind: 'Generate', effect: 'dynamic', pattern: ['GENERATE'] },
  { kind: 'SyntaxCheck', effect: 'dynamic', pattern: ['SYNTAX-CHECK'] },
  { kind: 'EditorCall', effect: 'dynamic', pattern: ['EDITOR-CALL'] },
  { kind: 'Extract', effect: 'compute', pattern: ['EXTRACT'] },
  { kind: 'Sum', effect: 'compute', pattern: ['SUM'] },
  // Lists and dynpro flow logic
  { kind: 'Write', effect: 'ui', pattern: ['WRITE'] },
  { kind: 'Uline', effect: 'ui', pattern: ['ULINE'] },
  { kind: 'Skip', effect: 'ui', pattern: ['SKIP'] },
  { kind: 'NewLine', effect: 'ui', pattern: ['NEW-LINE'] },
  { kind: 'NewPage', effect: 'ui', pattern: ['NEW-PAGE'] },
  { kind: 'Format', effect: 'ui', pattern: ['FORMAT'] },
  { kind: 'Position', effect: 'ui', pattern: ['POSITION'] },
  { kind: 'Reserve', effect: 'ui', pattern: ['RESERVE'] },
  { kind: 'Hide', effect: 'ui', pattern: ['HIDE'] },
  { kind: 'Window', effect: 'ui', pattern: ['WINDOW'] },
  { kind: 'Scroll', effect: 'ui', pattern: ['SCROLL'] },
  { kind: 'SuppressDialog', effect: 'ui', pattern: ['SUPPRESS', 'DIALOG'] },
  { kind: 'Process', effect: 'ui', pattern: ['PROCESS'] },
  { kind: 'Chain', effect: 'ui', pattern: ['CHAIN'] },
  { kind: 'EndChain', effect: 'ui', pattern: ['ENDCHAIN'] },
  { kind: 'Field', effect: 'ui', pattern: ['FIELD'] },
] as const satisfies readonly KindRow[];

/** Kinds that no table row produces: the shape kinds, macros, native code and the unknown. */
export const SHAPE_KINDS = ['Assignment', 'MethodCall', 'MacroCall', 'NativeSql', 'Unknown'] as const;
const SHAPE_EFFECT: Record<(typeof SHAPE_KINDS)[number], EffectClass> = {
  Assignment: 'compute',
  MethodCall: 'callOut',
  MacroCall: 'dynamic',
  NativeSql: 'dynamic',
  Unknown: 'unknown',
};

export type StatementKind = (typeof ROWS)[number]['kind'] | (typeof SHAPE_KINDS)[number];

export const KIND_TABLE: readonly KindRow[] = ROWS;

export interface KindInfo {
  /** The leading keyword, or null for the shape kinds. */
  keyword: string | null;
  effect: EffectClass;
  opens?: BlockKind;
  closes?: BlockKind;
  middle?: BlockKind;
  candidate?: boolean;
  event?: boolean;
}

const INFO = new Map<string, KindInfo>();
for (const row of KIND_TABLE) {
  if (INFO.has(row.kind)) continue;
  const head = row.pattern[0];
  INFO.set(row.kind, {
    keyword: typeof head === 'string' ? head.split('|')[0] : null,
    effect: row.effect,
    opens: row.opens,
    closes: row.closes,
    middle: row.middle,
    candidate: row.candidate,
    event: row.event,
  });
}
for (const kind of SHAPE_KINDS) INFO.set(kind, { keyword: null, effect: SHAPE_EFFECT[kind] });

/** What the table says about a kind. */
export function kindInfo(kind: StatementKind): KindInfo {
  return INFO.get(kind) ?? { keyword: null, effect: 'unknown' };
}

/** Every kind the classifier can produce, table rows first. */
export function allKinds(): StatementKind[] {
  return [...INFO.keys()] as StatementKind[];
}

/** Rows by their first word, longest pattern first, table order kept within a length. */
const BY_HEAD = new Map<string, KindRow[]>();
for (const row of KIND_TABLE) {
  const head = row.pattern[0];
  if (typeof head !== 'string') continue;
  for (const word of head.split('|')) {
    const list = BY_HEAD.get(word) ?? [];
    list.push(row);
    BY_HEAD.set(word, list);
  }
}
for (const list of BY_HEAD.values()) list.sort((a, b) => b.pattern.length - a.pattern.length);

function unitMatches(element: string | RegExp, unit: string | undefined): boolean {
  if (unit === undefined) return false;
  if (typeof element !== 'string') return element.test(unit);
  if (element === '*') return true;
  return element.split('|').includes(unit);
}

/** The table row for these units, or null. */
export function matchRow(units: readonly string[]): KindRow | null {
  const rows = BY_HEAD.get(units[0] ?? '');
  if (!rows) return null;
  for (const row of rows) {
    if (row.pattern.every((element, i) => unitMatches(element, units[i]))) {
      if (!row.when || row.when(units)) return row;
    }
  }
  return null;
}

const JOINERS = new Set(['-', '~', '->', '=>']);

function isName(token: Token | undefined): boolean {
  return token !== undefined && (token.kind === 'word' || token.kind === 'fieldSymbol');
}

/**
 * The units a statement's tokens read as: names joined by `-`, `~`, `->`, `=>`
 * written without blanks are one unit; every unit upper-cased.
 */
export function unitsOf(tokens: readonly Token[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (!isName(t)) {
      out.push(t.text.toUpperCase());
      i += 1;
      continue;
    }
    let unit = t.text;
    i += 1;
    while (
      i + 1 < tokens.length &&
      tokens[i].kind === 'punct' &&
      JOINERS.has(tokens[i].text) &&
      !tokens[i].spaceBefore &&
      !tokens[i + 1].spaceBefore &&
      (isName(tokens[i + 1]) || (tokens[i].text === '-' && tokens[i + 1].kind === 'number'))
    ) {
      unit += tokens[i].text + tokens[i + 1].text;
      i += 2;
    }
    out.push(unit.toUpperCase());
  }
  return out;
}
