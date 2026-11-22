import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { lex } from '../lib/engine4/lexer';
import { statements, type Statement } from '../lib/engine4/statements';
import type { BlockKind } from '../lib/engine4/statement-kinds';
import { blocks, enclosingBlocks, type Block, type BlockTree } from '../lib/engine4/blocks';

/**
 * Engine 4.0, L2 (ADR-125): the block tree. One test per block kind, then
 * branches, event blocks, recovery from every kind of damage, candidates, macro
 * bodies, native SQL and flow logic, and the invariants of the tree over the
 * starter examples and random statement soup. Server-free.
 *
 * `PAIRS` is typed `Record<BlockKind, …>`: a new block kind in the table does
 * not compile until it has a sample here.
 */
function read(src: string): { list: Statement[]; tree: BlockTree } {
  const list = statements(lex(src).tokens);
  return { list, tree: blocks(list) };
}

/** `kind name rows termination` of every block but the program, outermost first, children indented. */
function outline(tree: BlockTree): string[] {
  const out: string[] = [];
  const go = (b: Block, indent: string) => {
    if (b.kind !== 'program') out.push(`${indent}${b.kind}${b.name ? ` ${b.name}` : ''} ${b.start.row}-${b.end.row}${b.termination === 'closer' ? '' : ` ${b.termination}`}`);
    for (const br of b.branches) for (const c of br.children) if (c.type === 'block') go(c.block, b.kind === 'program' ? indent : `${indent}  `);
  };
  go(tree.root, '');
  return out;
}

const codes = (tree: BlockTree) => tree.diagnostics.map((d) => `${d.code}@${d.row}`);

/** Opener and closer of each block kind, on lines 1 and 3, something on line 2. */
const PAIRS: Record<BlockKind, readonly [string, string]> = {
  if: ['IF lv = 1.', 'ENDIF.'],
  case: ['CASE lv.', 'ENDCASE.'],
  loop: ['LOOP AT lt INTO ls.', 'ENDLOOP.'],
  do: ['DO 3 TIMES.', 'ENDDO.'],
  while: ['WHILE lv < 3.', 'ENDWHILE.'],
  try: ['TRY.', 'ENDTRY.'],
  select: ['SELECT * FROM vbak INTO ls UP TO 10 ROWS.', 'ENDSELECT.'],
  at: ['AT NEW vbeln.', 'ENDAT.'],
  provide: ['PROVIDE FIELDS * FROM lt INTO ls VALID lv BOUNDS b AND e BETWEEN x AND y.', 'ENDPROVIDE.'],
  onChange: ['ON CHANGE OF ls-vbeln.', 'ENDON.'],
  catchSystemExceptions: ['CATCH SYSTEM-EXCEPTIONS arithmetic_errors = 4.', 'ENDCATCH.'],
  form: ['FORM read_orders.', 'ENDFORM.'],
  method: ['METHOD run.', 'ENDMETHOD.'],
  module: ['MODULE status_0100 OUTPUT.', 'ENDMODULE.'],
  function: ['FUNCTION z_order_read.', 'ENDFUNCTION.'],
  class: ['CLASS lcl_app IMPLEMENTATION.', 'ENDCLASS.'],
  interface: ['INTERFACE lif_app.', 'ENDINTERFACE.'],
  define: ['DEFINE add_line.', 'END-OF-DEFINITION.'],
  enhancement: ['ENHANCEMENT 1 zenh_order.', 'ENDENHANCEMENT.'],
  enhancementSection: ['ENHANCEMENT-SECTION es_01 SPOTS es_order.', 'END-ENHANCEMENT-SECTION.'],
  testSeam: ['TEST-SEAM db_read.', 'END-TEST-SEAM.'],
  testInjection: ['TEST-INJECTION db_read.', 'END-TEST-INJECTION.'],
};

