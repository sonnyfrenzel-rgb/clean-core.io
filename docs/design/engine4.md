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
| L2 Blocks | `blocks.ts` | `blocks(statements) → BlockTree` with recovery | built |
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
- **Two L1 rules added with L2.** A `SELECT` whose list holds only aggregates (`COUNT(*)`, `SUM( x ) AS s`,
  in the classic form or after `FIELDS`) and no `GROUP BY` returns one row, so it is `Select`, not the
  candidate `SelectLoop`; inside a `SELECT … ENDSELECT` loop it no longer takes the loop's `ENDSELECT`. And a
  `DEFINE` inside an open macro body is read as ABAP, not as body text: a macro cannot define a macro, so the
  body before it lost its `END-OF-DEFINITION`.
- **Owner default for decimals (14.11.2026):** `12.50` stays one `number` token and gets an
  `unquoted-decimal` warning.

### L2: statements to the block tree

`blocks(statements) → { root, blocks, owner, diagnostics }`, pure and linear. `readSource(source)` now runs
L0, L1 and L2 and returns the tree with the statements.

- **What a block is.** Every block kind of the table (`opens`/`closes`): the routines FORM, METHOD, FUNCTION
  and MODULE; CLASS and INTERFACE; DEFINE; the control blocks IF, CASE, LOOP, DO, WHILE, TRY,
  `SELECT … ENDSELECT`, `AT … ENDAT`, PROVIDE, `ON CHANGE OF`, `CATCH SYSTEM-EXCEPTIONS`; enhancements,
  enhancement sections, test seams and test injections. Besides those, `event` (START-OF-SELECTION,
  `AT SELECTION-SCREEN` and the other `event` rows) and `program`, the root around everything.
- **Shape.** A block has its opener and closer statement indices, an inclusive statement range, source
  positions, a `name` (routine, class, interface, macro, or the event as written, upper-cased), its parent
  and depth, and branches. A branch starts at the opener or at a middle statement (`ELSEIF`, `ELSE`, `WHEN`,
  `CATCH`, `CLEANUP`) and lists its children in source order: statements and nested blocks. Heads and
  closers are not children. `owner[i]` is the innermost block of statement `i`. `enclosingBlocks(tree, i)`
  returns the chain of blocks around it.
- **`termination`:** `closer`, `implicit` (event blocks and the program, which have no closer) or `unclosed`.
  An unclosed block always has an `unclosed-block` diagnostic.
- **Placement.** FORM, FUNCTION, MODULE, CLASS, INTERFACE and event blocks stand at program level or in an
  enhancement. METHOD stands in a class. A DEFINE does not stand in a DEFINE. An opener that does not fit
  closes the blocks around it until it fits. This one rule ends an event block at the next event, FORM,
  MODULE, FUNCTION, CLASS or INTERFACE (not at a DEFINE, which is no processing block), and it ends an
  unclosed IF or FORM before the next FORM instead of nesting the next FORM inside it. A METHOD with no
  class around it stands at program level with a `block-outside-container` info, so a pasted method still
  reads.
- **Closers and middles** take the nearest open block of their kind. The blocks above it end on the
  statement before and are flagged. A control closer or middle never reaches across a routine, class,
  interface, event, macro or enhancement. A closer or middle with nothing to take is a leaf with an
  `unexpected-closer` or `unexpected-middle` warning.
- **Indentation breaks a tie.** If the nearest open block of the kind stands in another column than the
  closer, and one of the next eight blocks of that kind further out stands exactly in the closer's column,
  that one takes the closer, and the nearer ones are the unclosed ones. When an inner `ENDLOOP` is lost, the
  inner LOOP is flagged, not the outer one whose `ENDLOOP` still stands. Code without matching indentation
  falls back to the nearest block. The look-back is a constant, so the layer stays linear.
- **Candidates.** A `SelectLoop` is a block only if its `ENDSELECT` arrives before something else ends it.
  Otherwise it is dropped without a diagnostic, and its statements belong to its parent.
- **Leaves.** Statements in the `macro` context (a macro body is text pasted elsewhere, and an `IF` in it is
  balanced where the macro is called) and native SQL. After `PROCESS …` (dynpro flow logic), `MODULE x.`
  calls a module and opens nothing.
