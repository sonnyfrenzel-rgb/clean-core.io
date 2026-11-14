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

export interface KindRow {
  readonly kind: string;
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

/** Does a SELECT (or WITH) read row by row, so that an ENDSELECT may close it? */
function selectMayLoop(units: readonly string[]): boolean {
  if (units[1] === 'SINGLE') return false;
  const joined = ` ${units.join(' ')} `;
  const intoTable = / (?:INTO|APPENDING) (?:CORRESPONDING FIELDS OF )?TABLE /.test(joined);
  return !intoTable || / PACKAGE SIZE /.test(joined);
}

const ROWS = [
  // Programs and includes
  { kind: 'Report', pattern: ['REPORT'] },
  { kind: 'Program', pattern: ['PROGRAM'] },
  { kind: 'FunctionPool', pattern: ['FUNCTION-POOL'] },
  { kind: 'ClassPool', pattern: ['CLASS-POOL'] },
  { kind: 'InterfacePool', pattern: ['INTERFACE-POOL'] },
  { kind: 'TypePool', pattern: ['TYPE-POOL'] },
  { kind: 'TypePools', pattern: ['TYPE-POOLS'] },
  { kind: 'IncludeType', pattern: ['INCLUDE', 'TYPE|STRUCTURE'] },
  { kind: 'Include', pattern: ['INCLUDE'] },
  // Classes and interfaces
  { kind: 'ClassDeferred', pattern: ['CLASS', '*', 'DEFINITION', 'DEFERRED'] },
  { kind: 'ClassLoad', pattern: ['CLASS', '*', 'DEFINITION', 'LOAD'] },
  { kind: 'ClassLoad', pattern: ['CLASS', '*', 'LOAD'] },
  { kind: 'ClassLocalFriends', pattern: ['CLASS', '*', 'DEFINITION', 'LOCAL', 'FRIENDS'] },
  { kind: 'ClassDefinition', pattern: ['CLASS', '*', 'DEFINITION'], opens: 'class' },
  { kind: 'ClassImplementation', pattern: ['CLASS', '*', 'IMPLEMENTATION'], opens: 'class' },
  { kind: 'EndClass', pattern: ['ENDCLASS'], closes: 'class' },
  { kind: 'InterfaceDeferred', pattern: ['INTERFACE', '*', 'DEFERRED'] },
  { kind: 'InterfaceLoad', pattern: ['INTERFACE', '*', 'LOAD'] },
  { kind: 'Interface', pattern: ['INTERFACE', '*'], opens: 'interface' },
  { kind: 'EndInterface', pattern: ['ENDINTERFACE'], closes: 'interface' },
  { kind: 'PublicSection', pattern: ['PUBLIC', 'SECTION'] },
  { kind: 'ProtectedSection', pattern: ['PROTECTED', 'SECTION'] },
  { kind: 'PrivateSection', pattern: ['PRIVATE', 'SECTION'] },
  { kind: 'Methods', pattern: ['METHODS'] },
  { kind: 'ClassMethods', pattern: ['CLASS-METHODS'] },
  { kind: 'Events', pattern: ['EVENTS'] },
  { kind: 'ClassEvents', pattern: ['CLASS-EVENTS'] },
  { kind: 'Interfaces', pattern: ['INTERFACES'] },
  { kind: 'Aliases', pattern: ['ALIASES'] },
  { kind: 'ClassData', pattern: ['CLASS-DATA'] },
  // Procedures and macros
  { kind: 'MethodAmdp', pattern: ['METHOD', '*', 'BY', 'DATABASE'], opens: 'method' },
  { kind: 'Method', pattern: ['METHOD'], opens: 'method' },
  { kind: 'EndMethod', pattern: ['ENDMETHOD'], closes: 'method' },
  { kind: 'Form', pattern: ['FORM'], opens: 'form' },
  { kind: 'EndForm', pattern: ['ENDFORM'], closes: 'form' },
  { kind: 'Function', pattern: ['FUNCTION'], opens: 'function' },
  { kind: 'EndFunction', pattern: ['ENDFUNCTION'], closes: 'function' },
  { kind: 'Module', pattern: ['MODULE'], opens: 'module' },
  { kind: 'EndModule', pattern: ['ENDMODULE'], closes: 'module' },
  { kind: 'Define', pattern: ['DEFINE'], opens: 'define' },
  { kind: 'EndOfDefinition', pattern: ['END-OF-DEFINITION'], closes: 'define' },
  { kind: 'EnhancementPoint', pattern: ['ENHANCEMENT-POINT'] },
  { kind: 'EnhancementSection', pattern: ['ENHANCEMENT-SECTION'], opens: 'enhancementSection' },
  { kind: 'EndEnhancementSection', pattern: ['END-ENHANCEMENT-SECTION'], closes: 'enhancementSection' },
  { kind: 'Enhancement', pattern: ['ENHANCEMENT'], opens: 'enhancement' },
  { kind: 'EndEnhancement', pattern: ['ENDENHANCEMENT'], closes: 'enhancement' },
  { kind: 'TestSeam', pattern: ['TEST-SEAM'], opens: 'testSeam' },
  { kind: 'EndTestSeam', pattern: ['END-TEST-SEAM'], closes: 'testSeam' },
  { kind: 'TestInjection', pattern: ['TEST-INJECTION'], opens: 'testInjection' },
  { kind: 'EndTestInjection', pattern: ['END-TEST-INJECTION'], closes: 'testInjection' },
  // Event blocks of a report
  { kind: 'Initialization', pattern: ['INITIALIZATION'], event: true },
  { kind: 'StartOfSelection', pattern: ['START-OF-SELECTION'], event: true },
  { kind: 'EndOfSelection', pattern: ['END-OF-SELECTION'], event: true },
  { kind: 'LoadOfProgram', pattern: ['LOAD-OF-PROGRAM'], event: true },
  { kind: 'TopOfPage', pattern: ['TOP-OF-PAGE'], event: true },
  { kind: 'EndOfPage', pattern: ['END-OF-PAGE'], event: true },
  { kind: 'AtSelectionScreen', pattern: ['AT', 'SELECTION-SCREEN'], event: true },
  { kind: 'AtLineSelection', pattern: ['AT', 'LINE-SELECTION'], event: true },
  { kind: 'AtUserCommand', pattern: ['AT', 'USER-COMMAND'], event: true },
  { kind: 'AtPf', pattern: ['AT', /^PF\d+$/], event: true },
  // Declarations
  { kind: 'Data', pattern: ['DATA'] },
  { kind: 'Types', pattern: ['TYPES'] },
  { kind: 'Constants', pattern: ['CONSTANTS'] },
  { kind: 'Statics', pattern: ['STATICS'] },
  { kind: 'Parameters', pattern: ['PARAMETERS|PARAMETER'] },
  { kind: 'SelectOptions', pattern: ['SELECT-OPTIONS'] },
  { kind: 'SelectionScreen', pattern: ['SELECTION-SCREEN'] },
  { kind: 'Tables', pattern: ['TABLES'] },
  { kind: 'Nodes', pattern: ['NODES'] },
  { kind: 'FieldSymbols', pattern: ['FIELD-SYMBOLS'] },
  { kind: 'Ranges', pattern: ['RANGES'] },
  { kind: 'FieldGroups', pattern: ['FIELD-GROUPS'] },
  { kind: 'Controls', pattern: ['CONTROLS'] },
  { kind: 'Infotypes', pattern: ['INFOTYPES'] },
  { kind: 'Local', pattern: ['LOCAL'] },
  // Control structures
  { kind: 'If', pattern: ['IF'], opens: 'if' },
  { kind: 'ElseIf', pattern: ['ELSEIF'], middle: 'if' },
  { kind: 'Else', pattern: ['ELSE'], middle: 'if' },
  { kind: 'EndIf', pattern: ['ENDIF'], closes: 'if' },
  { kind: 'Case', pattern: ['CASE'], opens: 'case' },
  { kind: 'When', pattern: ['WHEN'], middle: 'case' },
  { kind: 'EndCase', pattern: ['ENDCASE'], closes: 'case' },
  { kind: 'Loop', pattern: ['LOOP'], opens: 'loop' },
  { kind: 'EndLoop', pattern: ['ENDLOOP'], closes: 'loop' },
  { kind: 'Do', pattern: ['DO'], opens: 'do' },
  { kind: 'EndDo', pattern: ['ENDDO'], closes: 'do' },
  { kind: 'While', pattern: ['WHILE'], opens: 'while' },
  { kind: 'EndWhile', pattern: ['ENDWHILE'], closes: 'while' },
  { kind: 'Try', pattern: ['TRY'], opens: 'try' },
  { kind: 'CatchSystemExceptions', pattern: ['CATCH', 'SYSTEM-EXCEPTIONS'], opens: 'catchSystemExceptions' },
  { kind: 'Catch', pattern: ['CATCH'], middle: 'try' },
  { kind: 'Cleanup', pattern: ['CLEANUP'], middle: 'try' },
  { kind: 'EndTry', pattern: ['ENDTRY'], closes: 'try' },
  { kind: 'EndCatch', pattern: ['ENDCATCH'], closes: 'catchSystemExceptions' },
  { kind: 'AtGroup', pattern: ['AT', 'NEW|FIRST|LAST'], opens: 'at' },
  { kind: 'AtGroup', pattern: ['AT', 'END', 'OF'], opens: 'at' },
  { kind: 'AtFieldGroup', pattern: ['AT'], opens: 'at' },
  { kind: 'EndAt', pattern: ['ENDAT'], closes: 'at' },
  { kind: 'OnChange', pattern: ['ON', 'CHANGE', 'OF'], opens: 'onChange' },
  { kind: 'EndOn', pattern: ['ENDON'], closes: 'onChange' },
  { kind: 'Provide', pattern: ['PROVIDE'], opens: 'provide' },
  { kind: 'EndProvide', pattern: ['ENDPROVIDE'], closes: 'provide' },
  { kind: 'SelectLoop', pattern: ['SELECT'], opens: 'select', candidate: true, when: selectMayLoop },
  { kind: 'Select', pattern: ['SELECT'] },
  { kind: 'WithLoop', pattern: ['WITH'], opens: 'select', candidate: true, when: selectMayLoop },
  { kind: 'With', pattern: ['WITH'] },
  { kind: 'EndSelect', pattern: ['ENDSELECT'], closes: 'select' },
  // Leaving and raising
  { kind: 'Check', pattern: ['CHECK'] },
  { kind: 'Exit', pattern: ['EXIT'] },
  { kind: 'Continue', pattern: ['CONTINUE'] },
  { kind: 'Return', pattern: ['RETURN'] },
  { kind: 'Stop', pattern: ['STOP'] },
  { kind: 'Reject', pattern: ['REJECT'] },
  { kind: 'LeaveProgram', pattern: ['LEAVE', 'PROGRAM'] },
  { kind: 'LeaveToTransaction', pattern: ['LEAVE', 'TO', 'TRANSACTION'] },
  { kind: 'LeaveToScreen', pattern: ['LEAVE', 'TO', 'SCREEN'] },
  { kind: 'LeaveToListProcessing', pattern: ['LEAVE', 'TO', 'LIST-PROCESSING'] },
  { kind: 'LeaveScreen', pattern: ['LEAVE', 'SCREEN'] },
  { kind: 'LeaveListProcessing', pattern: ['LEAVE', 'LIST-PROCESSING'] },
  { kind: 'Leave', pattern: ['LEAVE'] },
  { kind: 'RaiseException', pattern: ['RAISE', 'EXCEPTION'] },
  { kind: 'RaiseException', pattern: ['RAISE', 'RESUMABLE', 'EXCEPTION'] },
  { kind: 'RaiseEvent', pattern: ['RAISE', 'EVENT'] },
  { kind: 'RaiseEntityEvent', pattern: ['RAISE', 'ENTITY', 'EVENT'] },
  { kind: 'RaiseShortdump', pattern: ['RAISE', 'SHORTDUMP'] },
  { kind: 'Raise', pattern: ['RAISE'] },
  { kind: 'Resume', pattern: ['RESUME'] },
  { kind: 'Retry', pattern: ['RETRY'] },
  { kind: 'Assert', pattern: ['ASSERT'] },
  { kind: 'BreakPoint', pattern: ['BREAK-POINT|BREAK'] },
  { kind: 'LogPoint', pattern: ['LOG-POINT'] },
  // Calls
  { kind: 'Perform', pattern: ['PERFORM'] },
  { kind: 'CallFunction', pattern: ['CALL', 'FUNCTION'] },
  { kind: 'CallMethod', pattern: ['CALL', 'METHOD'] },
  { kind: 'CallTransaction', pattern: ['CALL', 'TRANSACTION'] },
  { kind: 'CallScreen', pattern: ['CALL', 'SCREEN'] },
  { kind: 'CallSelectionScreen', pattern: ['CALL', 'SELECTION-SCREEN'] },
  { kind: 'CallBadi', pattern: ['CALL', 'BADI'] },
  { kind: 'CallTransformation', pattern: ['CALL', 'TRANSFORMATION'] },
  { kind: 'CallDialog', pattern: ['CALL', 'DIALOG'] },
  { kind: 'CallCustomerFunction', pattern: ['CALL', 'CUSTOMER-FUNCTION'] },
  { kind: 'CallDatabaseProcedure', pattern: ['CALL', 'DATABASE', 'PROCEDURE'] },
  { kind: 'Call', pattern: ['CALL'] },
  { kind: 'Submit', pattern: ['SUBMIT'] },
  { kind: 'GetBadi', pattern: ['GET', 'BADI'] },
  { kind: 'SetHandler', pattern: ['SET', 'HANDLER'] },
  { kind: 'CreateObject', pattern: ['CREATE', 'OBJECT'] },
  { kind: 'CreateData', pattern: ['CREATE', 'DATA'] },
  { kind: 'Message', pattern: ['MESSAGE'] },
  { kind: 'AuthorityCheck', pattern: ['AUTHORITY-CHECK'] },
  // Database, files, RAP
  { kind: 'Insert', pattern: ['INSERT'] },
  { kind: 'InsertReport', pattern: ['INSERT', 'REPORT'] },
  { kind: 'Update', pattern: ['UPDATE'] },
  { kind: 'ModifyEntities', pattern: ['MODIFY', 'ENTITY|ENTITIES'] },
  { kind: 'Modify', pattern: ['MODIFY'] },
  { kind: 'DeleteDataset', pattern: ['DELETE', 'DATASET'] },
  { kind: 'Delete', pattern: ['DELETE'] },
  { kind: 'ReadEntities', pattern: ['READ', 'ENTITY|ENTITIES'] },
  { kind: 'CommitEntities', pattern: ['COMMIT', 'ENTITIES'] },
  { kind: 'RollbackEntities', pattern: ['ROLLBACK', 'ENTITIES'] },
  { kind: 'GetPermissions', pattern: ['GET', 'PERMISSIONS'] },
  { kind: 'SetLocks', pattern: ['SET', 'LOCKS'] },
  { kind: 'CommitWork', pattern: ['COMMIT'] },
  { kind: 'RollbackWork', pattern: ['ROLLBACK'] },
  { kind: 'OpenCursor', pattern: ['OPEN', 'CURSOR'] },
  { kind: 'Fetch', pattern: ['FETCH'] },
  { kind: 'CloseCursor', pattern: ['CLOSE', 'CURSOR'] },
  { kind: 'ExecSql', pattern: ['EXEC', 'SQL'] },
  { kind: 'EndExec', pattern: ['ENDEXEC'] },
  { kind: 'OpenDataset', pattern: ['OPEN', 'DATASET'] },
  { kind: 'CloseDataset', pattern: ['CLOSE', 'DATASET'] },
  { kind: 'ReadDataset', pattern: ['READ', 'DATASET'] },
  { kind: 'Transfer', pattern: ['TRANSFER'] },
  // Data and internal tables
  { kind: 'ReadTable', pattern: ['READ', 'TABLE'] },
  { kind: 'ReadReport', pattern: ['READ', 'REPORT'] },
  { kind: 'ReadLine', pattern: ['READ', 'LINE'] },
  { kind: 'Read', pattern: ['READ'] },
  { kind: 'Append', pattern: ['APPEND'] },
  { kind: 'Collect', pattern: ['COLLECT'] },
  { kind: 'Sort', pattern: ['SORT'] },
  { kind: 'Clear', pattern: ['CLEAR'] },
  { kind: 'Refresh', pattern: ['REFRESH'] },
  { kind: 'Free', pattern: ['FREE'] },
  { kind: 'Describe', pattern: ['DESCRIBE'] },
  { kind: 'MoveCorresponding', pattern: ['MOVE-CORRESPONDING'] },
  { kind: 'Move', pattern: ['MOVE'] },
  { kind: 'Assign', pattern: ['ASSIGN'] },
  { kind: 'Unassign', pattern: ['UNASSIGN'] },
  { kind: 'Concatenate', pattern: ['CONCATENATE'] },
  { kind: 'Split', pattern: ['SPLIT'] },
  { kind: 'Condense', pattern: ['CONDENSE'] },
  { kind: 'Translate', pattern: ['TRANSLATE'] },
  { kind: 'Replace', pattern: ['REPLACE'] },
  { kind: 'Find', pattern: ['FIND'] },
  { kind: 'Search', pattern: ['SEARCH'] },
  { kind: 'Shift', pattern: ['SHIFT'] },
  { kind: 'Overlay', pattern: ['OVERLAY'] },
  { kind: 'Add', pattern: ['ADD'] },
  { kind: 'Subtract', pattern: ['SUBTRACT'] },
  { kind: 'Multiply', pattern: ['MULTIPLY'] },
  { kind: 'Divide', pattern: ['DIVIDE'] },
  { kind: 'Compute', pattern: ['COMPUTE'] },
  { kind: 'GetReference', pattern: ['GET', 'REFERENCE'] },
  { kind: 'GetTime', pattern: ['GET', 'TIME'] },
  { kind: 'GetParameter', pattern: ['GET', 'PARAMETER'] },
  { kind: 'Get', pattern: ['GET'] },
  { kind: 'SetParameter', pattern: ['SET', 'PARAMETER'] },
  { kind: 'SetPfStatus', pattern: ['SET', 'PF-STATUS'] },
  { kind: 'SetTitlebar', pattern: ['SET', 'TITLEBAR'] },
  { kind: 'SetScreen', pattern: ['SET', 'SCREEN'] },
  { kind: 'SetUpdateTask', pattern: ['SET', 'UPDATE', 'TASK'] },
  { kind: 'Set', pattern: ['SET'] },
  { kind: 'Import', pattern: ['IMPORT'] },
  { kind: 'Export', pattern: ['EXPORT'] },
  { kind: 'Wait', pattern: ['WAIT'] },
  { kind: 'Receive', pattern: ['RECEIVE'] },
  { kind: 'Convert', pattern: ['CONVERT'] },
  { kind: 'Pack', pattern: ['PACK'] },
  { kind: 'Unpack', pattern: ['UNPACK'] },
  { kind: 'Generate', pattern: ['GENERATE'] },
  { kind: 'SyntaxCheck', pattern: ['SYNTAX-CHECK'] },
  { kind: 'EditorCall', pattern: ['EDITOR-CALL'] },
  { kind: 'Extract', pattern: ['EXTRACT'] },
  { kind: 'Sum', pattern: ['SUM'] },
  // Lists and dynpro flow logic
  { kind: 'Write', pattern: ['WRITE'] },
  { kind: 'Uline', pattern: ['ULINE'] },
  { kind: 'Skip', pattern: ['SKIP'] },
  { kind: 'NewLine', pattern: ['NEW-LINE'] },
  { kind: 'NewPage', pattern: ['NEW-PAGE'] },
  { kind: 'Format', pattern: ['FORMAT'] },
  { kind: 'Position', pattern: ['POSITION'] },
  { kind: 'Reserve', pattern: ['RESERVE'] },
  { kind: 'Hide', pattern: ['HIDE'] },
  { kind: 'Window', pattern: ['WINDOW'] },
  { kind: 'Scroll', pattern: ['SCROLL'] },
  { kind: 'SuppressDialog', pattern: ['SUPPRESS', 'DIALOG'] },
  { kind: 'Process', pattern: ['PROCESS'] },
  { kind: 'Chain', pattern: ['CHAIN'] },
  { kind: 'EndChain', pattern: ['ENDCHAIN'] },
  { kind: 'Field', pattern: ['FIELD'] },
] as const satisfies readonly KindRow[];

/** Kinds that no table row produces: the shape kinds, macros, native code and the unknown. */
export const SHAPE_KINDS = ['Assignment', 'MethodCall', 'MacroCall', 'NativeSql', 'Unknown'] as const;

export type StatementKind = (typeof ROWS)[number]['kind'] | (typeof SHAPE_KINDS)[number];

export const KIND_TABLE: readonly KindRow[] = ROWS;

export interface KindInfo {
  /** The leading keyword, or null for the shape kinds. */
  keyword: string | null;
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
    opens: row.opens,
    closes: row.closes,
    middle: row.middle,
    candidate: row.candidate,
    event: row.event,
  });
}
for (const kind of SHAPE_KINDS) INFO.set(kind, { keyword: null });

/** What the table says about a kind. */
export function kindInfo(kind: StatementKind): KindInfo {
  return INFO.get(kind) ?? { keyword: null };
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
