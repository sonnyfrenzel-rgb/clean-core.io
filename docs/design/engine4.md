# Engine 4.0: the new engine's module tree

Status: first step, 14 November 2026. Owner decisions: ADR-124 and ADR-125 in
`docs/design/decisions.md`. Background: engine review `docs/design/engine-review-2026-11.md`, §2.4, §3, §4.3,
§8 and §11.

Engine 4.0 is built beside the shipping engine, in `lib/engine4/`, and is **inert**. No run, signature, audit
pack, page or route reads it until engine 4.0.0 is switched on behind its gate. It imports nothing from
`lib/abap/`, and nothing in the product imports it (`tests/engine4-layer-guard.spec.ts`). Every line is our own
code. Prior art supplied concepts only, and no third-party source is copied.

## Layers and contracts

| Layer | Module | Contract | State |
|---|---|---|---|
| L0 Lexer | `lexer.ts`, `tokens.ts` | `lex(source) → { tokens, diagnostics }` | built |
| L1 Statements | `statements.ts`, `statement-kinds.ts` | `statements(tokens, { macros? }) → Statement[]` | built |
| L2 Blocks | — | `blocks(statements) → BlockTree` with recovery | next |
| L3–L6 | — | object model, symbols, calls, process model (review §8.1) | later |

`index.ts` is the public surface. `readSource(source)` runs L0 and L1 in one call and returns the statements
together with the diagnostics of both layers.

### L0: characters to tokens

- **Token kinds:** `word`, `number`, `textLiteral` (`'…'`), `stringLiteral` (`` `…` ``), the string-template
  pieces `template`, `templateBegin`, `templateMiddle` and `templateEnd`, `fieldSymbol` (`<fs>`), `pragma`
  (`##…`), `comment`, `pseudoComment` (`"#EC`), `period`, `colon`, `comma`, `punct` (brackets and every
  operator, including `->`, `=>`, `~`, `-`, `?=`, `&&=`), `nativeSql` and `unknown`.
- **Position:** every token stands on one line and carries its 1-based row and column, its offset and
  `spaceBefore`. ABAP treats blanks as syntax: `ls-f` is component access while `a - b` is subtraction, and
  `m(` is a call while `m (` is not.
- **Keywords are not decided here.** ABAP reserves no word (`DATA data TYPE i.` is valid), so L1 decides by
  position.
- **String templates are split like JavaScript template literals.** Each embedded expression is ordinary
  tokens between template pieces. Expressions may nest templates and may break across lines. Template *text*
  cannot span lines.
- **Native mode** applies after `EXEC SQL.` up to `ENDEXEC`, and in an AMDP body up to the line that starts
  with `ENDMETHOD`. Each native line becomes one `nativeSql` token, and ABAP's rules for `"`, `:` and `.` do
  not apply inside it.
- **Tolerance:** an unterminated literal or template text closes at the end of its line. A stray `}` or an
  unknown character becomes an `unknown` token. Each case gets a diagnostic and lexing continues. The lexer
  never throws.
- **Every character is accounted for:** `uncoveredCharacters(source, tokens)` is empty for every input. This
  holds for 600 seeded random inputs and for all 394 corpus files.
- **One rule is inherited from the shipping engine.** An indented `*` is a comment only where no statement
  is open. Inside an open statement it is a multiplication (`isAbapCommentLine`).

### L1: tokens to statements

- A statement ends at a period. A chain becomes one statement per part. Each part holds the head's tokens
  followed by its own, plus `headCount`, `chain { index, count, colon }` and its terminator (`,` or `.`).
  `start` and `end` cover the part's own tokens. A colon or comma inside brackets, a literal or a template
  never splits the statement.
- **The kind table** (`statement-kinds.ts`) has 240 rows and 237 kinds, plus 5 shape kinds (`Assignment`,
  `MethodCall`, `MacroCall`, `NativeSql`, `Unknown`). Classification runs in a fixed order:
  1. Shape: `x = …` (any assignment operator, and including `DATA(x) = …`) and a functional call chain.
  2. The table: the longest pattern of leading *units* wins. A unit is a run of words joined without blanks
     by `-`, `~`, `->` or `=>`.
  3. A macro defined earlier in the source, or passed in from another include of the upload.
  4. Otherwise `Unknown`. The diagnostic applies to that one statement only, and its neighbours are not
     affected.
- Each row also carries the block columns that L2 will use: `opens`, `closes`, `middle`, `candidate` (a
  `SELECT` loop is a block only if `ENDSELECT` closes it) and `event`. The rows for
  `CLASS … DEFINITION LOCAL FRIENDS`, `… DEFERRED`, `… LOAD` and `INTERFACE … LOAD` have no `opens`, so none
  of them can open a block.
- **Contexts:** `abap`; `macro` (the body between `DEFINE` and `END-OF-DEFINITION`); `native` (one
  `NativeSql` statement per region).
- Adding a statement kind means one table row and one sample in `tests/engine4-statements.spec.ts`. The
  sample map is typed `Record<StatementKind, …>`, so a new row does not compile until its sample exists.

## What this step built

- `lib/engine4/` with 5 files and 1,240 lines. No file exceeds 1,500 lines and no function exceeds 150 lines;
  the guard enforces both limits.
- Specs, all server-free, 290 tests in total:
  - `engine4-lexer.spec.ts` (17): golden token streams, positions, tolerance, random and corpus input.
  - `engine4-statements.spec.ts` (256): one test per kind, plus boundaries, chains, ranges, Unknown
    isolation, macros, native SQL and shape before keyword.
  - `engine4-acceptance.spec.ts` (12): the three lexical defect classes of review §2.4, and metamorphic
    checks for case, line breaks and chaining.
  - `engine4-shadow.spec.ts` (2): see below.
  - `engine4-layer-guard.spec.ts` (3): the import rules and the size limits.