- **Linear.** The scan pushes and pops every frame once and finds the nearest open block of a kind through
  one index stack per kind, not by walking the stack. A second pass builds the tree from the kept blocks.
  20,000 nested IFs, and 20,000 IFs followed by 20,000 stray `ENDLOOP`s, each take a few milliseconds and do
  not recurse.

## What the first step built (L0, L1)

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

## Shadow numbers of L0/L1 (14.11.2026)

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

## L2 step (14.11.2026)

### What it built

- `lib/engine4/blocks.ts` (341 lines), exported from `index.ts`; `readSource` returns the tree.
- `tests/engine4-blocks.spec.ts` (53 tests): one block per kind (typed `Record<BlockKind, …>`), branches,
  names, event blocks, every recovery rule, candidates, macro bodies, native SQL, flow logic, and the tree
  invariants (proper nesting, every statement exactly once as head, closer or child, owners consistent) over
  the starter examples and 300 seeded random statement soups. Plus a lexer test for the decimal warning and
  two shadow tests.
- `scripts/engine4/shadow.ts` compares L2 with `readBlocks`; `scripts/engine4/shadow-damage.ts` compares
  recovery on damaged code; `scripts/engine4/timing.ts` measures both engines.

### Shadow on the clean corpus (394 files, 33,688 lines)

| Measure | Value |
|---|---|
| Blocks of the old kinds: old / new | 2,729 / 2,729 |
| Same opener and kind | 2,729, 100 % |
| Same end line and termination | 2,729, 100 % |
| Unterminated: old / new | 0 / 0 |
| Containers (routines, classes, function modules, event blocks) with the same kind, name and lines | 1,221 of 1,221 |
| Enclosing chain agrees on aligned statements | 18,230 of 18,230 |

No difference, so there is nothing to explain, and neither engine reports a false unterminated block. The
blocks that only the new layer has (`function`, `event`, `enhancement`, …) are outside the old kinds and not
counted.

### Shadow on damaged code

The clean corpus cannot show recovery, so `shadow-damage.ts` deletes one closer line per damage, at a
quarter, half and three quarters through each file's closers: 962 damages. Per engine: was the block that
lost its closer flagged, how many other regions moved (collateral), and how many other blocks were flagged.

| Measure | Old | New |
|---|---|---|
| Block that lost its closer flagged | 907 / 962 | 961 / 962 |
| Damages with collateral | 64 | 44 |
| Collateral regions | 68 | 49 |
| False unterminated blocks | 35 | 2 |

The 56 damages where the outcomes differ fall into three categories:

- **`indentation-picks-the-block-that-lost-its-closer`, 34. Verdict: new right.** An inner `ENDIF` or
  `ENDLOOP` is deleted. The old engine gives the outer closer to the inner block and flags the outer block,
  which is complete. The new layer follows indentation and flags the inner one.
- **`function-module-is-a-block`, 20. Verdict: new right.** The old engine never reports an unclosed
  `FUNCTION`. The new layer flags it.
- **`unclosed-macro-body-reads-on-as-macro`, 2 (BM-067, BM-229). Verdict: the old reading is better here;
  open question 5.** Once `END-OF-DEFINITION` is lost, L1 reads the rest of the file as macro text until the
  next `DEFINE` or `END-OF-DEFINITION`, so the code behind it has no blocks. The old engine reads it on as
  code.

Every damage outside these categories has the same outcome in both engines, collateral included. The
causes of that shared collateral have not been analysed one by one yet.

### Speed

Median of 5 runs, the 1,000-line starter concatenated:

| Lines | New L0+L1 | New L2 | Old `readStatements` | Old `readBlocks` |
|---|---|---|---|---|
| 1k | 3 ms | 0.6 ms | 21 ms | 0.3 ms |
| 10k | 19 ms | 2.6 ms | 155 ms | 1.6 ms |
| 25k | 69 ms | 12 ms | 492 ms | 7.5 ms |
| 50k | 152 ms | 21 ms | 851 ms | 10 ms |

