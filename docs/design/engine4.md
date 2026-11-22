# Engine 4.0: the new engine's module tree

Status: L0–L2 and the Phase 0 foundation, 15 November 2026. Owner decisions: ADR-124 and ADR-125 in
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
| Phase 0 | `parsed-source.ts`, `compat.ts` | `parseSource(source) → ParsedSource` (the shipping statement view, masks, container index) | built, not wired |
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

## Phase 0 "parse once": the foundation (15.11.2026)

Owner go of 15.11.2026. Engine review §4.3 and §11 step 2; ADR-125 (4).

### Which route, and why

**The `ParsedSource` and its proof are built in `lib/engine4/`. No reader in `lib/abap/` has moved yet.**
Wiring is the next step, and it needs an owner decision.

ADR-125 (4) makes Phase 0 the strand's first piece: "the parsed source of 3.5.0 is built on L0/L1 rather
than written twice". But (1) says that `lib/abap/` imports nothing from `lib/engine4/` until the switch,
and (2) says the strand is wired into nothing before engine 4.0.0. (4) names no exception to either rule,
and `tests/engine4-layer-guard.spec.ts` enforces (1). Moving one reader onto `ParsedSource` would break that
guard and change the ADR, which is not this step's call to make. So this step builds everything the move
needs and proves it neutral. Each reader can then move with no new design work once the owner allows it.

### What it built