- **Shadow comparison:** `scripts/engine4/shadow.ts` (`npx tsx scripts/engine4/shadow.ts [--samples]`).
- **Speed:** new L0+L1 against the old `readStatements` on the 1,000-line starter example concatenated with
  itself, median of 5 runs:

  | Lines | New | Old |
  |---|---|---|
  | 1k | 4 ms | 15 ms |
  | 10k | 18 ms | 119 ms |
  | 25k | 46 ms | 270 ms |
  | 50k | 93 ms | 1,120 ms |

  The new layers scale linearly.

## Shadow numbers (14.11.2026)

**Corpus:** 7 starter examples and the benchmark's learn halves (`split.json` `learn` + `w3_learn`). That is
394 files and 33,688 lines. The holdout is never opened. Each file is read by both engines. Statements are
aligned by start line and by their text with whitespace removed and case folded.

| Measure | Value |
|---|---|
| Statements: old / new | 18,257 / 18,250 |
| Aligned (same start line and text) | 18,230, 99.85 % of old |
| End line agrees on aligned pairs | 100.00 % |
| Keyword statement or expression agrees | 18,172, 99.68 % |
| Block-opener role agrees (on the old engine's block kinds) | 100.00 % |
| `Unknown` statements (new) | 1 |
| Uncovered characters / lexer errors | 0 / 0 |

Each disagreement category, with a verdict:

- **`inline-declaration-is-an-assignment`, 57 cases. Verdict: new right.** For `DATA(lv) = …`, the old
  reader reports the keyword `DATA`, and the statement looks like a declaration to every
  `keyword === 'DATA'` check. The new reader classifies it as `Assignment`. The inline declaration stays
  visible in the tokens for L4 symbols.
- **`native-sql-region`, 27 old-only and 20 new-only statements in 3 files (the 1,000-line starter, BM-020,
  BM-095). Verdict: new right.** The old reader joins the native body and `ENDEXEC` into one statement (for
  example `SELECT … ENDEXEC`), and it cuts native SQL at every period. In BM-020 the qualified names
  `k.kunrg` and `p.netwr` split one cursor statement into fragments that do not exist (`kunrg, k`,
  `waerk, SUM( p`, …). The new reader produces `ExecSql`, one `NativeSql` statement and `EndExec`.
- **`call-or-assignment-starting-with-a-keyword-name`, 1 case. Verdict: new right.** `check( cs_order ).`
  (BM-214) calls a method named `check`. The old reader takes it for a `CHECK` statement.
- **`Unknown`, 1 case. Verdict: unclear and expected.** `RP_PROVIDE_FROM_LAST` in BM-141 is an SAP HR macro
  from an include that the upload does not contain. L3 (upload layout and includes) will settle it. The
  corpus has 93 other macro calls: 21 call a macro defined in the same file, and 72 call one defined in
  another include of the same case. The shadow passes each case's macro names across its files, as L3 will
  do, so all 93 are recognised. Without that, the 72 would be `Unknown`.
- **No disagreement is unexplained.** The shadow spec fails on any disagreement that no category covers, and
  on any drop below these numbers.

The block-opener agreement is 100 % only because this corpus is clean. The three defect classes of §2.4
(`LOCAL FRIENDS`, `INTERFACE … LOAD`, a template expression across lines) do not occur in it. They are
proven as acceptance tests in `engine4-acceptance.spec.ts` instead. The 300-file real-code sample of the
review is the fuzz corpus for phase 1. Under ADR-125 (5) it stays outside the repository, so it is not part
of these specs.

## Next steps

1. **L2 blocks:** `blocks(statements) → BlockTree`, built from the table's block columns, with recovery: an
   unclosed block closes at its container and is flagged; a candidate `SELECT` is dropped silently. Shadow
   it against `readBlocks` (unterminated count, containers, enclosing chains) and measure on the 300-file
   sample outside the repository (target: 0 false unterminated blocks).
2. **Phase 0 "parse once" (3.5.0) on top of L0/L1:** one `ParsedSource` holding tokens, statements, masked
   text derived from tokens (which replaces the 80 `maskLiterals` call sites), the block index and the
   container index. It sits behind the existing `AbapStatement` interface, so readers move over one at a
   time and the frozen digests prove each move neutral.
3. Remove the two other statement splitters (`declaration-parser.tokenize`, `plain-language.splitStatements`)
   once their readers consume `ParsedSource`.

## Open design questions for the owner

1. **Decimal literals.** `12.50` is read as one number, which keeps the shipping engine's tolerance. ABAP
   rejects an unquoted decimal. Should the lexer also flag it with a diagnostic?
2. **Old macro texts.** A macro body is now read as statements in the `macro` context, and calls are
   `MacroCall`. Expanding macros at their call sites is a later L3/L4 question. The user-facing sentence
   "Macro not expanded" (`coverage.ts`) should then be revisited so that the product no longer both expands
   and denies a macro (review §3).
3. **`AT <field group>`** is read as a block opener, which matches the language. The old engine reads only
   `AT NEW/END OF/FIRST/LAST`. Keep the language reading?
4. **Native SQL boundaries.** Native statements are no longer cut at periods. Downstream readers that look
   for `ENDEXEC` inside the last native statement will need to read the `EndExec` statement instead when they
   move to engine 4.