test.describe('L2: one block per kind', () => {
  for (const [kind, [opener, closer]] of Object.entries(PAIRS)) {
    test(`${kind}: ${opener} … ${closer}`, () => {
      const host = kind === 'method' ? ['CLASS lcl IMPLEMENTATION.', 'ENDCLASS.'] : null;
      const src = [host?.[0], opener, '  CLEAR lv.', closer, host?.[1]].filter((l) => l !== undefined).join('\n');
      const { tree } = read(src);
      const b = tree.blocks.find((x) => x.kind === kind) as Block;
      expect(b, src).toBeTruthy();
      const at = host ? 2 : 1;
      expect([b.start.row, b.end.row, b.termination]).toEqual([at, at + 2, 'closer']);
      expect(b.branches[0].children).toEqual([{ type: 'statement', index: b.opener as number + 1 }]);
      expect(tree.diagnostics).toEqual([]);
    });
  }
});

test.describe('L2: branches and nesting', () => {
  test('IF, ELSEIF, ELSE are three branches; heads and closer are not children', () => {
    const { tree, list } = read('IF a = 1.\n  x = 1.\nELSEIF a = 2.\n  x = 2.\n  y = 2.\nELSE.\nENDIF.');
    const b = tree.blocks[1];
    expect(b.branches.map((br) => [list[br.head as number].kind, br.first, br.last, br.children.length])).toEqual([
      ['If', 0, 1, 1],
      ['ElseIf', 2, 4, 2],
      ['Else', 5, 5, 0],
    ]);
    expect(b.closer).toBe(6);
  });

  test('CASE with WHEN branches, TRY with CATCH and CLEANUP', () => {
    const { tree, list } = read('CASE a.\n  WHEN 1.\n    x = 1.\n  WHEN OTHERS.\nENDCASE.\nTRY.\n  run( ).\nCATCH cx_a.\nCLEANUP.\nENDTRY.');
    const heads = (b: Block) => b.branches.map((br) => list[br.head as number].kind);
    expect(heads(tree.blocks[1])).toEqual(['Case', 'When', 'When']);
    expect(heads(tree.blocks[2])).toEqual(['Try', 'Catch', 'Cleanup']);
  });

  test('nesting: the enclosing chain of a statement, and every statement has one owner', () => {
    const { tree } = read('FORM f.\n  LOOP AT lt INTO ls.\n    IF ls-a = 1.\n      x = 1.\n    ENDIF.\n  ENDLOOP.\nENDFORM.');
    expect(outline(tree)).toEqual(['form F 1-7', '  loop 2-6', '    if 3-5']);
    expect(enclosingBlocks(tree, 3).map((b) => b.kind)).toEqual(['form', 'loop', 'if']);
    expect(enclosingBlocks(tree, 1).map((b) => b.kind)).toEqual(['form', 'loop']);
    expect(enclosingBlocks(tree, 4).map((b) => b.kind)).toEqual(['form', 'loop', 'if']);
    expect(tree.blocks.map((b) => b.depth)).toEqual([0, 1, 2, 3]);
  });

  test('names: routines, classes, interface methods, events as written', () => {
    const src = [
      'AT SELECTION-SCREEN OUTPUT.', 'START-OF-SELECTION.', 'FORM read_orders.', 'ENDFORM.',
      'CLASS lcl DEFINITION.', 'ENDCLASS.', 'CLASS lcl IMPLEMENTATION.', 'METHOD zif_order~run.', 'ENDMETHOD.', 'ENDCLASS.',
    ].join('\n');
    expect(read(src).tree.blocks.slice(1).map((b) => `${b.kind}:${b.name}`)).toEqual([
      'event:AT SELECTION-SCREEN', 'event:START-OF-SELECTION', 'form:READ_ORDERS', 'class:LCL', 'class:LCL', 'method:ZIF_ORDER~RUN',
    ]);
  });
});

