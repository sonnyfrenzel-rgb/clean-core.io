import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { lex } from '../lib/engine4/lexer';
import { statements, type Statement } from '../lib/engine4/statements';
import { kindInfo } from '../lib/engine4/statement-kinds';
import type { Token } from '../lib/engine4/tokens';

/**
 * Engine 4.0 (ADR-125): the three lexical defect classes of the engine review
 * §2.4 as acceptance tests, and metamorphic checks — a change of case, of line
 * breaks or of chaining must not change what L1 reads. Server-free.
 */
const read = (src: string): Statement[] => statements(lex(src).tokens);
const texts = (list: Statement[]) => list.map((s) => `${s.kind} ${s.tokens.map((t) => t.text).join(' ')}`);

/** Openers minus closers per block kind; all zero for a balanced source. */
function balance(list: Statement[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of list) {
    if (s.context !== 'abap') continue;
    const info = kindInfo(s.kind);
    if (info.opens && !info.candidate) out[info.opens] = (out[info.opens] ?? 0) + 1;
    if (info.closes && info.closes !== 'select') out[info.closes] = (out[info.closes] ?? 0) - 1;
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0));
}

test.describe('lexical defect classes of the engine review §2.4', () => {
  test('CLASS … DEFINITION LOCAL FRIENDS opens no block', () => {
    const list = read(`CLASS ltc_order DEFINITION DEFERRED.
CLASS zcl_order DEFINITION LOCAL FRIENDS ltc_order.
CLASS ltc_order DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS run FOR TESTING.
ENDCLASS.
CLASS ltc_order IMPLEMENTATION.
  METHOD run.
  ENDMETHOD.
ENDCLASS.`);
    expect(list[1].kind).toBe('ClassLocalFriends');
    expect(kindInfo(list[1].kind).opens).toBeUndefined();
    expect(balance(list)).toEqual({});
  });

  test('INTERFACE … LOAD opens no block', () => {
    const list = read(`INTERFACE zif_order LOAD.
INTERFACE lif_local.
  METHODS run.
ENDINTERFACE.`);
    expect(list.map((s) => s.kind)).toEqual(['InterfaceLoad', 'Interface', 'Methods', 'EndInterface']);
    expect(balance(list)).toEqual({});
  });

  test('a string template whose embedded expression breaks across lines keeps its literal state', () => {
    const src = `lv_text = |Total: { COND string( WHEN lv_a = 1
                                   THEN \`one. two: three, four\`
                                   ELSE |inner { lv_b }.| ) }, done.|.
WRITE: / lv_text, lv_b.
IF lv_a = 1.
ENDIF.`;
    const { tokens, diagnostics } = lex(src);
    expect(diagnostics).toEqual([]);
    const list = statements(tokens);
    expect(list.map((s) => [s.kind, s.start.row, s.end.row, s.chain?.index ?? null])).toEqual([
      ['Assignment', 1, 3, null],
      ['Write', 4, 4, 0],
      ['Write', 4, 4, 1],
      ['If', 5, 5, null],
      ['EndIf', 6, 6, null],
    ]);
    expect(balance(list)).toEqual({});
  });
});

/** The source with every word token re-cased; literals and comments untouched. */
function recase(src: string, tokens: Token[], f: (s: string) => string): string {
  let out = '';
  let at = 0;
  for (const t of tokens) {
    if (t.kind !== 'word') continue;
    out += src.slice(at, t.offset) + f(t.text);
    at = t.offset + t.text.length;
  }
  return out + src.slice(at);
}

/** The source with the blank before every eligible token replaced by a line break and an indent. */
function rebreak(src: string, tokens: Token[]): string {
  const skipRows = new Set<number>();
  for (const s of statements(tokens)) {
    if (s.context === 'native' || ['ExecSql', 'EndExec', 'MethodAmdp', 'EndMethod'].includes(s.kind)) {
      for (let r = s.start.row; r <= s.end.row + 1; r++) skipRows.add(r);
    }
  }
  let out = '';
  let at = 0;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    if (!t.spaceBefore || t.row !== prev.row || skipRows.has(t.row)) continue;
    if (t.kind === 'comment' || t.kind === 'pseudoComment' || prev.kind === 'comment') continue;
    const gapStart = prev.offset + prev.text.length;
    out += src.slice(at, gapStart) + '\n    ';
    at = t.offset;
  }
  return out + src.slice(at);
}

const sig = (list: Statement[]) =>
  list.map((s) => `${s.kind}|${s.context}|${s.chain?.index ?? '-'}|${s.tokens.map((t) => (t.kind === 'word' ? t.text.toUpperCase() : t.text)).join(' ')}`);

function corpus(): Array<[string, string]> {
  const dir = join(__dirname, '..', 'public', 'starter-examples');
  return readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), 'utf8')]);
}

test.describe('metamorphic: what L1 reads does not depend on case, line breaks or chaining', () => {
  for (const [name, src] of corpus()) {
    test(`${name}: upper case, lower case and broken lines read the same statements`, () => {
      const { tokens } = lex(src);
      const base = sig(statements(tokens));
      expect(sig(read(recase(src, tokens, (w) => w.toUpperCase())))).toEqual(base);
      expect(sig(read(recase(src, tokens, (w) => w.toLowerCase())))).toEqual(base);
      expect(sig(read(rebreak(src, tokens)))).toEqual(base);
    });
  }

  test('every chained part reads as the unchained statement head + part', () => {
    let parts = 0;
    for (const [, src] of corpus()) {
      for (const s of read(src)) {
        if (!s.chain) continue;
        parts += 1;
        // Blanks only where the source had them: `TYPE-POOLS` must stay one word.
        const single = read(`${s.tokens.map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text).join('')}.`);
        expect(single).toHaveLength(1);
        expect(single[0].kind, s.tokens.map((t) => t.text).join(' ')).toBe(s.kind);
      }
    }
    expect(parts).toBeGreaterThan(100);
  });

  test('chained and unchained forms of the same statements read the same', () => {
    const pairs: Array<[string, string]> = [
      ['DATA: a TYPE i, b TYPE string.', 'DATA a TYPE i. DATA b TYPE string.'],
      ['PERFORM: read, check USING x, save.', 'PERFORM read. PERFORM check USING x. PERFORM save.'],
      ["WRITE: / 'a', lv.", "WRITE / 'a'. WRITE lv."],
      ['CLEAR: ls, lt, <fs>.', 'CLEAR ls. CLEAR lt. CLEAR <fs>.'],
      ['MOVE: a TO b, c TO d.', 'MOVE a TO b. MOVE c TO d.'],
    ];
    const plain = (list: Statement[]) => texts(list);
    for (const [chained, single] of pairs) expect(plain(read(chained)), chained).toEqual(plain(read(single)));
  });
});
