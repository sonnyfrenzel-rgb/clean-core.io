import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { lex, uncoveredCharacters } from '../lib/engine4/lexer';
import { statements } from '../lib/engine4/statements';
import type { Token } from '../lib/engine4/tokens';

/**
 * Engine 4.0, L0 (ADR-125): golden token streams, positions, tolerance, and the
 * contract that every character of any input lands in a token or is blank.
 * Server-free.
 */
const stream = (tokens: Token[]) => tokens.map((t) => `${t.kind}:${t.text}`);

test.describe('golden token streams', () => {
  test('a declaration chain with an inline comment', () => {
    const { tokens, diagnostics } = lex(`DATA: lv_a TYPE i, "first\n      lv_b TYPE c.`);
    expect(stream(tokens)).toEqual([
      'word:DATA', 'colon::', 'word:lv_a', 'word:TYPE', 'word:i', 'comma:,', 'comment:"first',
      'word:lv_b', 'word:TYPE', 'word:c', 'period:.',
    ]);
    expect(diagnostics).toEqual([]);
  });

  test('component access, method calls, static and interface access, field symbols', () => {
    const { tokens } = lex(`lo->run( iv = ls-f ). zcl=>m( ). me->if_x~go( <fs>-k ).`);
    expect(stream(tokens)).toEqual([
      'word:lo', 'punct:->', 'word:run', 'punct:(', 'word:iv', 'punct:=', 'word:ls', 'punct:-', 'word:f', 'punct:)', 'period:.',
      'word:zcl', 'punct:=>', 'word:m', 'punct:(', 'punct:)', 'period:.',
      'word:me', 'punct:->', 'word:if_x', 'punct:~', 'word:go', 'punct:(', 'fieldSymbol:<fs>', 'punct:-', 'word:k', 'punct:)', 'period:.',
    ]);
    expect(tokens.find((t) => t.text === '-')!.spaceBefore).toBe(false);
  });

  test('literals: quoted with an escaped quote, backtick, a period and a colon inside', () => {
    const { tokens } = lex("WRITE: 'It''s: done.', `a``b.`.");
    expect(stream(tokens)).toEqual(['word:WRITE', 'colon::', "textLiteral:'It''s: done.'", 'comma:,', 'stringLiteral:`a``b.`', 'period:.']);
  });

  test('a string template with nested expressions, a nested template and escapes', () => {
    const { tokens, diagnostics } = lex("lv = |A \\| b: { x } and { |in{ y }| } end.|.");
    expect(stream(tokens)).toEqual([
      'word:lv', 'punct:=', 'templateBegin:|A \\| b: {', 'word:x', 'templateMiddle:} and {',
      'templateBegin:|in{', 'word:y', 'templateEnd:}|', 'templateEnd:} end.|', 'period:.',
    ]);
    expect(diagnostics).toEqual([]);
  });

  test('comments: column-1 asterisk, inline quote, pseudo-comment; pragmas', () => {
    const { tokens } = lex(`* header\nSELECT * FROM t INTO TABLE lt ##TOO_MANY_ITAB_FIELDS[x]. "#EC CI_NOWHERE`);
    expect(stream(tokens)).toEqual([
      'comment:* header', 'word:SELECT', 'punct:*', 'word:FROM', 'word:t', 'word:INTO', 'word:TABLE', 'word:lt',
      'pragma:##TOO_MANY_ITAB_FIELDS[x]', 'period:.', 'pseudoComment:"#EC CI_NOWHERE',
    ]);
  });

  test('namespaces, macro placeholders, escaped names, numbers, text symbols, offset access', () => {
    const { tokens } = lex(`/bic/zt-/bic/f = &1. !iv_x = 12.50. text-001 = lv+6(2).`);
    expect(stream(tokens)).toEqual([
      'word:/bic/zt', 'punct:-', 'word:/bic/f', 'punct:=', 'word:&1', 'period:.',
      'word:!iv_x', 'punct:=', 'number:12.50', 'period:.',
      'word:text', 'punct:-', 'number:001', 'punct:=', 'word:lv', 'punct:+', 'number:6', 'punct:(', 'number:2', 'punct:)', 'period:.',
    ]);
  });

  test('operators: the longest match wins', () => {
    const { tokens } = lex(`a ?= b. c += 1. d &&= e. IF f <> g AND h >= i. x = y ** 2 && z.`);
    const ops = tokens.filter((t) => t.kind === 'punct').map((t) => t.text);
    expect(ops).toEqual(['?=', '+=', '&&=', '<>', '>=', '=', '**', '&&']);
  });

  test('native SQL: one token per line, host-variable colons and periods kept inside', () => {
    const { tokens } = lex(`EXEC SQL.\n  SELECT k.a INTO :lv FROM t k "note\n* gone\nENDEXEC.`);
    expect(stream(tokens)).toEqual([
      'word:EXEC', 'word:SQL', 'period:.', 'nativeSql:SELECT k.a INTO :lv FROM t k', 'comment:"note', 'comment:* gone',
      'word:ENDEXEC', 'period:.',
    ]);
  });

  test('native SQL: ENDEXEC inside a string literal or after a quoted identifier does not end the block', () => {
    const { tokens } = lex(`EXEC SQL.\n  UPDATE t SET c = 'ENDEXEC' WHERE d = 'it''s ENDEXEC'\n  SELECT "ENDEXEC" FROM t\nENDEXEC.`);
    expect(stream(tokens)).toEqual([
      'word:EXEC', 'word:SQL', 'period:.', "nativeSql:UPDATE t SET c = 'ENDEXEC' WHERE d = 'it''s ENDEXEC'",
      'nativeSql:SELECT', 'comment:"ENDEXEC" FROM t', 'word:ENDEXEC', 'period:.',
    ]);
  });

  test('an AMDP body is native up to the line starting with ENDMETHOD', () => {
    const src = `METHOD get BY DATABASE PROCEDURE FOR HDB LANGUAGE SQLSCRIPT USING vbak.\n  et = SELECT "VBELN" FROM vbak; -- x.\nENDMETHOD.`;
    expect(stream(lex(src).tokens).slice(-3)).toEqual(['nativeSql:et = SELECT "VBELN" FROM vbak; -- x.', 'word:ENDMETHOD', 'period:.']);
  });
});