test.describe('L2: event blocks end at the next event or routine', () => {
  test('an event block runs to the next event, to a FORM, or to the end, without a diagnostic', () => {
    const src = [
      'REPORT z.', 'DATA gv TYPE i.', 'INITIALIZATION.', '  gv = 1.', 'START-OF-SELECTION.', '  PERFORM f.',
      '  IF gv = 1.', '  ENDIF.', 'FORM f.', 'ENDFORM.', 'END-OF-SELECTION.', '  WRITE gv.',
    ].join('\n');
    const { tree } = read(src);
    expect(outline(tree)).toEqual([
      'event INITIALIZATION 3-4 implicit',
      'event START-OF-SELECTION 5-8 implicit',
      '  if 7-8',
      'form F 9-10',
      'event END-OF-SELECTION 11-12 implicit',
    ]);
    expect(tree.diagnostics).toEqual([]);
  });

  test('a CLASS and a MODULE end an event block too; a DEFINE does not', () => {
    const src = ['START-OF-SELECTION.', '  DEFINE m.', '    WRITE &1.', '  END-OF-DEFINITION.', '  m 1.', 'CLASS c IMPLEMENTATION.', 'ENDCLASS.'].join('\n');
    expect(outline(read(src).tree)).toEqual(['event START-OF-SELECTION 1-5 implicit', '  define M 2-4', 'class C 6-7']);
  });

  test('an unclosed IF in an event block ends at the next event, flagged', () => {
    const { tree } = read('START-OF-SELECTION.\n  IF a = 1.\n    x = 1.\nEND-OF-SELECTION.\n  y = 1.');
    expect(outline(tree)).toEqual(['event START-OF-SELECTION 1-3 implicit', '  if 2-3 unclosed', 'event END-OF-SELECTION 4-5 implicit']);
    expect(codes(tree)).toEqual(['unclosed-block@2']);
    expect(tree.diagnostics[0].message).toBe('IF on line 2 has no ENDIF; the block ends before line 4.');
  });
});