L2 alone is slower than `readBlocks` because it builds the full tree with branches and owners. The old
module returns ranges and copies of the enclosing chains. Read together, the new L0–L2 take 81 ms at 25k
lines, and the old statement and block readers take 500 ms.

## Real-code sample (15.11.2026)

The sample stays outside the repository (ADR-125 (5)); only aggregate numbers are recorded here. Both shadow
scripts read it with `--corpus <MANIFEST.json> [--group <g>]` (`manifestCorpus` in `shadow.ts`). The
manifest records each file's repository, licence, commit and path.

- **Public group: 300 files, 156,047 lines** from 17 public GitHub repositories whose `LICENSE` file is MIT
  (12 repositories, 244 files) or Apache-2.0 (5 repositories, 56 files), checked before cloning. These
  include abapGit, abap2xlsx, the ABAP cheat sheets, abapOpenChecks, the ABAP SDK for Azure, code pal, ajson,
  ABAP Logger, mockup loader and several standalone reports. Files are deduplicated by content hash. About
  half carry legacy markers: 40 programs or includes, 29 function-group files (12 of them dynpro flow logic),
  33 plain reports or includes, 192 FORMs, 101 event blocks, 74 macros with 1,079 macro calls, 8 function
  modules, 21 modules and 14 `SELECT … ENDSELECT` loops. The rest are classes (114), local classes (16),
  test classes (54) and interfaces (14).
- **Owner groups: 12 files, 18,544 lines** of real or realistic legacy programs, read in place and never
  copied: 4 owner examples, plus 8 further programs. 4 of the further 12 files the owner supplied were byte
  for byte copies of owner examples and are counted once. One is a different version of a starter example.

### Shadow on the clean sample

| Measure | Public (300) | Owner (12) |
|---|---|---|
| Statements: old / new | 88,084 / 88,118 | 17,619 / 17,620 |
| Aligned, end line agrees on aligned pairs | 99.96 %, 100 % | 99.99 %, 100 % |
| Uncovered characters / lexer errors | 0 / 0 | 0 / 0 |
| `Unknown` statements (new) | 12 | 0 |
| Blocks of the old kinds: old / new | 13,680 / 13,465 | 1,854 / 1,853 |
| **Unterminated: old / new** | **167 / 1** | **0 / 0** |
| Containers with the same kind, name and lines | 5,926 of 6,083 | 414 of 414 |

**The one block L2 reports as unterminated is a true positive.** A public learning program spells `ENDIF`
as `ENFIF`; the file does not compile. **So L2 gives no false unterminated block on the clean sample.**

The old engine gives 166 false ones. They have five causes, and L2 reads each of them correctly:

- 96 `MODULE` calls in dynpro flow logic: the old engine opens a module block for each.
- 26 `CLASS … DEFINITION LOCAL FRIENDS`: the old engine opens a class block.
- 21 functional calls of a method named `module(`.
- 21 `IF`, `CASE` and `METHOD` blocks where a string template breaks across lines (review §2.4).
- 2 assignments to a variable named `class`.

Every other L2 difference on the sample also traces to a file holding one of these causes, or to a macro
body whose `IF` the old engine nests as code. The enclosing chains differ on 10 % of the public statements,
almost all of them behind a `LOCAL FRIENDS` line. 8,372 of the 8,443 sit in the 17 files that have one.

### Damage shadow on the sample

817 damages (one closer line deleted at a quarter, half and three quarters of each file). The script now
counts apart the flags an engine already gives on the undamaged file. On the learn corpus there are none,
so its numbers above are unchanged.

| Measure | Old | New |
|---|---|---|
| Block that lost its closer flagged | 755 / 817 | 816 / 817 |
| Damages with collateral | 60 | 11 |
| Collateral regions | 97 | 90 |
| False unterminated blocks caused by the damage | 59 | 9 |

The outcomes differ in 173 damages, and the script names a cause for each of them. In 165 the new outcome
is better:

- 82 where only the old engine's flags on the undamaged file carry over.
- 58 where indentation picks the block that lost its closer.
- 22 in dynpro flow logic, where `MODULE` is a call.
- 3 where a function module is a block.

