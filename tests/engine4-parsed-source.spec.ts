import { test, expect } from '@playwright/test';
import { parseSource } from '../lib/engine4/parsed-source';
import { maskLiterals, maskNonCode } from '../lib/abap/statement-reader';
import { runParsedShadow, runParsedDamageShadow, runParsedEdgeShadow } from '../scripts/engine4/shadow-parsed';

/**
 * Engine 4.0, Phase 0 "parse once" (ADR-125 (4); docs/design/engine4.md,
 * "Phase 0"). `parseSource` is on the product path: the parse-once scope of
 * `lib/abap/statement-reader.ts` reads it (ADR-133; QA 88ca06da5ca3). These
 * tests are the proof that wiring rests on — that the statement view,
 * the masks and the container index it hands a reader are the shipping
 * engine's own, so moving a reader onto it moves no output.
 */
test('on the corpus the parsed source is the shipping reading, field for field', () => {
  const r = runParsedShadow();
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.statements).toBeGreaterThanOrEqual(18000);
  const failures = r.samples.map((s) => `${s.file} ${s.check}\n  old ${s.old}\n  new ${s.new}`);
  expect(failures).toEqual([]);
  expect(r.statementsIdentical).toBe(r.files);
  expect(r.masksIdentical).toBe(r.statements);
  expect(r.maskNonCodeIdentical).toBe(r.files);
  expect(r.maskCommentsIdentical).toBe(r.files);
  expect(r.containersIdentical).toBe(r.files);
  expect(r.containerAtIdentical).toBe(r.files);
});

test('on damaged code statements and masks stay the shipping ones, and containers differ only where L2 recovered', () => {
  const r = runParsedDamageShadow();
  expect(r.files).toBeGreaterThanOrEqual(950);
  // The one exception: an AMDP method that lost its ENDMETHOD (BM-258), where the
  // shipping reader stops reading the body as native code. Damaged input only.
  expect(r.statementsIdentical).toBeGreaterThanOrEqual(r.files - 1);
  expect(r.masksIdentical).toBe(r.masksCompared);
  expect(r.maskNonCodeIdentical).toBe(r.files);
  expect(r.containersIdenticalUnrecovered).toBe(r.files - r.recovered);
});

test('the known divergences outside the corpus are exactly these', () => {
  const differing = Object.fromEntries(Object.entries(runParsedEdgeShadow()).filter(([, checks]) => checks.length));
  expect(differing).toEqual({
    // Engine review §2.4: the shipping reader ends the statement in the wrong place. L1 is right.
    'template-expression-across-lines': ['statements:text', 'maskNonCode'],
    // Damaged input: the shipping mask runs an open literal on into the next statement.
    'unterminated-literal': ['maskLiterals'],
    // Engine review §2.4: `CLASS … DEFINITION LOCAL FRIENDS` opens no class. L2 is right.
    'class-local-friends': ['containers', 'containerAt'],
  });
});

test('masks are derived from the token kinds: contents blanked, delimiters kept, offsets kept', () => {
  const src = "WRITE 'a.b' && `c` && |x{ y }z|. \" note's\nDATA(t) = |plain|.";
  const p = parseSource(src);
  expect(p.compat.map((s) => s.text)).toEqual(["WRITE 'a.b' && `c` && |x{ y }z|", 'DATA(t) = |plain|']);
  expect(p.maskedText(0)).toBe("WRITE '   ' && ` ` && |       |");
  expect(p.maskedText(1)).toBe('DATA(t) = |     |');
  expect(p.maskNonCode()).toBe("WRITE '   ' && ` ` && |       |.         \nDATA(t) = |     |.");
  expect(p.maskComments()).toBe("WRITE 'a.b' && `c` && |x{ y }z|.         \nDATA(t) = |plain|.");
});

test('a literal with an astral character is masked to its full length, as the shipping mask does (QA 188cda29e6b5)', () => {
  const src = "x = '\u{1F600}'.\ny = `\u{1F600}\u{1F600}`.\n";
  expect(parseSource(src).maskNonCode()).toBe("x = '  '.\ny = `    `.\n");
  expect(parseSource(src).maskNonCode()).toBe(maskNonCode(src));
});

test('the mask of a statement keeps every UTF-16 unit of an astral literal, as maskLiterals does (QA e495a5d09166)', () => {
  const src = "SELECT '\u{1F600}' AS note FROM vbak INTO TABLE @DATA(rows).\n";
  const p = parseSource(src);
  expect(p.maskedText(0)).toHaveLength(p.compat[0].text.length);
  expect(p.maskedText(0)).toBe(maskLiterals(p.compat[0].text));
});

test('the container index answers containerAt by lookup, a routine before its event block', () => {
  const src = ['REPORT z.', 'START-OF-SELECTION.', '  PERFORM f.', 'FORM f.', '  WRITE 1.', 'ENDFORM.'].join('\n');
  const p = parseSource(src);
  expect(p.containers.map((c) => `${c.kind}:${c.name}:${c.lineStart}-${c.lineEnd}`)).toEqual(['event:START-OF-SELECTION:2-3', 'form:F:4-6']);
  expect(p.containerAt(1)).toBeNull();
  expect(p.containerAt(3)?.name).toBe('START-OF-SELECTION');
  expect(p.containerAt(5)?.name).toBe('F');
  expect(p.recovered).toBe(false);
  expect(parseSource('FORM f.\n  IF a = 1.\nENDFORM.').recovered).toBe(true);
});

test('nothing a knowledge-based reader looks at is lost: comments, pragmas, literal texts and qualified names stay in the tokens', () => {
  const src = "CALL FUNCTION 'BAPI_PO_CREATE1' ##NEEDED \" create the order\n  EXPORTING poheader = ls-header.\nlo_x->m( ). cl_y=>z( ).";
  const p = parseSource(src);
  const kinds = new Set(p.tokens.map((t) => `${t.kind}:${t.text}`));
  expect(kinds.has("textLiteral:'BAPI_PO_CREATE1'")).toBe(true);
  expect(kinds.has('pragma:##NEEDED')).toBe(true);
  expect(kinds.has('comment:" create the order')).toBe(true);
  expect(p.compat[0].text).toBe("CALL FUNCTION 'BAPI_PO_CREATE1' ##NEEDED EXPORTING poheader = ls-header");
  expect(p.statements[0].kind).toBe('CallFunction');
  // The shipping keyword rule (`^[A-Za-z][\w-]*`), kept as it is: `lo_x->m( )` gives `LO_X-`.
  expect(p.compat.map((s) => s.keyword)).toEqual(['CALL', 'LO_X-', 'CL_Y']);
});