test.describe('L2: recovery', () => {
  test('a missing ENDIF: the IF ends where the LOOP around it closes', () => {
    const { tree } = read('LOOP AT lt INTO ls.\n  IF ls-a = 1.\n    x = 1.\nENDLOOP.\nWRITE x.');
    expect(outline(tree)).toEqual(['loop 1-4', '  if 2-3 unclosed']);
    expect(codes(tree)).toEqual(['unclosed-block@2']);
  });

  test('a missing ENDFORM: the FORM ends before the next FORM, which is not nested in it', () => {
    const { tree } = read('FORM a.\n  x = 1.\nFORM b.\n  y = 1.\nENDFORM.');
    expect(outline(tree)).toEqual(['form A 1-2 unclosed', 'form B 3-5']);
    expect(codes(tree)).toEqual(['unclosed-block@1']);
  });

  test('a missing ENDMETHOD: the method ends before the next METHOD; the class is intact', () => {
    const { tree } = read('CLASS c IMPLEMENTATION.\n  METHOD a.\n    x = 1.\n  METHOD b.\n  ENDMETHOD.\nENDCLASS.');
    expect(outline(tree)).toEqual(['class C 1-6', '  method A 2-3 unclosed', '  method B 4-5']);
  });

  test('a missing ENDCLASS of a definition: the implementation is not nested in it', () => {
    const { tree } = read('CLASS c DEFINITION.\n  PUBLIC SECTION.\nCLASS c IMPLEMENTATION.\nENDCLASS.');
    expect(outline(tree)).toEqual(['class C 1-2 unclosed', 'class C 3-4']);
  });

  test('an unclosed IF before a FORM ends before the FORM', () => {
    const { tree } = read('START-OF-SELECTION.\n  IF a = 1.\nFORM f.\nENDFORM.');
    expect(outline(tree)).toEqual(['event START-OF-SELECTION 1-2 implicit', '  if 2-2 unclosed', 'form F 3-4']);
  });

  test('blocks still open at the end close there, flagged, innermost last', () => {
    const { tree } = read('FORM f.\n  DO.\n    x = 1.');
    expect(outline(tree)).toEqual(['form F 1-3 unclosed', '  do 2-3 unclosed']);
    expect(codes(tree)).toEqual(['unclosed-block@1', 'unclosed-block@2']);
    expect(tree.diagnostics[0].message).toBe('FORM on line 1 has no ENDFORM; the block ends at the end of the source.');
  });

  test('a stray closer or middle is a leaf with a diagnostic, and its neighbours are untouched', () => {
    const { tree } = read('IF a = 1.\n  x = 1.\nENDIF.\nENDIF.\nELSE.\nWHEN 1.\nLOOP AT lt INTO ls.\nENDLOOP.');
    expect(outline(tree)).toEqual(['if 1-3', 'loop 7-8']);
    expect(codes(tree)).toEqual(['unexpected-closer@4', 'unexpected-middle@5', 'unexpected-middle@6']);
    expect(tree.root.branches[0].children.filter((c) => c.type === 'statement').map((c) => (c.type === 'statement' ? c.index : -1))).toEqual([3, 4, 5]);
  });

  test('a closer takes the nearest block of its kind; the blocks above it are flagged', () => {
    const { tree } = read('IF a = 1.\n  LOOP AT lt INTO ls.\n    DO.\nENDIF.\nENDLOOP.');
    expect(outline(tree)).toEqual(['if 1-4', '  loop 2-3 unclosed', '    do 3-3 unclosed']);
    expect(codes(tree)).toEqual(['unclosed-block@2', 'unclosed-block@3', 'unexpected-closer@5']);
  });

  test('indentation decides which block lost its closer: a deleted inner ENDLOOP flags the inner LOOP', () => {
    const src = 'LOOP AT a INTO x.\n  LOOP AT b INTO y.\n    z = 1.\n  w = 2.\nENDLOOP.';
    const { tree } = read(src);
    expect(outline(tree)).toEqual(['loop 1-5', '  loop 2-4 unclosed']);
    expect(codes(tree)).toEqual(['unclosed-block@2']);
  });

  test('without matching indentation the nearest block takes the closer', () => {
    const { tree } = read('LOOP AT a INTO x.\nLOOP AT b INTO y.\nz = 1.\n  ENDLOOP.');
    expect(outline(tree)).toEqual(['loop 1-4 unclosed', '  loop 2-4']);
  });

  test('a DEFINE inside an open macro body ends that body, flagged', () => {
    const { tree, list } = read('DEFINE a.\n  WRITE &1.\nDEFINE b.\n  WRITE &1.\nEND-OF-DEFINITION.\nIF x = 1.\nENDIF.');
    expect(list.map((s) => s.context)).toEqual(['abap', 'macro', 'abap', 'macro', 'abap', 'abap', 'abap']);
    expect(outline(tree)).toEqual(['define A 1-2 unclosed', 'define B 3-5', 'if 6-7']);
  });

  test('ADR-134 Q5: a macro body that lost its END-OF-DEFINITION ends at the first routine boundary', () => {
    const src = ['CLASS c IMPLEMENTATION.', '  METHOD a.', '    DEFINE m.', '      WRITE &1.', '      CLEAR &2.', '  ENDMETHOD.', '  METHOD b.', '    IF x = 1.', '    ENDIF.', '  ENDMETHOD.', 'ENDCLASS.'].join('\n');
    const { tree, list } = read(src);
    expect(list.map((s) => s.context)).toEqual(['abap', 'abap', 'abap', 'macro', 'macro', 'abap', 'abap', 'abap', 'abap', 'abap', 'abap']);
    expect(outline(tree)).toEqual(['class C 1-11', '  method A 2-6', '    define M 3-5 unclosed', '  method B 7-10', '    if 8-9']);
    expect(codes(tree)).toEqual(['unclosed-block@3']);
  });

  test('ADR-134 Q5: … or at the first line that starts at or left of the DEFINE column', () => {
    const src = ['FORM f.', '  DEFINE m.', '    WRITE &1.', '  IF x = 1.', '  ENDIF.', 'ENDFORM.'].join('\n');
    const { tree, list } = read(src);
    expect(list.map((s) => s.context)).toEqual(['abap', 'abap', 'macro', 'abap', 'abap', 'abap']);
    expect(outline(tree)).toEqual(['form F 1-6', '  define M 2-3 unclosed', '  if 4-5']);
    // A body on the DEFINE's own line, and body lines indented deeper, stay macro text.
    const one = read('DEFINE m. WRITE &1. END-OF-DEFINITION.\nm 1.');
    expect(one.list.map((s) => s.context)).toEqual(['abap', 'macro', 'abap', 'abap']);
    expect(one.tree.diagnostics).toEqual([]);
  });

  test('ADR-134 Q6: a file that balances is read as the compiler reads it, whatever its indentation', () => {
    // The ENDLOOP in column 1 closes the inner LOOP (the nearest), though the outer one stands in column 1.
    const { tree } = read('LOOP AT a INTO x.\n  LOOP AT b INTO y.\n    z = 1.\nENDLOOP.\n    w = 2.\n  ENDLOOP.');
    expect(outline(tree)).toEqual(['loop 1-6', '  loop 2-4']);
    expect(tree.diagnostics).toEqual([]);
  });

  test('ADR-134 Q6: indentation decides only inside the routine where the nearest reading found damage', () => {
    const src = [
      'FORM ok.', '  LOOP AT a INTO x.', '    LOOP AT b INTO y.', '  ENDLOOP.', '    ENDLOOP.', 'ENDFORM.',
      'FORM bad.', '  LOOP AT a INTO x.', '    LOOP AT b INTO y.', '      z = 1.', '  ENDLOOP.', 'ENDFORM.',
    ].join('\n');
    const { tree } = read(src);
    expect(outline(tree)).toEqual(['form OK 1-6', '  loop 2-5', '    loop 3-4', 'form BAD 7-12', '  loop 8-11', '    loop 9-10 unclosed']);
    expect(codes(tree)).toEqual(['unclosed-block@9']);
  });

  test('ADR-134 Q9: only GET <node> is an event block; the other GET forms are statements', () => {
    const src = ['NODES peras.', 'START-OF-SELECTION.', '  GET CURSOR FIELD f.', '  GET BIT 1 OF h INTO b.', 'GET peras.', '  WRITE 1.', 'GET peras LATE.', '  WRITE 2.', 'GET pernr FIELDS pernr-pernr.', 'END-OF-SELECTION.'].join('\n');
    const { tree, list } = read(src);
    expect(list.map((s) => s.kind)).toEqual(['Nodes', 'StartOfSelection', 'GetCursor', 'GetBit', 'GetNode', 'Write', 'GetNode', 'Write', 'GetNode', 'EndOfSelection']);
    expect(outline(tree)).toEqual([
      'event START-OF-SELECTION 2-4 implicit', 'event GET 5-6 implicit', 'event GET 7-8 implicit', 'event GET 9-9 implicit', 'event END-OF-SELECTION 10-10 implicit',
    ]);
    expect(tree.diagnostics).toEqual([]);
  });

  test('a control closer does not reach across an enhancement around it', () => {
    const { tree } = read('IF a = 1.\n  ENHANCEMENT 1 zenh.\n    ENDIF.\n  ENDENHANCEMENT.\nENDIF.');
    expect(outline(tree)).toEqual(['if 1-5', '  enhancement 2-4']);
    expect(codes(tree)).toEqual(['unexpected-closer@3']);
  });

  test('a METHOD outside a class stands at program level with an info, so a pasted method still reads', () => {
    const { tree } = read('METHOD run.\n  IF a = 1.\n  ENDIF.\nENDMETHOD.');
    expect(outline(tree)).toEqual(['method RUN 1-4', '  if 2-3']);
    expect(tree.diagnostics.map((d) => [d.code, d.severity])).toEqual([['block-outside-container', 'info']]);
  });
});