In the other **8 the new outcome is worse: `unclosed-macro-body-reads-on-as-macro`**. These 8 damages
account for all 9 false flags and for 79 of the 90 collateral regions. The one victim that is not flagged
sits in a file whose closers are indented two columns deeper than their openers. The nearest block takes
the closer, and the old engine does the same.

### Speed on the sample

All 312 files, median of 5: new L0+L1 680 ms, new L2 51 ms, old `readStatements` 4,762 ms, old `readBlocks`
31 ms. The largest file (9,459 lines) takes 24 ms in L0+L1 and 2 ms in L2. The old reader takes 196 ms.

## Next steps

1. **Decide questions 5 to 9 below** with the sample's evidence. Rerun both shadows on the sample after
   every L2 change (it stays outside the repository, so the specs cannot read it).
2. **Phase 0 "parse once" (3.5.0) on top of L0–L2:** one `ParsedSource` holding tokens, statements, masked
   text derived from tokens (which replaces the 80 `maskLiterals` call sites), the block tree as the block
   index and the container index. It sits behind the existing `AbapStatement` interface, so readers move
   over one at a time and the frozen digests prove each move neutral.
3. Remove the two other statement splitters (`declaration-parser.tokenize`, `plain-language.splitStatements`)
   once their readers consume `ParsedSource`.
4. **L3:** upload layout and includes, which supply the macro names across files (the shadow already passes
   them per case) and settle `RP_PROVIDE_FROM_LAST`.

## Open design questions for the owner

Settled 14.11.2026 by owner defaults: decimals stay numbers plus a warning (built); macro calls are
recognised and expansion comes later; `AT <field group>` is a block opener; `ENDEXEC` is its own statement.
Still open, each with the default this step built. Under each question is the evidence from the real-code
sample (15.11.2026) and a recommendation. Variants were measured on scratch copies of `lib/engine4/`. None
of them is built.

5. **A lost `END-OF-DEFINITION`.** At present the macro body runs to the next `DEFINE` or
   `END-OF-DEFINITION`, and the code behind it is not read as code (2 of 962 damages). The alternative is to
   end an unclosed body at the first statement that cannot stand in a macro, such as an event or a FORM.
   That needs a firm list of what a macro may contain. **Default: keep it, and decide with L3/L4 macro
   expansion.**
   - *Language.* A missing `END-OF-DEFINITION` is a syntax error, so no reading is "the" right one.
     abaplint, used as an offline oracle, also reads the rest of the source as macro content.
   - *Sample.* 74 macros in the public group, 3 in the owner group and 13 in the learn corpus. Of the 74
     public ones, 32 are defined inside a METHOD, 22 at class level and 20 at program level. The 90 clean
     macro bodies hold 647 statements. None of them is a routine, class, interface or event boundary (FORM,
     ENDFORM, METHOD, ENDMETHOD, FUNCTION, MODULE, CLASS, ENDCLASS, the event keywords). None of them begins
     a line at or left of the `DEFINE` column.
   - *Default on the sample.* This is the only damage where L2 does worse than the old engine. 8 damages
     cause all 9 false flags and 79 of the 90 collateral regions. A macro inside a METHOD that loses its end
     swallows the rest of the class.
   - *Variant* (body ends at a routine, class, interface or event boundary, or at a line that starts at or
     left of the `DEFINE` column). On the sample, collateral goes from 90 to 3 and false flags from 9 to 1.
     On the learn corpus, collateral goes from 49 to 42 and false flags from 2 to 1. The macro category
     disappears on both, and nothing changes on clean code.
   - **Recommendation: change it.** End the body at the first such statement, with a diagnostic on the
     `DEFINE`. Macro expansion (L3/L4) does not depend on this.