- `lib/engine4/parsed-source.ts`: `parseSource(source, { macros? }) → ParsedSource`, exported from
  `index.ts`. Everything in it is computed once:
  - `source`, `lines`, `tokens`, `statements` (L1), `tree` (L2) and `diagnostics`. The tokens keep
    comments, pseudo-comments, pragmas, literal texts and qualified names (`ls-f`, `lo->m`, `cl=>m`)
    exactly as written. A reader that looks one of them up in a curated list loses nothing.
  - `compat`: the shipping `AbapStatement[]`, built from the tokens (`compat.ts`). `CompatStatement` has
    the shape of `AbapStatement` field for field, so it is assignable to it by structure without an import.
  - `maskedText(i)`: the shipping `maskLiterals(compat[i].text)`, derived from the token kinds (literal
    contents blanked, delimiters kept, a template's `{ … }` blanked). This is what replaces the
    `maskLiterals(…)` calls, 81 of them in `lib/` outside `statement-reader.ts`.
  - `maskNonCode()` and `maskComments()`: the whole-source masks, derived from the tokens and computed on
    first use.
  - `containers`: routines, classes, function modules and event blocks from the block tree, in the shipping
    order. `containerAt(line)` answers like the shipping `containerAt`, but by lookup instead of a scan
    over every container (the review's `containerAt` hotspot).
  - `recovered`: L2 had to recover (an unclosed block or a closer with nothing to close).
- **Two places copy a shipping reading that L1 deliberately does not share**, so that the move is neutral.
  Native SQL between `EXEC SQL` and `ENDEXEC` is cut at every period, and its last piece is joined with
  `ENDEXEC`. The AMDP body stays one statement, and its `"…"` identifiers are masked as comments. The
  shadow category `native-sql-region` is where L1 is right. Fixing it is a gated reading later, not
  Phase 0.

### The proof: `scripts/engine4/shadow-parsed.ts`

Run with `npx tsx scripts/engine4/shadow-parsed.ts [--samples]`. The spec is
`tests/engine4-parsed-source.spec.ts`. The corpus is the same one as the L0/L1 shadow: the starter
examples and the benchmark learn halves, never the holdout.

| Check, per file | Corpus (394 files, 33,688 lines) | Damaged (962 sources) |
|---|---|---|
| `compat` deep-equal to `readStatements` | 394 / 394 (18,257 statements) | 961 / 962 |
| `maskedText(i)` = `maskLiterals(text)` | 18,257 / 18,257 | 48,662 / 48,662 |
| `maskNonCode()` / `maskComments()` identical | 394 / 394 each | 962 / 962 |
| `containers` identical, order included | 394 / 394 | 814 / 962; all 148 others `recovered` |
| `containerAt` identical on every line | 394 / 394 | 814 / 962 |

**Why this proves a move neutral.** A reader is a pure function of the statements, the masks, the
containers and the source. On a file where all of these are identical, the reader cannot tell
`ParsedSource` from the shipping products, so its output, and every frozen digest built from it, stays
the same. On the corpus that holds for every file. The shipping frozen oracles and goldens
(`engine-version-rebuild`, the three `golden-master` specs) and the benchmark learn halves were run on
this branch. They are unchanged by construction, because `lib/abap/` is untouched.

**Where it is not neutral, and pinned** (the spec fails if this list changes):

- **Damaged code, containers.** The 148 damages where L2 recovers differently from `readBlocks` (see "Shadow
  on damaged code" above; L2 is right). Every one of them has `recovered` set. A neutral wiring keeps the
  shipping container reader for a recovered source until a gated reading switches it.
- **An AMDP method that lost its `ENDMETHOD`** (1 damage, BM-258). The shipping reader then reads the body
  as ABAP, and the compat view keeps it native.
- **Outside the corpus:** a template expression across lines (review §2.4; the shipping reader ends the
  statement in the wrong place), an unterminated literal (the shipping mask runs on into the next
  statement), and `CLASS … DEFINITION LOCAL FRIENDS` (review §2.4; the shipping reader opens a class
  container). In each of the three the new reading is the right one. Wiring would change it, so each one
  needs a gate, or a fallback to the shipping reader where `diagnostics` name the case.

### Speed: `scripts/engine4/timing-parse.ts`

"One read" means producing every product `ParsedSource` hands over (statements, blocks/containers, the mask
of every statement, both whole-source masks, `containerAt` for every line). The shipping way and
`parseSource` are compared on the 1,000-line starter concatenated, median of 5:

| Lines | Shipping way | `parseSource` | Factor |
|---|---|---|---|
| 1k | 23 ms | 5 ms | 4.3× |
| 10k | 197 ms | 44 ms | 4.4× |
| 25k | 1,072 ms | 213 ms | 5.0× |
| 50k | 2,227 ms | 287 ms | 7.8× |

The evidence pass today re-reads and re-masks the same text again and again. Under the V8 profiler
(`--profile`), `buildAbapEvidence` spends **285 of 612 ms (47 %) at 1k lines and 4,732 of 7,098 ms (67 %)
at 10k lines** in `statement-reader.ts` and `block-structure.ts` (self time). Parse once can remove that
share, down to the one read above. The end-to-end "after" can only be measured once readers consume
`ParsedSource`, so this step reports no product speed-up.

### The wiring step, pending the owner

1. **Decision:** an ADR-125 amendment that lets `lib/abap/` import `lib/engine4/parsed-source` (and only
   that) before the switch, as the "shared foundation" of (4), with the layer guard narrowed to that one
   module.
2. One entry point (`buildAbapEvidence`, `buildProcessFacts`, …) calls `parseSource` once and passes the
   `ParsedSource` down. Readers that take `statements: AbapStatement[]` take `parsed.compat`, and
   `maskLiterals(s.text)` becomes `parsed.maskedText(s.index)`. A recovered source keeps `readBlocks` for
   its containers. One reader per commit, and the frozen digests and goldens run on each.
3. Then item 3 below.

## Next steps

1. **The 300-file real-code sample** outside the repository (ADR-125 (5)): run L2 over it and count the
   unterminated blocks (target: 0 false ones), and run the damage shadow and `shadow-parsed` on it.
2. **Phase 0 wiring**, after the owner decision above.
3. Remove the two other statement splitters (`declaration-parser.tokenize`, `plain-language.splitStatements`)
   once their readers consume `ParsedSource`. Not started: it needs step 2.
4. **L3:** upload layout and includes, which supply the macro names across files (the shadow already passes
   them per case) and settle `RP_PROVIDE_FROM_LAST`.

## Open design questions for the owner

Settled 14.11.2026 by owner defaults: decimals stay numbers plus a warning (built); macro calls are
recognised and expansion comes later; `AT <field group>` is a block opener; `ENDEXEC` is its own statement.
Still open, each with the default this step built:

5. **A lost `END-OF-DEFINITION`.** At present the macro body runs to the next `DEFINE` or
   `END-OF-DEFINITION`, and the code behind it is not read as code (2 of 962 damages). The alternative is to
   end an unclosed body at the first statement that cannot stand in a macro, such as an event or a FORM.
   That needs a firm list of what a macro may contain. **Default: keep it, and decide with L3/L4 macro
   expansion.**
6. **Indentation as a tie-breaker.** It finds the block that lost its closer in 34 more damages, and it
   changes nothing on clean code (0 false unterminated blocks either way). It can still mislead on code that
   is indented wrongly *and* damaged. **Default: on, with a look-back of eight blocks.**
7. **A METHOD outside a class** stands at program level with an `info`, not a warning, because uploads are
   often a single pasted method. **Default: keep it.**
8. **Event blocks are not ended by `DEFINE`.** The old engine ends them there, but `DEFINE` is no processing
   block. On the corpus this changes nothing. **Default: the language reading.**
9. **Logical-database `GET node` events** are not event blocks yet (`Get` has no `event` column), because the
   corpus has none and `GET` has many other forms. **Default: leave it out until a case needs it.**