test.describe('L2: candidates, macros, native SQL, flow logic', () => {
  test('a SELECT closed by ENDSELECT is a block; one without ENDSELECT is dropped in silence', () => {
    const { tree } = read('FORM f.\n  SELECT * FROM vbak INTO ls.\n  ENDSELECT.\n  SELECT * FROM vbap INTO ls2 WHERE vbeln = lv.\n  x = 1.\nENDFORM.');
    expect(outline(tree)).toEqual(['form F 1-6', '  select 2-3']);
    expect(tree.diagnostics).toEqual([]);
    expect(tree.blocks[0].branches[0].children).toHaveLength(1);
  });

  test('an aggregate SELECT inside a SELECT loop does not take the loop\'s ENDSELECT', () => {
    const { tree, list } = read('SELECT * FROM vbak INTO ls.\n  SELECT COUNT(*) FROM vbap WHERE vbeln = ls-vbeln.\n  SELECT SUM( netwr ) AS s FROM vbap INTO lv.\nENDSELECT.');
    expect(list.map((s) => s.kind)).toEqual(['SelectLoop', 'Select', 'Select', 'EndSelect']);
    expect(outline(tree)).toEqual(['select 1-4']);
  });

  test('aggregates with GROUP BY, and the FIELDS form, read as the language reads them', () => {
    const kinds = (src: string) => read(src).list.map((s) => s.kind);
    expect(kinds('SELECT kunnr, COUNT(*) FROM vbak INTO (@a, @b) GROUP BY kunnr.')).toEqual(['SelectLoop']);
    expect(kinds('SELECT COUNT(*) FROM vbak INTO @lv GROUP BY kunnr.')).toEqual(['SelectLoop']);
    expect(kinds('SELECT FROM vbak FIELDS MAX( netwr ) WHERE x = 1 INTO @lv.')).toEqual(['Select']);
    expect(kinds('SELECT FROM vbak FIELDS vbeln WHERE x = 1 INTO @ls.')).toEqual(['SelectLoop']);
  });

  test('a macro body is leaves: an IF in it opens nothing and is not unclosed', () => {
    const { tree } = read('DEFINE check_it.\n  IF &1 IS INITIAL.\n    RETURN.\nEND-OF-DEFINITION.\ncheck_it lv.\nENDIF.');
    expect(outline(tree)).toEqual(['define CHECK_IT 1-4']);
    expect(codes(tree)).toEqual(['unexpected-closer@6']);
  });

  test('native SQL is one leaf; its words open nothing', () => {
    const { tree } = read('FORM f.\n  EXEC SQL.\n    SELECT a FROM b WHERE c = :d\n  ENDEXEC.\nENDFORM.');
    expect(outline(tree)).toEqual(['form F 1-5']);
    expect(tree.blocks[1].branches[0].children).toHaveLength(3);
  });

  test('in dynpro flow logic MODULE calls a module and opens nothing', () => {
    const { tree } = read('PROCESS BEFORE OUTPUT.\n  MODULE status_0100.\nPROCESS AFTER INPUT.\n  MODULE user_command_0100.');
    expect(outline(tree)).toEqual([]);
    expect(tree.diagnostics).toEqual([]);
  });

  test('AT <field group> is a block, AT SELECTION-SCREEN an event', () => {
    const { tree } = read('AT SELECTION-SCREEN.\n  LOOP.\n    AT header.\n      WRITE x.\n    ENDAT.\n  ENDLOOP.');
    expect(outline(tree)).toEqual(['event AT SELECTION-SCREEN 1-6 implicit', '  loop 2-6', '    at 3-5']);
  });
});