6. **Indentation as a tie-breaker.** It finds the block that lost its closer in 34 more damages, and it
   changes nothing on clean code (0 false unterminated blocks either way). It can still mislead on code that
   is indented wrongly *and* damaged. **Default: on, with a look-back of eight blocks.**
   - *Language.* A closer always closes the innermost open block. Indentation means nothing to the compiler.
     Clean ABAP asks for Pretty Printer indentation ("Indent and snap to tab"), which is why it is a useful
     signal on damaged code.
   - *Sample, as written.* Without the tie-breaker, 58 of 817 victims go unflagged (with it, 1), and false
     flags rise from 9 to 67.
   - *Sample, with indentation disturbed on purpose.* The tie-breaker runs on clean code too. With every
     line indented at random it reports **463 false unterminated blocks on clean code**. With 10 % of the
     lines shifted by up to four columns it reports 46. Without it, the count is 1, the true positive.
     Removing all indentation or indenting every closer two columns deeper changes nothing.
   - *Variant "only where damage is"* (read by nearest block first, and use indentation only inside a
     routine where that reading finds an unclosed block or a stray closer). On the sample as written it matches
     the current default exactly: 816 of 817 victims flagged, 9 false flags. On clean code it reports the true
     positive and nothing else, under every disturbance. With 10 % of the lines shifted and one closer
     deleted, it gives 54 false flags. The current default gives 30 plus 137 that are already there on the
     undamaged file, and the variant without indentation gives 67. With every line indented at random, it
     gives 300, against 1,470 for the current default and 67 without indentation. A whole-file gate (use
     indentation anywhere once the file has damage) did worse: 1,465 under random indentation.
   - **Recommendation: change it.** Keep the tie-breaker, but run it only where the nearest-block reading
     already finds damage. A file that balances is then read exactly as the compiler reads it, whatever its
     indentation. The look-back of eight can stay.
7. **A METHOD outside a class** stands at program level with an `info`, not a warning, because uploads are
   often a single pasted method. **Default: keep it.**
   - *Language.* `METHOD` is allowed only in `CLASS … IMPLEMENTATION`. Elsewhere it is a syntax error, and
     abaplint reports "Unexpected METHODIMPLEMENTATION".
   - *Sample.* 0 of 312 files, because abapGit-style files always carry their class. The learn corpus has 6,
     in 3 cases: 2 pasted single methods and 4 methods of a Web Dynpro component, whose source export has no
     `CLASS` around its methods.
   - **Recommendation: keep it.** These are normal uploads, not damage, so an info is the right level.
8. **Event blocks are not ended by `DEFINE`.** The old engine ends them there, but `DEFINE` is no processing
   block. On the corpus this changes nothing. **Default: the language reading.**
   - *Language.* The ABAP cheat sheet on selection screens and lists ("Event Blocks") says an event block
     is ended by the next processing block and has no closing statement. A macro definition is not a
     processing block, so the statements behind `END-OF-DEFINITION` still belong to the event.
   - *Sample.* 0 macros are defined inside an event block, in the sample (77 macros) and in the learn
     corpus (13). The variant that ends events at `DEFINE` gives identical numbers.
   - **Recommendation: keep the language reading.**
9. **Logical-database `GET node` events** are not event blocks yet (`Get` has no `event` column), because the
   corpus has none and `GET` has many other forms. **Default: leave it out until a case needs it.**
   - *Correction.* The learn corpus does have them: 3 HR cases (`NODES peras` with `GET peras`). In 2 cases
     the GET block's statements land at program level. In the third, they are attributed to the
     `START-OF-SELECTION` before them, which is wrong.
   - *Sample.* The 312 files have no `NODES` and no `GET node`. But 6 other `GET` statements (`GET BIT` 4,
     `GET CURSOR` 1, `GET LOCALE` 1) and 2 more `GET CURSOR` in the learn corpus fall into the catch-all
     `Get` row today. Giving `Get` an `event` column as it stands would make each of them an event and cut
     its routine in two.
   - **Recommendation: change it, narrowly.** First add rows for the other `GET` forms (`BIT`, `CURSOR`,
     `LOCALE`, `PF-STATUS`, `RUN TIME`, `DATASET`, `PROPERTY`). Then make only
     `GET <node> [LATE] [FIELDS …].` an event. abaplint also keeps the node form apart from `GET TIME`
     and `GET CURSOR`. Optionally, L3 can confirm the node against a `NODES`/`TABLES` declaration across
     the includes; in one of the 3 cases the declaration sits in the TOP include.