test.describe('positions', () => {
  test('every token carries its 1-based row and column', () => {
    const { tokens } = lex(`REPORT z.\r\n\r\n  IF a = 1.\n    WRITE |x{ a\n }y|.`);
    const at = (text: string) => tokens.find((t) => t.text === text)!;
    expect([at('REPORT').row, at('REPORT').col]).toEqual([1, 1]);
    expect([at('IF').row, at('IF').col]).toEqual([3, 3]);
    expect([at('WRITE').row, at('WRITE').col]).toEqual([4, 5]);
    expect([at('}y|').row, at('}y|').col]).toEqual([5, 2]);
  });

  test('the source text is reproduced by the tokens at their offsets', () => {
    const src = readFileSync(join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');
    for (const t of lex(src).tokens) expect(src.slice(t.offset, t.offset + t.text.length)).toBe(t.text);
  });
});

test.describe('tolerance', () => {
  test('an unterminated literal closes at the line end and the next line reads normally', () => {
    const { tokens, diagnostics } = lex(`lv = 'open\nWRITE 'ok'.`);
    expect(stream(tokens)).toEqual(['word:lv', 'punct:=', "textLiteral:'open", 'word:WRITE', "textLiteral:'ok'", 'period:.']);
    expect(diagnostics.map((d) => [d.code, d.row])).toEqual([['unterminated-literal', 1]]);
  });

  test('an unterminated template text closes at the line end, flagged', () => {
    const { tokens, diagnostics } = lex(`lv = |open\nWRITE 'ok'.`);
    expect(tokens[2]).toMatchObject({ kind: 'template', text: '|open' });
    expect(diagnostics[0].code).toBe('unterminated-template');
  });

  test('a stray brace and an unknown character are tokens with diagnostics, never a stop', () => {
    const { tokens, diagnostics } = lex(`a = b } ; c.`);
    expect(stream(tokens)).toEqual(['word:a', 'punct:=', 'word:b', 'unknown:}', 'unknown:;', 'word:c', 'period:.']);
    expect(diagnostics.map((d) => d.code)).toEqual(['unexpected-brace', 'unknown-character']);
  });

  test('an indented asterisk: comment where no statement is open, multiplication inside one', () => {
    const { tokens, diagnostics } = lex(`x = a\n  * 2.\n  * note\nWRITE x.`);
    expect(stream(tokens)).toEqual(['word:x', 'punct:=', 'word:a', 'punct:*', 'number:2', 'period:.', 'comment:* note', 'word:WRITE', 'word:x', 'period:.']);
    expect(diagnostics.map((d) => d.code)).toEqual(['indented-asterisk-comment']);
  });
});

/** A small deterministic generator, so a failing input can be reproduced. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ALPHABET = [
  "'", '`', '|', '{', '}', '"', '*', '.', ':', ',', '(', ')', '[', ']', '-', '>', '<', '=', '#', '@', '\\', '/', '&', '!', '%',
  ' ', ' ', ' ', '\n', '\r\n', '\t', 'a', 'B', '_', '1', '9', 'DATA ', 'IF ', 'EXEC SQL.', 'ENDEXEC', 'METHOD m BY DATABASE PROCEDURE.',
  'ENDMETHOD', 'DEFINE ', 'END-OF-DEFINITION', 'ü', ' ',
];

test.describe('every character accounted for', () => {
  test('600 random inputs: no throw, nothing uncovered, statements well-formed', () => {
    const rnd = prng(20261114);
    for (let n = 0; n < 600; n++) {
      let src = '';
      const len = Math.floor(rnd() * 240);
      for (let i = 0; i < len; i++) src += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
      const { tokens } = lex(src);
      expect(uncoveredCharacters(src, tokens), JSON.stringify(src)).toEqual([]);
      for (const t of tokens) expect(t.text.length, JSON.stringify(src)).toBeGreaterThan(0);
      for (const s of statements(tokens)) {
        expect(s.tokens.length).toBeGreaterThan(0);
        expect(s.start.row <= s.end.row).toBe(true);
      }
    }
  });

  test('the starter examples and the benchmark learn halves: nothing uncovered, no lexer error', () => {
    const files: string[] = [];
    const starters = join(__dirname, '..', 'public', 'starter-examples');
    for (const name of readdirSync(starters)) files.push(join(starters, name));
    const bench = join(__dirname, 'prozess-benchmark');
    const split = JSON.parse(readFileSync(join(bench, 'split.json'), 'utf8')) as { learn: string[]; w3_learn: string[] };
    for (const id of [...split.learn, ...split.w3_learn]) {
      const dir = join(bench, 'cases', id);
      for (const name of readdirSync(dir)) if (name.endsWith('.abap')) files.push(join(dir, name));
    }
    expect(files.length).toBeGreaterThan(300);
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const { tokens, diagnostics } = lex(src);
      expect(uncoveredCharacters(src, tokens), file).toEqual([]);
      expect(diagnostics.filter((d) => d.severity === 'error'), file).toEqual([]);
    }
  });
});

test('an unquoted decimal stays one number and gets a warning (owner default, 14.11.2026)', () => {
  const { tokens, diagnostics } = lex("lv = 12.50.\nlv = '12.50'.\nlv = 3.");
  expect(tokens.filter((t) => t.kind === 'number').map((t) => t.text)).toEqual(['12.50', '3']);
  expect(diagnostics.map((d) => [d.code, d.row, d.col, d.severity])).toEqual([['unquoted-decimal', 1, 6, 'warning']]);
});