/** Tree invariants: proper nesting, every statement in exactly one place, owners consistent. */
function checkInvariants(list: Statement[], tree: BlockTree): void {
  const seen = new Int32Array(list.length);
  const visit = (b: Block) => {
    expect(b.first).toBeLessThanOrEqual(Math.max(b.last, b.first));
    if (b.opener !== null) { seen[b.opener] += 1; expect(tree.owner[b.opener]).toBe(b.id); }
    if (b.closer !== null) { seen[b.closer] += 1; expect(b.closer).toBe(b.last); }
    for (const [k, br] of b.branches.entries()) {
      if (k > 0) { seen[br.head as number] += 1; expect(br.first).toBe(b.branches[k - 1].last + 1); }
      for (const c of br.children) {
        const at = c.type === 'statement' ? c.index : (c.block.opener as number);
        expect(at).toBeGreaterThanOrEqual(br.first);
        expect(at).toBeLessThanOrEqual(br.last);
        if (c.type === 'statement') { seen[c.index] += 1; expect(tree.owner[c.index]).toBe(b.id); }
        else {
          expect(c.block.parent).toBe(b);
          expect(c.block.last).toBeLessThanOrEqual(br.last);
          visit(c.block);
        }
      }
    }
  };
  visit(tree.root);
  expect([...seen].every((n) => n === 1)).toBe(true);
}

test.describe('L2: invariants, determinism, speed', () => {
  const starters = () => {
    const dir = join(__dirname, '..', 'public', 'starter-examples');
    return readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);
  };

  test('starter examples: proper tree, no diagnostics, same tree twice', () => {
    for (const [name, src] of starters()) {
      const { list, tree } = read(src);
      checkInvariants(list, tree);
      expect(tree.diagnostics, name).toEqual([]);
      expect(outline(blocks(list))).toEqual(outline(tree));
    }
  });

  test('random statement soup: never throws, the tree stays proper', () => {
    const vocabulary = [
      ...Object.values(PAIRS).flat(), 'ELSE.', 'ELSEIF b = 1.', 'WHEN 1.', 'CATCH cx.', 'CLEANUP.', 'START-OF-SELECTION.',
      'AT SELECTION-SCREEN.', 'CLASS c DEFINITION.', 'PROCESS BEFORE OUTPUT.', 'MODULE m.', 'x = 1.', 'WRITE x.', 'SELECT COUNT(*) FROM t.',
      'EXEC SQL.', 'ENDEXEC.', 'CLASS c DEFINITION DEFERRED.', 'INTERFACE i LOAD.',
    ];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    for (let n = 0; n < 300; n++) {
      const src = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => vocabulary[Math.floor(rnd() * vocabulary.length)]).join('\n');
      const { list, tree } = read(src);
      checkInvariants(list, tree);
    }
  });

  test('ADR-134 Q6: random indentation changes nothing on code that balances', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
    for (const [name, src] of starters()) {
      // Shift every line that does not start a comment or continue a literal by 0-12 columns.
      const shaken = src.split('\n').map((line) => (/^\*/.test(line) ? line : ' '.repeat(Math.floor(rnd() * 13)) + line.trimStart())).join('\n');
      const { tree } = read(shaken);
      expect(tree.diagnostics, name).toEqual([]);
      expect(outline(tree).map((l) => l.replace(/ \d+-\d+/, '')), name).toEqual(outline(read(src).tree).map((l) => l.replace(/ \d+-\d+/, '')));
    }
  });

  test('upper and lower case read the same tree', () => {
    for (const [, src] of starters()) {
      const sig = (s: string) => outline(read(s).tree).join('\n').toUpperCase();
      const lower = src.replace(/^[^*"'`|]*$/gm, (line) => line.toLowerCase());
      expect(sig(lower)).toEqual(sig(src));
    }
  });

  test('deep nesting and long stray runs stay linear and never overflow the stack', () => {
    const deep = `${'IF a = 1.\n'.repeat(20000)}${'ENDIF.\n'.repeat(20000)}`;
    const strays = `${'IF a = 1.\n'.repeat(20000)}${'ENDLOOP.\n'.repeat(20000)}`;
    for (const src of [deep, strays]) {
      const list = statements(lex(src).tokens);
      const t0 = Date.now();
      const tree = blocks(list);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(tree.blocks.length).toBe(20001);
    }
    const tree = blocks(statements(lex(deep).tokens));
    expect(tree.blocks[20000].depth).toBe(20000);
    expect(tree.diagnostics).toEqual([]);
  });
});
