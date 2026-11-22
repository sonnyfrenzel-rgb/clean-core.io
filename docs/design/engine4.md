# Engine 4.0: the new engine's module tree

Status: L0–L2, the Phase 0 foundation and the L3 upload layout (integrated on `integrate/engine4`, 22 November 2026). Owner decisions: ADR-124 and ADR-125 in
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
| Phase 0 | `parsed-source.ts`, `compat.ts` | `parseSource(source) → ParsedSource` (the shipping statement view, masks, container index) | built; **wired** into `readStatements` (ADR-133, 22.11.2026, `integrate/engine4`) |
| L3 Upload layout | `layout.ts`, `conventions.ts` | `layout(files) → UploadLayout`; `readUpload(files)` runs L0–L2 per part with L3's macros | built (layout and includes) |
| L4 references (first step) | `references.ts` | `references(statements, tree) → ReferenceTable`: every SAP reference with line, use and resolution | built, inert |
| L4 graded | `graded.ts`, `lib/knowledge/` | `gradeReferences(table) → GradedReference[]`: SAP's facts and a standing per reference (no A–D letter) | built, inert |
| L4 values | `values.ts` | `valueAt(valueContext(statements, tree), name, statement) → ValueAnswer`: scoped, loop- and call-aware, FORM parameters over call sites, provenance | built, inert |
| L3 declarations | `declarations.ts` | `declarations(statements, tree) → Declarations`: classes, interfaces, members, implementations | built, inert |
| L5 calls | `calls.ts` | `callGraph(statements, tree) → CallGraph`: routines, edges with dispatch and FINAL pruning, reachability | built, inert |
| rest of L3–L6 | — | screens, handler registration, exception routing, process model (review §8.1) | later |

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
| `Unknown` statements (new) | 1 (0 since the L3 step, which settles BM-141) |
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

### The wiring step, pending the owner (settled by ADR-133; built, see "Phase 0 wiring")

1. **Decision:** an ADR-125 amendment that lets `lib/abap/` import `lib/engine4/parsed-source` (and only
   that) before the switch, as the "shared foundation" of (4), with the layer guard narrowed to that one
   module.
2. One entry point (`buildAbapEvidence`, `buildProcessFacts`, …) calls `parseSource` once and passes the
   `ParsedSource` down. Readers that take `statements: AbapStatement[]` take `parsed.compat`, and
   `maskLiterals(s.text)` becomes `parsed.maskedText(s.index)`. A recovered source keeps `readBlocks` for
   its containers. One reader per commit, and the frozen digests and goldens run on each.
3. Then item 3 below.
### Phase 0 wiring (22.11.2026, `integrate/engine4`)

ADR-133 (1) settled the decision above: from the 3.5.0 line today's engine may read `ParsedSource`. The wiring is
built and proven byte-neutral. It is a pure refactor: no engine version gate, no change to any signed output.

**What is wired** (`lib/abap/statement-reader.ts`, `block-structure.ts`, `callback-registrations.ts`):

1. **`readStatements(source)` reads through `parseSource(source).compat`.** The 3.x scanner stays as
   `readStatementsShipping` and answers wherever the two readings could differ (`parseOnceFallback`):
   - a lexer error: an unterminated literal, template, template expression or native SQL block, a stray brace,
     an unknown character;
   - an L2 recovery (`recovered`);
   - native SQL or AMDP anywhere in the source (`EXEC SQL`, `ENDEXEC`, `BY DATABASE`);
   - a string template whose `{ … }` runs across lines (review §2.4; also the ER-01 case of a multi-line
     template whose last line holds a `"`);
   - a period inside a template expression, a period between two digits (`ls_p000.1`, `4.03.2011`), an unquoted
     decimal.
   Each class was found or confirmed by the mutation run below; the parsed view never serves one of them.
2. **One reading per build.** `withParsedSource(fn)` wraps the entry points `buildAbapEvidence`,
   `buildProcessFacts` (so `buildProcessSkeleton`) and `buildBusinessStatements`. Inside it a source is read
   once and `maskLiterals(text)` is computed once per text. Every caller gets fresh copies, so a reader that
   changes its list cannot change the next reader's. The scope ends with the build, so no customer source is
   kept in memory after it. The builders are synchronous, so two requests cannot share a scope.
3. **Hotspots** (review §4.3): `containerAt` answers from a painted index from the second lookup in the same
   list on (the scan stays as `containerAtScan`, the reference); `namesThisProgram` reads what a statement writes
   into a variable once per list and variable, not once per ALV registration.
4. **Verify mode:** `ENGINE_PARSE_ONCE_VERIFY=1` makes every parsed reading also run the scanner and throw on a
   difference. **Kill switch:** `PARSE_ONCE_READER = false` restores the 3.x reader everywhere.
5. The layer guard allows exactly one import of the strand from the product:
   `lib/abap/statement-reader.ts` → `../engine4/parsed-source` (`tests/engine4-layer-guard.spec.ts`).

**Proof of neutrality**

| Check | Result |
|---|---|
| `tests/fixtures/engine-v3.2.0-frozen.json`, new: 330 digests of evidence and route (7 starters, 150 learn cases, 8 probes, both editions), captured from `lib/` at 6ee15d05 **before** the wiring (`scripts/engine/frozen-digests.ts capture`) | 330 / 330 unchanged after the wiring, in verify mode |
| `engine-version-rebuild.spec.ts`: the v3.0.11 (610) and v3.0.12 (616) frozen oracles | unchanged, in verify mode |
| The three `golden-master` specs | pass, in verify mode |
| Mutation run `scripts/engine/parse-once-neutrality.ts`: the corpus and 29,550 mutated sources (CRLF, tabs, deleted, duplicated and split lines, truncation, inserted `'`, `|`, `"`, `{`, `.`) | 20,728 served by the parsed view, **0 differ** from the scanner; 8,822 fall back |
| The same on the external real-code sample (312 files, 23,400 sources) | 13,992 served, **0 differ**; 9,408 fall back (897 of them templates across lines) |
| Before the fallback rules were complete, the same run found 18 differing sources | each one is a class above now |
| Server-free specs that import `lib/` (about 490 files, 6,653 tests, the engine, golden and frozen specs among them) in verify mode | pass; the one red test (`firestore-rules.spec.ts`) needs the emulator and is unrelated. Specs that talk to the emulators were left out (shared emulators) |
| `tests/parse-once-wiring.spec.ts` | corpus byte for byte, the fallback classes, scope and copies, the container index against the scan on every line |

**Speed** (`buildAbapEvidence`, the 1,000-line starter concatenated, this machine, Node 24):

| Lines | Before | After |
|---|---|---|
| 1k | 348 ms | 116 ms |
| 10k | 7.6 s | 0.9–1.9 s |
| 20k | 25.2 s | 2.8–4.0 s |
| 25k | 31.7 s | 5.0 s (target: under 8 s) |
| 50k | 82.6 s | 10–11 s |

**Scaling guard** (`scripts/engine/scaling-guard.ts`, `tests/engine-scaling-guard.spec.ts`; 2× input ≤ 2.4× time,
median of 3): 1k → 2k 1.72×, 10k → 20k 2.12×, 25k → 50k 2.19×. Before the wiring 10k → 20k was 3.3×. The rest of
the superlinear time sits in `callback-registrations` (`valueAlongTheRun`, per registration) and `call-graph`;
both are hotspots for the next step, not needed for the guard.

**Frozen digests per release** (`scripts/engine/frozen-digests.ts`, `tests/engine-frozen-digests.spec.ts`): a
format-2 fixture per release over starters, learn halves and probes (never the holdout), captured once and never
regenerated; the spec checks every such file. The release routine should run `capture --engine vX.Y.Z --commit
<sha>` on the release commit (not yet in a workflow).

**Not done, needs the owner:** `engineDigest` in every run (review §4.2 C, §8.3). It changes what `/api/runs/create`
stores and signs, so it is no neutral refactor. Proposal: SHA-256 over the sorted `lib/abap/**` and
`lib/engine4/**` sources plus the catalog `sourceSha256`s, computed at build time into a generated module, written
on the run's model card beside `engineVersion`; a digest that matches no frozen release reads "unreleased build".

## L3 step: upload layout and includes (15.11.2026)

Owner go 15.11.2026. This is the first half of L3 in the engine review §8.1, the upload layout and the include
graph. The second half (class and interface declarations, screens) is still to come.

### Contract

`layout(files) → UploadLayout` takes `files: { name, source }[]` exactly as the product receives them:

- one pasted source;
- several files;
- an abapGit folder, where `.xml` and other non-source files are left out with a `not-source` note;
- the joined source a project stores.

`readUpload(files)` runs the layout. It then reads every part through L1 and L2 with the macro names the layout
supplies, and returns the parts in reading order.

- **`parts`**: one per file, or one per region of a joined source. Each part carries:
  - `name`: what an `INCLUDE` calls it;
  - `file`;
  - `lineMap`: back to the file's rows, for a part cut out of a joined source;
  - `object`, `role` (see below) and `how` (the reason it was attached to its object);
  - `header`;
  - `includes`: every `INCLUDE` statement with its row, its `IF FOUND` flag, its target and its state (`resolved`,
    `missing`, `optional-missing`, `generated`, `cycle` or `repeated`);
  - `defines`: classes, interfaces, function modules, FORMs, modules and macros, each with its row and whether
    it is global;
  - its L0 tokens and L1 statements, so nothing is lexed twice.
- **`objects`**, in reading order. Each has:
  - `type`: `program`, `functionGroup`, `functionModule`, `class`, `interface`, `typePool` or `include`. An
    `include` object is a loose include with no host;
  - `main`: null when the upload lacks the main part;
  - `order`: its parts in the order SAP reads them;
  - `missing`: each with the part and row that names it, whether it is optional, and whether it is a customer
    name;
  - `macros`: the macros visible in the object, and `systemMacros`, the system macros among them.
- **`primary`**: the first object. **`order`**: every part once, the objects in order, each object's parts in
  its own order.
- **`diagnostics`**: file-level, with these codes:
  - errors: `include-cycle`, `include-repeated`;
  - warnings: `missing-include` (a customer include, not `IF FOUND`), `duplicate-part`, `second-header`;
  - info: `missing-sap-include`, `include-shared`, `missing-main`, `not-referenced`, `joined-source`,
    `not-source`.
- **`activatable`**: false when an include loops or is included twice. Each part is still read once.

Pure. `layout.ts` (about 550 lines) and `conventions.ts` (about 200 lines) import only within `lib/engine4/`. The
naming conventions are data in `conventions.ts`.

### How an upload is read

1. **Parts.** Every file becomes one part, named by abapGit's part name or else by its file name without the
   extension. A single pasted file, and the main text of a joined source, are named by their header instead,
   because their file name tells nothing. A joined source is cut back into its files at the product's
   markers, and the `INCLUDE` lines the join commented out are restored. This gives the same parts and the
   same order as the original files (spec). The marker texts are declared again in `conventions.ts`, and a
   spec fails if they ever differ from `include-resolution.ts`. The `INCLUDE` statements come from L1, so:
   - `INCLUDE: a, b.` names two includes;
   - a commented-out `INCLUDE`, and `INCLUDE STRUCTURE`/`TYPE`, name none;
   - a class include written with `=` padding (`zcl_x=====ccdef`) is one name.
2. **Anchors.** A part founds or joins an object by what it says about itself:
   - an abapGit name (`.clas`, `.intf`, `.fugr.<part>`);
   - a header (`REPORT`/`PROGRAM`, `FUNCTION-POOL`, `CLASS-POOL`, `INTERFACE-POOL`, `TYPE-POOL`);
   - a `SAPL…` name;
   - a global `CLASS … DEFINITION PUBLIC` or `INTERFACE … PUBLIC`;
   - a `FUNCTION` statement in a file without an include suffix, which makes a function module of its own.

   A TOP include that carries the program's header is the TOP, not the main. That holds for `FUNCTION-POOL` in
   `LZFOOTOP` and for `PROGRAM sapmzfoo.` in `MZFOOTOP`.
3. **Includes.** Whatever an anchored part includes belongs to that part's object, transitively.
4. **Conventions**, for parts that nothing includes:
   - a class include suffix (`CCDEF`/`CCMAC`/`CCIMP`/`CCAU` after `=` or `_`; `CU`/`CO`/`CI`/`CP`/`CMnnn`
     only after `=` padding) joins that class;
   - a workbench include suffix (`TOP`, `SEL`/`SCR`, `CLS`/`Cnn`/`Dnn`, `UXX`/`Unn`, `Fnn`, `Onn`, `Inn`, `Enn`,
     `Pnn`, `Tnn`, optionally after `_`) joins its host. `L<fg>…` belongs to function group `<fg>`, `M…` to
     module pool `SAPM…`, `ZX<grp>…` to SAP's exit group `X<grp>`, and any other stem to the report of that
     name. If the upload lacks the host, the host is created with `main: null`;
   - an object's name followed by `_` joins that object (`ZBP_I_X_LHC` joins `ZBP_I_X`);
   - anything else is a loose `include` object.

   A function module in a file of its own joins the function group when the upload holds exactly one.
5. **Order.** From the main part, includes are expanded in place, depth first, exactly where their `INCLUDE`
   statement stands. In an abapGit function group, `INCLUDE l<fg>uxx` is `generated`: the module files stand
   where UXX would. Parts the main does not reach follow in the workbench's role order. So does the whole
   object when it has no main, or when it is a class whose main file holds no `INCLUDE`. The role order is:
   1. class local definitions, then class macros;
   2. TOP;
   3. main;
   4. the class sections;
   5. selection;
   6. local classes;
   7. UXX, then function modules;
   8. class local implementations, then methods;
   9. FORMs;
   10. PBO, then PAI;
   11. events;
   12. local implementations;
   13. other includes;
   14. tests.

   Objects are ordered by type (program, function group, function module, class, interface, type pool, loose
   include), with a main part before none, then by name. The order of the files never matters (spec), except
   for which of two copies of a part is kept.
6. **Macros.** An object's macros are the `DEFINE`s of all its parts, wherever they stand, plus the system
   macros that apply. A part sees the macros of every object that reads it. Another object's macros are not
   visible (spec: a class does not see a report's TOP macros).

### `RP_PROVIDE_FROM_LAST`, settled

The macro comes from the macro include `DBPNPMAC` of the HR logical databases PNP, PNPCE and PAP. Such a program
gets the include from its logical database; it does not upload it. The logical database is a program attribute,
not source, so L3 recognises the attachment by its traces in the source: `NODES peras`, `TABLES pernr`,
`GET pernr`/`GET peras`, or an `INCLUDE dbpnpmac` the code names itself. When one of these is present, the object
sees `RP_PROVIDE_FROM_LAST` and `RP_PROVIDE_FROM_FRST` as **system macros** (`systemMacros`, `from:
'hrLogicalDatabase'`). The hyphenated spellings (`RP-PROVIDE-FROM-LAST`, `RP-PROVIDE-FROM-FRST`) come from the
obsolete macro table `TRMAC` and are always visible. `INFOTYPES` alone is not a trace, because it is also used
without a logical database. A `DEFINE` of the same name in the upload wins. Only names are kept; macro bodies
are not, because expanding them is later work.

Source of the convention: the HR documentation "Programming Utilities for the Logical Databases PNP and PAP"
(PAXX, `PYINT_RMAC`), and community answers that cite it ("the program using the macro must contain the include
DBPNPMAC"). No SAP site was accessed by script. BM-141 now reads as a `MacroCall`, so the L0/L1 shadow has
**0 `Unknown` statements** (it had 1), and its spec floor is now 0.

### The shadow replaces the per-case macro union

`scripts/engine4/shadow.ts` and `shadow-damage.ts` now take each file's macros from `layout` (`macrosByFile`).
Before, they used the union of all `DEFINE`s across the case's files. L3 recognises **94 macro calls**; the
per-case union recognised 93, and no macros at all recognised 21. The difference is BM-141's system macro. No call
the union recognised is lost. BM-172's IDoc function module uses `STATUS_SETZEN` from `LZPOSTOP`, and it reaches
that macro by joining the only function group of the upload. The L0–L2 shadow numbers are otherwise unchanged.
The damage shadow is unchanged: 961/962 blocks flagged, 2 false.

### Shadow against the shipping upload path (15.11.2026)

`scripts/engine4/shadow-layout.ts` (`npx tsx scripts/engine4/shadow-layout.ts [--cases]`) runs on 157 uploads:
the 7 starter examples and the 150 learn cases. 86 of the uploads have several files, and the corpus has 394
files. The holdout is never opened. Three readings are compared:

- **join:** `resolveIncludes`, the join behind the own-code upload and a batch run;
- **concat:** `BM_CONCAT=1`, the file with the header first, then the rest by file name;
- **L3.**

| Measure | Value |
|---|---|
| Files read: join / L3 | 308 / **394** (the join leaves out 86) |
| Objects found by L3 | 101 programs, 31 function modules, 12 function groups, 77 classes, 2 interfaces, 19 loose includes |
| Same main file as the join | 128 of 157 (81.5 %) |
| The join's files in the same relative order in L3 | 133 of 157 (84.7 %) |
| Same missing includes as the join | 147 of 157 (93.6 %) |
| BM_CONCAT order equal to L3 order | 103 of 157 (65.6 %) |
| Macro calls recognised: L3 / per-case union / none | 94 / 93 / 21; `Unknown` 0 / 1 |

Every difference falls into a named category; `unexplained` is empty, and the spec fails if a new one appears:

- **`dropped-by-join:further-object`, 62 files. Verdict: L3 is right, as designed.** The join reads one program
  per upload and drops other programs, classes and function modules ("one project, one program"). L3 keeps every
  object. Whether a project reads all of them is a product decision (question 10).
- **`…join-reads-local-class-as-global-class`: 24 files in 15 multi-file cases; main 3, order 2, missing 10.
  Verdict: L3 is right, and this is a defect in the shipping upload.** `classifySource` matches the first
  `CLASS x DEFINITION` anywhere in a file, whether it is `DEFERRED` or local, and renames the include to that
  class. Two things follow:
  - `INCLUDE zrep_top.` finds nothing. The include is reported as not uploaded (BM-180, -208, -218, -288,
    -293, -295, -298: the TOP and the `C01`), and the join leaves it out as a "second program";
  - in the own-code upload the same file becomes a `second-program` **error**, which blocks the start. A
    second include with the same local class becomes `duplicate-different`.

  Reproduced in process on a three-file report: TOP with `CLASS lcl DEFINITION DEFERRED`, plus `C01`.
  `assembleOwnCode` refuses it. This matters beyond the benchmark: 15 of the 86 multi-file learn uploads hit it.
  It is a 3.x fix outside this strand (question 11).
- **`main:program-before-other-objects`, 20, and `order:other-main-object`, 15. Verdict: L3 is right (review §5
  #8).** In a report plus global class upload, the join takes whichever headed file comes first, often the
  class, and drops the report. L3 puts programs first.
- **`main:function-before-class`, 6. Verdict: a default (question 12).** With no program in the upload, L3
  reads a function module or group before classes. The join takes the first file.
- **`order:no-main-program-workbench-order`, 7. Verdict: L3 is better.** A function group or module pool
  without `SAPL…`/`SAPM…` is read TOP, function modules, FORMs, PBO, PAI. The join reads TOP and then file-name
  order, so `F01` comes before `U01`.
- **BM_CONCAT:**
  - `concat-ignores-include-order`, 34. The concatenation puts `_F01` before `_TOP` by name, so declarations come
    after their use. L3 follows the `INCLUDE` statements;
  - `concat-ignores-workbench-order`, 11;
  - `concat-interleaves-objects`, 9.

  This is a measurement artefact of the benchmark, not of the product. The product joins the same way as the
  join above.
- **`macro:system-macro`, 1 (BM-141).** See above.

### Specs

`tests/engine4-layout.spec.ts`, 28 tests, server-free:

- the conventions (suffixes, hosts, class includes, customer names, marker parity);
- one pasted source: a report, a fragment, a class, a function module, a joined source cut back with its line
  map, and unpaired markers;
- a report with chained, commented and `STRUCTURE` includes;
- independence from upload order;
- missing customer/SAP/`IF FOUND` includes;
- cycle and repeat;
- unreferenced includes;
- the `DEFERRED` TOP case, against the shipping join;
- duplicates and non-source files;
- report plus class (§5 #8);
- a lone function module joining the only group;
- function groups with and without `SAPL…` in plain and abapGit naming (UXX `generated`);
- customer exits;
- module pools with and without `SAPM…`;
- abapGit classes, SAP class-pool includes, plain-named class parts;
- the macros (cross-include, not cross-object, the HR system macro, TRMAC, an own `DEFINE` winning);
- the shadow, with floors.

The layer guard covers the two new files.

## Knowledge sources (owner requirement 15.11.2026)

Engine 4 has to use everything the shipping engine already knows, wherever it helps. This section lists every
curated list and reference source the shipping engine and its neighbours use, where each lives, how it is kept
current, and at which layer it should enter engine 4. Paths are relative to the repository root. Counts were
taken on 15.11.2026.

### Synced sources (weekly workflows; each opens a `chore/*` branch for review)

| Source | Data | Read today by | Sync | Licence | Engine 4 layer |
|---|---|---|---|---|---|
| SAP Cloudification Repository, release states (25,467 objects) | `lib/abap/generated/cloudification-repo.latest.json` | `catalog-service.ts`, `catalog-index.ts`, `sap-code-copy.ts`, then the A–D grade | `scripts/sync-cloudification-repo.ts`, `npm run sync:catalog`, `sync-catalog.yml`, Mon 06:00 UTC | Apache-2.0 (`THIRD-PARTY-NOTICES.md` §1) | L4 (a known SAP type, table or class is *void* but named, not unknown); L5 (target `external` with a release state); the readings |
| Cloudification object classifications (8,600) | `…/cloudification-repo.classifications-sap.json` | same | same | Apache-2.0 | L5/readings (the A–D grade stays outside signed packs) |
| Private Edition snapshots (4 releases) | `…/cloudification-repo.pce-*.json` | `catalog-snapshots.ts` | same, every release | Apache-2.0 | readings (grade per target release) |
| Released classes (1,417) and interfaces (3,356) | `…/released-classes.latest.json`, `…/released-interfaces.latest.json` | `key-user-candidates.ts`, `lib/transformation/*` | derived by the same sync | Apache-2.0 | L4: `TYPE REF TO` a released class or interface resolves to a known external type; L5: calls to them are `external` |
| SAP identifiers: CDS views 13,947, function modules 3,091, communication scenarios 54 | `lib/abap/generated/sap-identifiers.json` | `lib/sap-identifier-lists.ts` and the UI (the engine only cites it) | `scripts/sync-sap-identifiers.ts`, `npm run sync:identifiers`, Mon 06:45 UTC | Apache-2.0 plus CC BY 4.0 per fact | **L3** (a `CALL FUNCTION` target that is SAP's is no missing upload); L5 (`external` function module) |
| DSAG ABAP guide, structure and hashes only | `lib/generated/dsag-abap-guide.json` | `lib/dsag-guide.ts`, `lib/dsag-citations.ts` | `scripts/sync-dsag-guide.ts`, Mon 07:00 UTC | CC BY 4.0 | rule citations in the readings and findings (L6 and beyond), not parsing |
| SAP reference repos: cheat sheets, flight, Clean ABAP, abap-file-formats (metadata and hashes) | `lib/generated/sap-references/*.json` | `lib/sap-references.ts` | `scripts/sync-sap-references.ts`, `npm run sync:sap-references`, Mon 07:15 UTC | Apache-2.0, CC BY 3.0, MIT | L1 (statement kinds to cover, checked against the cheat-sheet topics); **L3** (abap-file-formats: the object types and their file parts); test inputs only as hashes, never as copied source |
| ABAP file format JSON schemas | `lib/generated/aff-schemas/*.json` | `lib/transformation/aff-schemas.ts` | same | MIT | L3, later: BDEF/CDS/SRVD files as data objects of an upload |
| SAP Architecture Center metadata | `lib/generated/sap-architecture-center.json` | `lib/sap-reference-architectures.ts` | `npm run sync:architecture-center` | Apache-2.0 | none (design and decision layer) |

### Hand-curated lists (TypeScript constants, no sync)

| List | Where | Engine 4 layer |
|---|---|---|
| SAP API catalog: tables mapped to released successors (about 80) | `lib/abap/sap-api-catalog.ts` | readings and the transformation; L5 for "is this target SAP's" |
| CDS catalog (6 table sets) | `lib/abap/cds-catalog.ts` | readings |
| SAP dictionary: tables, fields, values, function modules and BAPIs, transactions, authorisation objects | `lib/abap/sap-dictionary.ts` (pure data) | L4 (known SAP tables and fields as typed *void*); L6 (business names) |
| Plain glossary, business glossary, German terms, program domain | `lib/abap/plain-glossary.ts`, `business-glossary.ts`, `german-terms.ts`, `program-domain.ts` | L6 and the business language, not parsing |
| A–D levels, legacy technology, copied SAP code, header rules, key-user tools | `lib/abap/abcd-classification.ts`, `legacy-technology.ts`, `sap-code-copy.ts` (the `SAPM`/`SAPL` rule), `header-rules.ts`, `key-user-candidates.ts` | readings on top of L3–L5. **L3** gives `sap-code-copy` its objects: a `SAPL…`/`SAPM…` main is now an object with a type |
| Keyword and stop lists (`EVENT_KEYWORDS`, `CONDITION_KEYWORDS`, `SQL_KEYWORDS`, `KNOWN_TYPE_GROUPS` with 16 type groups, `SYSTEM_STRUCTURES`, `HYPHENATED_KEYWORDS`, …) | spread through `block-structure.ts`, `engine-rules.ts`, `security-review.ts`, `table-dependencies.ts`, … | **L1**: the kind table replaces the keyword lists, and the shadow proves it; `KNOWN_TYPE_GROUPS` belongs in **L3** (a `TYPE-POOLS` name that is SAP's is no missing upload) and L4 |
| Scope items and scenarios, SAP naming aliases | `lib/sap-scope-items.ts`, `lib/sap-curated-lists.ts`, `lib/sap-naming.ts` | readings (not the engine's parse) |
| Starter examples (7 files) | `public/starter-examples/` | every shadow and spec; already used by L0–L3 |

### What L3 uses today, and what it adds

- The **conventions** are new data in `lib/engine4/conventions.ts`. The shipping engine had none of them. It
  only knew abapGit's file names (`include-resolution.ts`) and `SAPL…` in `lib/portfolio/batch-split.ts`. The new
  data covers:
  - workbench include suffixes;
  - `L<fg>`, `M…`, `SAPL…`/`SAPM…` hosts;
  - `ZX…` exit includes;
  - class-pool includes `CCDEF`/`CCMAC`/`CCIMP`/`CCAU`/`CU`/`CO`/`CI`/`CP`/`CMnnn`;
  - abapGit parts;
  - the customer namespace;
  - the HR system macros.

  They are written from the workbench's naming and abapGit's file layout (concept only, review §12, prior art
  SAP/abap-file-formats).
- Not used yet, and next for L3:
  - `sap-identifiers.json` function modules, so a `CALL FUNCTION 'BAPI_…'` is never mistaken for a missing
    upload;
  - `KNOWN_TYPE_GROUPS`, so `TYPE-POOLS slis` is no question to the reader.

  Neither changes the layout's contract; both feed `missing` and L5.

### How `lib/engine4` consumes them without importing `lib/abap` (ADR-125 (1))

**Proposal (default built for L3, not yet for the synced data): a pure data tree `lib/knowledge/`.**

- **Synced JSON stays where the syncs write it.** Engine 4 reads it through `lib/knowledge/`: one small module per
  source, with no imports apart from a JSON import and its types. Each module exports frozen lookups such as
  `isSapFunctionModule(name)` and `releaseStateOf(object)`. The parsing and normalising code that is pure today
  moves there: `cloudification-repo.ts` already has no imports.
- **Hand-curated constants move out of logic files into `lib/knowledge/`** as pure data, for example the SAP
  dictionary and the type groups. `lib/abap/` re-exports them, so the shipping engine's behaviour and the frozen
  digests do not change. The move is a neutral refactor that the digests prove.
- **The layer guard allows exactly two import roots** for `lib/engine4/`: `./` and `../knowledge/`. A second
  guard keeps `lib/knowledge/` pure: no imports from `lib/abap/`, `lib/engine4/`, React, Firebase or I/O. The data
  then has one home and two readers, and neither engine depends on the other.
- **Versioning.** Every knowledge module exports its source's `meta`: URL, commit or `sourceSha256`, and fetch
  date. A future signed engine 4 run can record which knowledge it read, as `engineDigest` does for code (review
  §8.3).
- **Licences.** Only data that is already synced and licensed (`THIRD-PARTY-NOTICES.md`, `NOTICE`) enters, as it
  is today. No third-party source text is copied. The DSAG and reference syncs hold structure and hashes only, and
  they stay that way.
- Until that tree exists, an engine 4 layer that needs a list either keeps its own small table of names, as
  `conventions.ts` does, or waits. It never imports `lib/abap/`.

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

## Integration on `origin/dev` (22.11.2026)

Branch `integrate/engine4`, cut from `origin/dev` 6ee15d05 (v3.2.0 plus the post-release docs), with the four strand
branches merged: `build/engine4` (L0–L2), `build/engine4-parse-once` (Phase 0), `build/engine4-l3` (L3 layout) and
`build/engine4-sample-tools` (external sample). All four share e8151ad6 and were 218 commits behind `dev`. The strand
stays inert: `tests/engine4-layer-guard.spec.ts` passes, nothing outside `lib/engine4/`, `scripts/engine4/` and the
`engine4-*` specs imports it.

Conflicts were in the shared files only (`CHANGELOG.md`, `docs/design/engine4.md`, `lib/engine4/index.ts`,
`scripts/engine4/shadow*.ts`, `tests/shard-plan.json`); the code of the four branches did not overlap. The shard
plan was taken from `dev` and refreshed (`node scripts/test/shard-plan.mjs refresh`).

**One spec changed because `dev` moved under it.** `engine4-layout.spec.ts` asserted the shipping upload's
local-class defect (question 11): `resolveIncludes` reported `ZREP_TOP` and `ZREP_C01` missing. 3.2.0 fixed the
defect (07cf0e32, "an include with a local class stays an include", ADR-134 Q11), so the spec now asserts that the
shipping join and L3 agree. The L3 shadow moved with it (below).

Checks on the integrated tree: `npx tsc --noEmit` clean; `npm run lint` 0 errors (416 warnings, all pre-existing on
`dev`); the eight `engine4-*` specs, 379 tests, pass server-free
(`npx playwright test -c playwright.serverfree.config.ts tests/engine4-`).

Every offline shadow re-run against **today's** shipping readers (`dev`, 218 commits newer than the branches):

| Shadow | Result on 22.11.2026 | Change from 15.11. |
|---|---|---|
| `shadow.ts`, corpus (394 files, 33,688 lines) | statements 18,257 / 18,250, aligned 99.85 %; L2 blocks 2,729 = 2,729, containers 1,221 = 1,221, chains 100 %; `unexplained` 0 | none |
| `shadow-damage.ts`, corpus (962 damages) | victim flagged old 907, new 961; false unterminated old 35, new 2 | none |
| `shadow-parsed.ts` (Phase 0 proof) | `compat` = `readStatements` 394 / 394; masks 18,257 / 18,257; containers and `containerAt` 394 / 394; damaged 961 / 962, containers 814 (all others `recovered`) | none: today's readers still match `ParsedSource` byte for byte |
| `shadow-layout.ts` (157 uploads) | join reads 335 files (drops 59, all `further-object`), L3 394; main file agrees 131 (83.4 %); missing includes agree 157 (100 %) | join-reads-local-class category gone (fixed in 3.2.0); main 128 → 131, missing 147 → 157 |
| `shadow.ts --corpus` sample (312 files, 174,591 lines) | statements 105,703 / 105,738, aligned 99.96 %; `Unknown` 12; unterminated old 167, new 1 (the true `ENFIF`) | none |
| `shadow-damage.ts --corpus` sample (817 damages) | victim flagged old 755, new 816; false unterminated old 59, new 9 | none (ADR-134 Q5/Q6 not built yet, see next steps) |
| `timing.ts` (L0+L1 / old statements) | 1k 3 / 13 ms, 10k 20 / 117 ms, 25k 45 / 568 ms, 50k 147 / 1,119 ms | within noise |
| `timing-parse.ts` (one read, old / new) | 1k 4.0×, 10k 3.3×, 25k 5.0×, 50k 5.3× | within noise (this machine, Node 24) |

## ADR-134 Q5, Q6 and Q9 built (22.11.2026, `build/engine4-p12`)

- **Q5, a lost `END-OF-DEFINITION`** (`statements.ts`, `blocks.ts`): a macro body ends at the first routine, class,
  interface or event boundary, or at the first statement that starts a line at or left of the `DEFINE` column. The
  statement is read as code again, and L2 ends the `DEFINE` before it as `unclosed` (the `unclosed-block`
  diagnostic stands on the `DEFINE`).
- **Q6, indentation only where damage is** (`blocks.ts`): `blocks()` reads first as the compiler does (the
  nearest open block takes every closer). Only if that pass finds damage (an unclosed block, a stray closer or
  middle) is the routine around the damage read a second time with indentation as the tie-breaker (look-back 8).
  Two linear passes at most. A spec shakes the indentation of every starter example (0–12 columns per line): no
  diagnostic, the same tree.
- **Q9, `GET <node>`** (`statement-kinds.ts`): rows `GetBit`, `GetCursor`, `GetLocale`, `GetPfStatus`,
  `GetRunTime`, `GetDataset`, `GetProperty`; then `GetNode` (`GET <node> [LATE] [FIELDS …].`) is an event block.
  The compat container view (`parsed-source.ts`) folds a GET event into the event right before it, or leaves it
  out, as `readBlocks` does, so `ParsedSource.containers` stays the shipping view.

| Shadow | Before (22.11. integration) | After |
|---|---|---|
| Damage, learn corpus (962) | victim flagged 961, collateral 1 region, false unterminated 2 | 961, collateral 1, false **1** |
| Damage, public sample (781 of 300 files) | — (817 incl. owner: collateral 90, false 9) | 780 / 781 flagged, collateral **1**, false **1** |
| Damage, owner copy (36 of 12 files, `scratch/engine4-sample-desktop`) | | 36 / 36, collateral 0, false 0 |
| Clean public sample: unterminated old / new | 167 / 1 | 167 / 1 (unchanged) |
| Learn corpus L2 containers | 1,221 = 1,221 | 1,220 + 1 range cut by a GET event (BM-151), + 3 new GET events (BM-141, -146, -151), category `get-node-is-an-event` |
| Category `unclosed-macro-body-reads-on-as-macro` | 8 | gone |

The damage shadow now also accepts an event block that ends earlier because the deleted line was its last
statement (an event has no closer); this changes no number of the old engine.

**Neutrality** (these three files feed today's reader through `parseSource`): frozen digests 330 / 330 unchanged;
mutation run on the corpus 29,550 sources, 20,728 served, 0 differ; on the public sample 22,500 sources, 13,454
served, 0 differ.

**Owner sample path.** `manifestCorpus` refuses any file under `Desktop`, `OneDrive…` or `mike-local`. The owner
group is read from `scratch/engine4-sample-desktop` through a manifest of its own, never through the `source`
paths of `scratch/engine4-sample/MANIFEST.json`.

## L4: references (22.11.2026, first step of Phase 2)

Engine review §8.1 L4 ("symbols") starts with the part a reader of clean core needs first: **every SAP object the
code points at, countable, with its line**. An external review (22.11.2026) named the gap in today's engine: only
`SELECT` tables and `CALL FUNCTION` literals become findings; `TYPE REF TO cl_gui_alv_grid`,
`cl_salv_table=>factory( )` and `CREATE OBJECT` get none, although the catalog already grades classes and
interfaces (1,461 CLAS and 3,385 INTF rows; `gradeSapObject` answers `CL_GUI_ALV_GRID` and `CL_SALV_TABLE` B,
`IF_HTTP_CLIENT` D). The gap is extraction, not knowledge. This step closes the extraction, inert.

### Contract

`references(statements, tree) → ReferenceTable` (`lib/engine4/references.ts`, exported from `index.ts`):

- `references`: one `Reference` per name, in source order, with
  - `kind`: `class`, `interface`, `classOrInterface` (the syntax does not say which: `TYPE REF TO x`, `x=>c`),
    `exception`, `type`, `table` (database table or view, CDS included), `functionModule`, `messageClass`,
    `authorizationObject`, `transaction`, `program`, `transformation`, `typePool`;
  - `use`: `typeRef`, `type`, `staticAccess`, `interfaceAccess`, `instantiation`, `cast`, `catch`, `raise`,
    `raising`, `inherit`, `implement`, `friend`, `declare`, `read`, `write`, `call` / `callRemote` /
    `callUpdateTask` / `callNewTask` / `callBackgroundTask`, `message`, `authorityCheck`, `callTransaction`,
    `leaveToTransaction`, `submit`, `performInProgram`, `transform`, `typePool`;
  - `statement`, `row`, `col`; `component` (`TYPE vbak-vbeln`), `number` (`MESSAGE e001(zmsg)`);
  - `resolution`: `static` (a name), `literal` (`'X'`), `constant` (`CONSTANTS … VALUE`), `value` (`DATA …
    VALUE`, never written again), `assigned` (a literal on the straight path before the use), `onlyValue`
    (every write in the source puts the same literal in), `declaredType` (`CREATE OBJECT o` with `o TYPE REF TO
    x`), `dynamic` (unresolved: `name` null, `candidates` = every literal the source writes into the variable);
  - `via`: the variable and the row its value was set on;
  - `defined`: the source defines the name itself (local class, interface or type; the uploaded class).
- `definitions`: the classes, interfaces and types the source defines.
- `counts`: references per kind that the source does not define — the countable claim.

**Straight path** (`assigned`): the last mention of the variable before the use is a literal write, and the write
stands in the same branch of every block around it as the use (the L2 branch path is a prefix). A write in the
`THEN` branch and a use after `ENDIF`, or in the `ELSE` branch, is no straight path. Any other mention between
(a read, an `INTO`, a `CHANGING`) ends the straight path: the claim is conservative by construction.

**What it does not do:** it knows no catalog. Whether a name is SAP's, its level, its release state and its
successor are the consumer's question: today the shadow asks `lib/abap/catalog-service.ts` (scripts may);
engine 4 will ask `lib/knowledge/` (ADR-133 (2)) at L5/the readings. Level and successor are therefore not fields
of `Reference`; a graded reference is `Reference & { level, state, successor }` one layer up. It does not follow
data across routines (L4 proper: scopes and data flow) and does not expand macros (it reads macro bodies as code).

### What is extracted, by statement

| Source | Reference |
|---|---|
| `TYPE x`, `TYPE [STANDARD…] TABLE OF x`, `TYPE LINE OF x`, `TYPE RANGE OF x`, `CREATE DATA … TYPE x`, `INCLUDE TYPE x`, `SELECT-OPTIONS … FOR x-f` | `type` (built-in and generic types left out) |
| `TYPE REF TO x` | `classOrInterface`, `typeRef` |
| `x=>m`, `x~m` (outside SQL) | `classOrInterface` `staticAccess`, `interface` `interfaceAccess` |
| `NEW x( )`, `CAST x( )`, `CONV/VALUE/CORRESPONDING/EXACT/REF x( )` | `class` `instantiation`, `classOrInterface` `cast`, `type` |
| `CREATE OBJECT o [TYPE x | TYPE (v)]` | `class` `instantiation`; without `TYPE` from `o`'s declaration (`declaredType`) |
| `CLASS … INHERITING FROM x`, `FRIENDS x`, `INTERFACES x`, `ALIASES … FOR x~m` | `class` `inherit`, `classOrInterface` `friend`, `interface` `implement` |
| `CATCH x y`, `RAISE [RESUMABLE] EXCEPTION TYPE x`, `RAISING x` (METHODS, FORM, EVENTS) | `exception` |
| `MESSAGE e001(x)`, `MESSAGE ID 'X'|v`, `REPORT … MESSAGE-ID x` | `messageClass` (with the number) |
| `AUTHORITY-CHECK OBJECT 'X'|v` | `authorizationObject` |
| `CALL TRANSACTION 'X'|v`, `LEAVE TO TRANSACTION` | `transaction` |
| `CALL FUNCTION 'X'|v [DESTINATION|IN UPDATE TASK|STARTING NEW TASK|IN BACKGROUND TASK]` | `functionModule` with the call form |
| `SUBMIT x|(v)`, `PERFORM f IN PROGRAM x`, `PERFORM f(x)` | `program` |
| `SELECT/OPEN CURSOR/WITH … FROM x | JOIN x | FROM (v)`, `UPDATE x`, `INSERT x FROM` / `INSERT INTO x`, `MODIFY x FROM`, `DELETE FROM x` / `DELETE x FROM`, `TABLES x` | `table` `read`/`write`/`declare`; a declared data object is an internal table, not a reference |
| `CALL TRANSFORMATION x|(v)`, `TYPE-POOLS x` | `transformation`, `typePool` |

### Shadow against today's evidence (`scripts/engine4/shadow-references.ts`)

For each reference the source does not define: the catalog's level (`gradeSapObject`, A–D or not listed) and
whether `buildAbapEvidence` names the object in a finding, on its line or anywhere. Corpus: 394 files (starters
and learn halves, never the holdout).

| Kind | Refs | Defined in source | Dynamic resolved / open | SAP-listed | A/B/C/D | Named by today (line / anywhere) | Listed C/D, never named |
|---|---|---|---|---|---|---|---|
| type | 3,207 | 520 | 0 / 0 | 2,378 | 52/0/1,951/375 | 3 / 413 | 2,016 |
| table | 754 | 0 | 0 / 1 | 516 | 1/0/263/252 | 476 / 701 | 47 |
| functionModule | 457 | 0 | 0 / 8 | 409 | 0/190/218/1 | 228 / 232 | 209 |
| classOrInterface | 403 | 35 | 0 / 0 | 159 | 31/71/24/33 | 1 / 1 | 57 |
| exception | 304 | 44 | 0 / 0 | 79 | 15/33/24/7 | 1 / 3 | 31 |
| messageClass | 145 | 0 | 0 / 7 | 1 | 0/0/1/0 | 0 / 0 | 1 |
| class | 114 | 32 | 0 / 2 | 41 | 21/4/16/0 | 0 / 1 | 16 |
| interface | 104 | 29 | 0 / 0 | 59 | 19/8/32/0 | 1 / 2 | 32 |
| authorizationObject | 33 | 0 | 0 / 0 | 23 | 0/0/23/0 | 0 / 0 | 23 |
| program, transaction, typePool, transformation | 42 | 0 | 1 / 4 | 33 | 0/0/33/0 | 25 / 25 | 13 |
| **all** | **5,563** | **660** | **1 / 22** | **3,698** | | **735 / 1,378** | **2,445** |

On the external real-code sample (312 files, more object-oriented): 25,468 references, 6,984 defined in the source;
classes, interfaces and exception classes 14,882 (of them 5,865 SAP-listed), named by today's evidence 79 times;
873 listed as C or D and never named.

**Verdict on the review's claim: confirmed.** Of 925 class, interface and exception references in the corpus
(338 SAP-listed), today's evidence names 7; 136 are listed C or D and never named. Tables and function modules are
covered (701 of 754 and 232 of 457 named; the function modules not named are mostly classic APIs and BAPIs that
today answer in the coverage report, not as findings).

**The other way round:** 11 objects today names that the table does not hold, all explained — `PERAS`
(logical-database node, question 9), names read out of native SQL and AMDP bodies (`WMS`, `:IT_VERBRAUCH;`),
enhancement and transport names that are no objects, and one CDS call with parameters that today names with its
bracket (`ZI_OFFENEPOSTEN(`). The spec pins the set.

**What the numbers say for the readings:** the `type` row is mostly DDIC data elements and structures, which the
catalog lists as C (not released for ABAP Cloud). Counting them is right; reporting each one as a finding would
be noise. A reading on top of L4 should group them (per object, per level) and show them in the IT view, not
as one finding per line. That is a product decision for the readings (question 18 below).

**Dynamic names in the corpus:** 23 of 5,563 are dynamic; 1 resolves (a transaction), 22 stay open with their
candidates. The resolution rules are proven by the spec, not by corpus volume; the sample adds 5 resolved and 98
open.

### Specs

`tests/engine4-references.spec.ts`: every kind on one program (33 references, each with row, use and
resolution), the branch rule, local definitions and internal tables, and the shadow floors.

## L4: values — which values a name can hold (22.11.2026, `build/engine4-p12`)

The independent engine review of 22.11.2026 (A1–A3) found the first-step resolver of the reference table unsound:
it took the last write in **source order**, across routines and event blocks, ignored scopes (a `CONSTANTS` of one
FORM resolved the same name in another) and ignored loops (a write after the use inside a `DO` never reached it).
Probe `p11`: a global set to `'Z_HARMLESS_READ'`, then `PERFORM call_it`, then set to `'BAPI_ACC_DOCUMENT_POST'`,
then `PERFORM call_it` again — the table answered `BAPI_ACC_DOCUMENT_POST` (`assigned`) for the call in the FORM.

`lib/engine4/values.ts` replaces it: `valueContext(statements, tree)` once, then `valueAt(context, name, statement)`
→ `{ name, resolution, row, candidates, provenance, scope }`. `references()` asks it for every dynamic name.

- **Scope from L2.** Names declared in a FORM, method, function module or module (including the FORM's and the
  method's parameters, from `FORM …` and the class definition's `METHODS …`) are that routine's; a class's attributes
  are the class's; the rest is global. Only mentions in the same scope count.
- **Straight path** (`assigned`, `value`): the last mention before the use is a literal write **in the same
  processing unit** (routine or event block), on a branch path that is a prefix of the use's; no loop around the use
  but not the write mentions the name; for a name that is not routine-local, no call (PERFORM, CALL FUNCTION/METHOD,
  a functional call, `CREATE OBJECT`, `RAISE EVENT`, a macro, an unknown statement) stands between them or in such a
  loop.
- **FORM parameters** (`parameter`): closed over every `PERFORM` of the upload, each actual resolved at its call site
  (literal, constant, or recursively, depth 4). No call site, a dynamic `PERFORM (lv)`, or `PERFORM f IN PROGRAM x`
  / `f(x)` (the reading cannot see that program's arguments) keep it open. The closed world is the upload.
- **Off the straight path** (`onlyValue`) every write in the scope must put in the same literal **and the start
  value must be that literal too**: a variable declared without `VALUE` can reach the use blank. The metamorphic
  spec found this: adding `g1 = 'Z_W'` in an uncalled FORM turned an open answer into `Z_W onlyValue`.
- **Provenance:** every answer lists the writes and call sites it read, with row, value and how (`declaration`,
  `constant`, `assignment`, `move`, `other`, `callSite`).

**Proof.** `tests/engine4-values.spec.ts`: A1 (scope: a constant of another FORM, a local hiding a global, a class
attribute per class), A2 (a write after the use in a loop; a write before it in the same iteration; a call in the
loop), A3 (two writes before two PERFORMs; a call between write and use opens a global, not a local; another event
block), FORM parameters (one value, two values, a constant passed in, no site, `IN PROGRAM`, dynamic PERFORM).
**Metamorphic:** 400 random reports with globals, FORMs, parameters, locals, IF/DO nesting and PERFORMs, each under
five transformations that only add paths (FORMs reordered, a write wrapped in IF, wrapped in DO, another call site,
another write in another FORM): no answer becomes more certain (`constant` > `value` = `assigned` > `parameter` >
`onlyValue` > open) or a different single value, over more than 3,000 compared answers.

**Shadow** (`scripts/engine4/shadow-values.ts`, the first-step resolver pinned in the script):

| Corpus | Dynamic names | Old resolved / open | New resolved / open | Changed |
|---|---|---|---|---|
| Learn corpus (394 files) | 23 | 1 / 22 | 1 / 22 | none |
| Public sample (300 files) | 101 | 4 / 97 | 2 / 99 | 2 newly open (`sy-msgid` in mockup loader: a call between write and use; the start value may reach the use) |
| Owner copy (12 files) | 2 | 1 / 1 | 1 / 1 | none |

Different single value: 0 everywhere. The real corpora hardly meet the unsound cases (their dynamic names were
open already); the probes and the metamorphic generator do. Inert: nothing in the product reads `values.ts`.

## Retiring the other splitters (22.11.2026, `build/engine4-p12`)

`declaration-parser.tokenize` and `plain-language`'s statement split now read the parse-once tokens, the way
`readStatements` does since Phase 0 — a pure refactor, no gate:

- `statement-reader.ts` exports `parsedSource(source)` (one `ParsedSource` per source and build inside
  `withParsedSource`, which `readStatements` now shares) and `periodStatements(parsed)`: the source statements cut at
  every period, chains not expanded, per row the text from the first to the last code token.
- `tokenize` joins those pieces with one blank, as its scan did; `plainStatements` collapses whitespace, as its scan
  did. Each keeps its 3.x scan (`tokenizeShipping`, `splitStatements`) as reference and fallback: every
  `parseOnceFallback` reason, plus for `tokenize` a **bare carriage return** (one line for the scan, a line break
  for the lexer) and for `plain-language` an **indented `*` line** (a comment for the lexer, code for the scan) and
  a **template with an escape** (`|a\|b|`: the scan knows no escape and ends the template there). The last two are
  defects of the old scans that the move keeps, byte-neutral; fixing them is a gated reading.
- Verify mode (`ENGINE_PARSE_ONCE_VERIFY=1`) compares both with their scans and throws on a difference.

| Proof | Result |
|---|---|
| `scripts/engine/splitter-neutrality.ts`, learn corpus + mutations (30,732 sources) | `tokenize` 21,116 served, 0 differ; plain 21,305 served, 0 differ |
| …public sample (23,400 sources) | `tokenize` 13,439 served, 0 differ; plain 13,432 served, 0 differ (the template-escape class was found here: 101 differences before the rule) |
| Frozen digests | 330 / 330 unchanged |
| Parse-once mutation run | 20,728 served, 0 differ (unchanged) |
| 355 server-free spec files that import `lib/` or `scripts/`, in verify mode | 6,137 passed; 5 failed, none from this change: two shard-plan checks (the new specs, refreshed below), the public-text inventory (`engine4.md` has no entry, as on `integrate/engine4`), and two that fail on this machine for reasons of their own (`tar` in `sec-2026-897-902`, CRLF in `test-run-lock`) |

## L3 second half: class and interface declarations (22.11.2026, `build/engine4-p12`)

`declarations(statements, tree)` (`lib/engine4/declarations.ts`) reads every `CLASS … DEFINITION` and `INTERFACE`
block of L2 and every `CLASS … IMPLEMENTATION`: options (global, ABSTRACT, FINAL, CREATE, FOR TESTING, INHERITING
FROM, FRIENDS, GLOBAL FRIENDS), and per member its section and flags — methods (static, abstract, final,
redefinition, constructor, class constructor, FOR TESTING, `FOR EVENT e OF t`, parameters with direction, passing,
type, OPTIONAL, DEFAULT, PREFERRED, RAISING, classic EXCEPTIONS), attributes (static, READ-ONLY, constant, type,
value; a `BEGIN OF … END OF` structure is one attribute), events, aliases, interfaces (with ABSTRACT/FINAL METHODS,
ALL METHODS ABSTRACT), types. Implementations map each `METHOD x.` (`INTF~M` included) to its L2 block — the input
of the call graph. `DEFERRED`/`LOAD` names are `announced`; `LOCAL FRIENDS` is a friendship, not a class.

**Shadow against `parseDeclarations`** (`scripts/engine4/shadow-declarations.ts`; `unexplained` empty on both):

| | Learn corpus | Public sample |
|---|---|---|
| Types old / new / options agree | 152 / 152 / 152 | 548 / 610 / 533 |
| Members old / new / agree | 514 / 439 / 424 | 5,693 / 5,480 / 5,428 |
| `old-reads-structure-components-as-attributes` | 64 | 177 |
| `old-reads-begin-of-as-an-attribute` | 22 | 72 |
| `new-reads-the-begin-of-structure-name` | 11 | 36 |
| `old-cuts-an-interface-method-name` (`METHODS if_x~m REDEFINITION` read as `IF_X`) | 8 | 30 |
| `old-splitter-stops-before-it` (the old splitter never closes a literal and reads nothing after it) | — | 77 types in 4 files |
| `old-reads-local-friends-as-a-class` | — | 15 |
| `method-named-like-an-option` (`METHODS abstract …`) | — | 2 |

Every category is an old-parser defect except the static flag of constants, which the shadow compares as the old
parser writes it: a constant is a static attribute in ABAP (`class=>c`), and L3 says so.

## L5 first step: the call graph (22.11.2026, `build/engine4-p12`)

`callGraph(statements, tree)` (`lib/engine4/calls.ts`): every routine (FORM, `METHOD CLASS=>M`, FUNCTION, MODULE,
event block, program level) and one edge per call — PERFORM (static; dynamic through `values.ts`; `IN PROGRAM`
external), CALL FUNCTION (through the reference table, so values resolve variables), method calls with the class
from the call or the receiver's declared type, **dispatch** over subclasses that redefine and over interface
implementers, **FINAL pruning** (a FINAL class or method has one target), `super->` without dispatch, constructors,
and `RAISE EVENT` to every `FOR EVENT` handler (an over-approximation until handler registration is read).
Reachability from the entries (events, program level, modules, function modules, public methods of a global
class, interface methods of a global class, class constructors, event handlers, FOR TESTING methods); `certain`
only without a dynamic or unresolved edge.

**Shadow against `readCallGraph`** (`scripts/engine4/shadow-calls.ts`; today has PERFORM edges only):

| | Learn corpus | Public sample |
|---|---|---|
| PERFORM edges old / new / agree | 217 / 217 / 217 | 326 / 326 / 326 |
| Unreachable FORMs old / new / agree | 296 / 296 / 296 | 34 / 34 / 34 |
| Method call edges static / dispatch / external / unresolved | 92 / 9 / 229 / 116 | 5,507 / 314 / 7,323 / 847 |

Not built yet: handler registration (`SET HANDLER`), callbacks by name (`callback-registrations.ts` today),
screens ↔ modules, user-exit includes, exception routing, chained calls past the first link, EML.

## L4: graded references through `lib/knowledge/` (22.11.2026, `build/engine4-p12`)

ADR-133 (2) built, facts only. `lib/knowledge/` holds:

- `cloudification.ts`: SAP's release file (latest) and classification file, read from where the sync writes them
  (`lib/abap/generated/*.json`), with their `meta` (`CLOUDIFICATION_META`: source, release, fetch date, `sourceSha256`).
  `sapFacts(name)` → listed, release state, classification state, object type, successors, SAP's or the customer's.
- `identifiers.ts`: released classes (1,417) and interfaces (3,356), released CDS views (public and private lists),
  SAP's classic BAPIs (3,091).
- `type-groups.ts`: the sixteen SAP type groups, held equal to `KNOWN_TYPE_GROUPS` of `table-dependencies.ts` by a spec.

The tree imports only itself and the synced JSON (`tests/engine4-layer-guard.spec.ts`, new test); `lib/engine4/`
may import `./` and `../knowledge/` and nothing else. **No level rule moved:** the A–D letter is a rule on top of the
facts (`abcd-classification.ts`) and a signed-pack guard (`tests/process-overlays.spec.ts`) watches that module by
path; moving it needs its guard moved with it, which is a coordinated step with the strand that works on the
class-gap findings, not this one.

`lib/engine4/graded.ts`: `gradeReferences(table)` → every reference the source does not define, with `facts` and one
`standing`: `customer`, `released`, `classicApi`, `notReleased`, `unlisted` (an SAP-looking name neither file holds),
`unknown` (namespaced and unlisted, or a dynamic name that stays open). The release state decides before the
classification, as in the level rule (`CL_HTTP_CLIENT`: `classicAPI` and `notToBeReleased` → `notReleased`).

**Shadow** (`scripts/engine4/shadow-knowledge.ts`): the facts `sapFacts` reads equal the facts `getSapObjectStates`
reads for every reference — **4,881 / 4,881** on the learn corpus, **18,032 / 18,032** on the public sample. Each
standing maps to exactly one level of today's rule on the corpus (released → A 139, classicApi → B 306,
notReleased → D 668, unlisted → C 2,538, customer → no level 1,168); on the public sample notReleased is D 132 or C
12 (deprecated with a successor), as the rule says. The reading that turns standings into findings (question 18,
the class/interface/exception gap) is the gated step after this.

## Fuzz corpus (22.11.2026, `scripts/engine4/fuzz.ts`, outside CI)

Every engine 4 layer (L0 coverage, L1, L2 tree invariants, `parseSource`, L4 references, the value reading of every
dynamic name, the ledger) over a corpus and 17 mutations (truncation, deleted/inserted characters, deleted and
duplicated lines, inserted `'` `|` `{` `` ` ``, dropped periods, bare CR, BOM+CRLF, NBSP and tabs, upper case,
shuffled lines, everything on one line, random indentation), each read twice for determinism.

| Corpus | Sources | Throws | Nondeterministic | Slowest (all layers, one read) |
|---|---|---|---|---|
| Public sample (300 files) | 8,700 | 0 | 0 | 581 ms (7,925 lines) |
| Owner copy (12 files) | 348 | 0 | 0 | 121 ms (2,764 lines) |

## Statement ledger (design, 22.11.2026)

**Goal:** `coverage.complete` becomes a provable claim. Today it is computed from what the detectors know to be
unassessed (`coverage.ts`); a statement no detector looks at and no rule lists is silently "covered". A sweep of
109 non-holdout repository files (5,748 statements, 22.11.2026, by another agent with `@abaplint/core` as an
offline oracle) found 117 statement types, 81 of which never get a finding or a coverage gap (`ROLLBACK WORK`,
`MESSAGE`, `CALL KERNEL`, `RECEIVE`, `READ ENTITIES`, `WAIT`, `LEAVE …`). That set is the shadow baseline.

**Design:**

1. **Every L1 statement gets exactly one ledger state:**
   - `judged(by: reader[])`: at least one reader read it and either produced output (a finding, a node, a fact)
     or recorded an explicit "nothing to say" verdict for it;
   - `neutral(reason)`: its kind carries a reason in the kind table that no reader needs to look at it
     (declarations without a reference, closers, `ELSE`, list output such as `WRITE`/`ULINE`/`SKIP`, comments
     are no statements). The reason is data in `statement-kinds.ts` (a `neutral` column), reviewed once per kind;
   - `unread`: everything else. **`Unknown` statements and any kind without a reader and without a reason fall
     here.**
2. **Readers register what they read.** A reader receives `ParsedSource` and a `Ledger` handle and calls
   `ledger.judge(statementIndex, readerId)` for every statement it consumed. In engine 4 every reading is such a
   reader; in today's engine the readers that move onto `ParsedSource` register as they move (one reader per
   commit, frozen digests unchanged, because the ledger is beside the evidence, not in it).
3. **`coverage.complete` = no `unread` statement.** The coverage report lists the unread ones with their lines,
   grouped by kind ("12 statements of a kind the engine does not read: `CALL KERNEL` 1, `RECEIVE` 3, …").
4. **Shadow:** the ledger against today's `coverage`: every statement today calls covered that the ledger calls
   `unread` is a silent gap (the 81 kinds), every statement today lists as a gap that the ledger calls judged is
   a contradiction. The abaplint sweep supplies the statement-type baseline (offline only, ADR-125 (5)).
5. **Gate:** the ledger changes what a run says about completeness, so its effect on the evidence is a gated
   reading (from the release that switches it); the ledger itself is computed for every run and is not signed
   until then.
6. **Lexical defects** (ER-01, a multi-line template with `"` on its last line) make the statement list itself
   wrong; L0 already reads that case correctly and the parse-once fallback keeps the shipping reading for it, so
   the ledger must report a source that fell back (`parseOnceFallback` reason) as "read by the old reader" until
   that reader is retired.

Effort: the kind-table column and the ledger type are small (S); registering today's ~40 readers is the bulk (M,
one reader per commit); the shadow and the coverage wording are S each.

## Statement ledger by effect class (built inert, 22.11.2026, `build/engine4-p12`)

The engine review of 22.11.2026 (§3 L1) replaced the per-reader design above: instead of every reader calling
`ledger.judge(i)`, **every row of the kind table carries an effect class** (`effect` in `statement-kinds.ts`, required
by the type, so a new row does not compile without one): `declaration`, `structure`, `control`, `compute`, `dbRead`,
`dbWrite`, `transaction`, `callOut`, `ui`, `fileMemory`, `authorization`, `dynamic`, `unknown`. Block closers are
`structure`; a macro body is `structure` (it runs where the macro is called; the call is `dynamic`).

`lib/engine4/ledger.ts`:

- `effectOf(statement, references)` refines the kind's class per statement: `INSERT`/`UPDATE`/`MODIFY`/`DELETE`
  are `dbWrite` only where L4 names a database table written, else `compute` (an internal table); a statement whose
  object name stays open (`CALL FUNCTION lv` without one value, `values.ts`) is `dynamic`.
- `ledger(statements, consumers, { references, fallback })`: a statement is `neutral` (`declaration`, `structure`),
  `claimed` (a consumer claims its class) or `unclaimed`. `complete` = no unclaimed statement, no `Unknown`, no
  fallback reason. `unknown` cannot be claimed. `unclaimedKinds` is the coverage wording ("12 statements of a kind
  the engine does not read: …").
- `ENGINE4_CONSUMERS` today: only L4 references (`dbRead`, `dbWrite`, `authorization`). Engine 4's own ledger is
  therefore complete on 29 of 394 corpus files, honestly, until L5/L6 readings claim the rest.

**Shadow against today's engine** (`scripts/engine4/shadow-ledger.ts`): a statement is *judged today* when a finding
covers its lines, a coverage gap stands on its line, or a process-skeleton node is anchored on it; otherwise it
passes *silently*.

| | Learn corpus (394 files, 18,250 statements) | Public sample (300 files, 88,118) |
|---|---|---|
| Files today calls `coverage.complete` | 190 | 162 |
| …of them with silent statements of an effect class | **154** (1,643 statements) | **142** (6,986) |
| `dbWrite` silent | 0 of 115 | 1 of 90 |
| `dbRead` silent | 8 of 479 | 36 of 355 |
| `transaction` silent | 14 of 85 (all `ROLLBACK WORK`) | 14 of 24 |
| `fileMemory` silent | 20 of 50 | 146 of 154 |
| `ui` silent | 642 of 1,438 | 803 of 1,072 |
| Kinds of an effect class today never judges | 31 | 49 |

The 31 on the learn corpus (pinned in `tests/engine4-ledger.spec.ts`; a kind leaves the list when a reading starts
judging it): selection-screen declarations (`PARAMETERS` 298, `SELECT-OPTIONS` 90, `SELECTION-SCREEN` 88),
`Unknown` 73 (macro calls of another include: the ledger reads one file at a time here), `SORT`, `ADD`,
`SET PF-STATUS`, `WAIT`, `SET TITLEBAR`, **`ROLLBACK WORK` 14**, `COLLECT`, `ENDEXEC`, `MOVE-CORRESPONDING`,
`GET TIME`, `REFRESH`, `SPLIT`, `SET PARAMETER`, **`READ ENTITIES` 6**, `CALL TRANSFORMATION`, `DESCRIBE`,
`TRANSLATE`, `GET CURSOR`, `CATCH SYSTEM-EXCEPTIONS`, `SUM`, `ASSIGN`, `REJECT`, `RETRY`, `HIDE`, `FETCH`,
`CLOSE CURSOR`, `CONDENSE`. This confirms the abaplint sweep's finding (81 statement types without a finding or gap
on 109 files) with our own classes: "complete" today is a statement about the detectors, not about the program.

**Gate:** the ledger changes what a run says about completeness, so it reaches a run only as a gated reading of the
switch; until then it is computed in the shadow only.

## Phase 3: the skeleton builder as typed passes (22.11.2026, `build/engine4-p3`)

Owner decision 22.11.2026: engine 4.0 complete by 3.5.0, phases 1–4; the switch rule stays. Engine review §8.1 (L6)
and §8.5 (phase 3, "highest risk"). This section is the plan, written before the first pass moved, and the
ledger of what moved.

### What is split

`SkeletonBuilder` in `lib/abap/process-skeleton.ts` (5,817 lines in the file on `integrate/engine4`, about 4,600
in the class; the review counted 4,312 on 13.11.) builds the whole skeleton in one stateful object: 4 graph
arrays, an id allocator and about 50 private fields that one method writes and another reads later. Its
`build()` is already a sequence of passes; the seams are the calls in that method. Nothing about the order is
changed by the split: the order *is* the 60 days of decisions the review warns about, so each pass keeps its
place in `build()` and only moves out of the class.

### The model and the pass signature

- `lib/abap/skeleton/graph.ts`: `SkeletonGraph` — `nodes`, `edges`, `regions`, `notes` and the node-id
  allocator (`addNode`, rule 7; `connect`; `note`). One object, mutable, handed from pass to pass. Its arrays may be
  replaced (`graph.nodes = graph.nodes.filter(…)`); only `addNode` mints an id. `SkeletonReadings` (`reads310`,
  `reads320`) and `Exit` live here too.
- A pass is a function `pass(graph, input, readings?) → void | product`. `input` is a typed interface named after
  the pass that lists exactly what the pass reads besides the graph; the walk's products a pass needs (early ends,
  lane evidence, reached routines …) are fields of it. A pass imports only types from `process-skeleton.ts`, so
  the builder imports the passes and never the other way round.
- Shared readers move once, unchanged: `skeleton/anchors.ts` (`anchorOf`, `tokenIndexOf`, `bodyRange`, `snippet`,
  `programName`), `skeleton/statement-readers.ts` (`leavesDialogStep`, `resultParameters`, `assignmentTarget`,
  `classOf`), `skeleton/keywords.ts` (`FLOW_BLOCKS`, `ARM_HEADERS`, `LOOP_CLOSERS`, the report ranks). These files
  are where the recognisers gather — the "one recogniser per concept" half of phase 3 starts from them.

### The passes, in `build()` order

| # | Pass | Module | Input (besides the graph) | Output | Reading |
|---|---|---|---|---|---|
| 1 | declarations | `skeleton/declarations.ts` | statements, blocks, branches, call graph | `SourceDeclarations`: blocks by opener, branches, macros, forms, routines, methods, classes, superclasses, function and enhancement blocks, externally callable methods, selection names, local data, batch input, method call sites, candidate sites, event handlers | `reads320` (candidate sites, dispatch) |
| 2 | effects | `skeleton/effects.ts` | `SourceDeclarations`, branches | effects per routine, `performedFrom`, helpers | `reads310`, `reads320` |
| 3 | not-read notes | `skeleton/source-notes.ts` | statements, blocks, branches, call graph | notes | — |
| 4 | entries | `skeleton/entries.ts` | `SourceDeclarations`, effects | `EntryPoint[]`, run entries | `reads310`, `reads320` |
| 5 | walk | `skeleton/walk/*` (planned, last) | `SourceDeclarations`, effects, entries | regions, nodes, edges; the walk's products: early ends, region ends, lane evidence, reached routines, cut-off boundaries, callbacks (which add entries while the walk runs) | both |
| 6 | early ends | `skeleton/early-ends.ts` | statements, blocks, early ends, region ends, run ranks | edges moved, end nodes dropped | — |
| 7 | collapse | `skeleton/collapse.ts` | — | call-site kinds | `reads310` |
| 8 | guards | `skeleton/guards.ts` | — | conditional edges into guarded calls | — |
| 9 | technical gateways | `skeleton/technical-gateways.ts` | — | gateways folded onto boundaries | — |
| 10 | sub-process starts | `skeleton/starts.ts` | — | one start per plane | `reads310` |
| 11 | report chain | `skeleton/report-chain.ts` | — | `runtime-order`/`stop` edges | — |
| 12 | empty entries | `skeleton/starts.ts` | — | `region.drawsNothing` | `reads310` (whether it runs) |
| 13 | unreachable notes | `skeleton/unreachable-notes.ts` | statements, cut-off boundaries | notes | — |
| 14 | lanes | `skeleton/lanes.ts` | statements, lane evidence | `SkeletonLane[]` | — |
| 15 | LUW | `skeleton/luw.ts` | the facts | `SkeletonLuw`, node details | — |
| 16 | not drawn | `skeleton/not-drawn.ts` | statements, blocks, call graph, forms, entries built, reached routines, helpers, methods, call sites | `notDrawn` | — |

**Extraction order: from the back.** Passes 6–16 read the finished graph plus a handful of walk products; they
move first, each in its own commit. Then 3, 1 and 2 (they read only the source). Entries (4) next. The walk (5)
last, split inside itself along its own seams (`walkBranch`, `walkLoop`/`walkMultiInstanceLoop`, `walkTry`,
`walkParallel`, `walkStatement` and the call walkers), because it is mutually recursive with `routineRegion` and
carries most of the state.

### What proves each pass neutral

A pass is committed only when every check below is unchanged byte for byte; a pass that cannot be proven is
stopped, recorded here, and the next independent one taken.

1. `tests/skeleton-frozen-digests.spec.ts`: `tests/fixtures/skeleton-v3.2.0-frozen.json`, 1,656 SHA-256 digests of
   `JSON.stringify(buildProcessSkeleton(source, { engineVersion }))` — key order included — for 552 sources
   (7 starters, 150 learn cases concatenated, 387 learn files one by one, 8 probes; never the holdout) on each
   engine line the skeleton reads differently: 3.0.23, 3.1.0 (`reads310`), 3.2.0 (`reads320`). Captured from
   `lib/` at 3892cfca before the first pass. 237 sources draw differently under 3.1.0 than 3.0.23 and 22 under
   3.2.0 than 3.1.0, so both gates are exercised.
2. `scripts/engine/skeleton-neutrality.ts check --mutations 3`: every third of the 29 deterministic mutations of
   `parse-once-neutrality.ts` (CRLF, tabs, deleted/duplicated/split lines, truncation, inserted `'` `|` `"` `{`
   `.`) of each of the 552 sources, against a baseline captured from an untouched checkout of 3892cfca. This is
   where unclosed blocks, recovered containers and early ends in odd places are exercised.
3. The same on the external real-code sample, public group (300 files, outside the repository, ADR-125 (5)),
   with mutations.
4. `engine-frozen-digests.spec.ts` (evidence and route, 330), the skeleton specs (`abap-process-skeleton`,
   `process-skeleton-*`, `engine-reads-320`, `engine-method-collapse`, `callback-reachability`, `luw-states`), the
   golden masters and the reference corpus (`korpus-*`), server-free.

Nothing here touches what a signed run rebuilds to: the output is identical by the checks above, and no reading,
gate or version changes.

### Ledger (22.11.2026)

Every row is a commit on `build/engine4-p3`. "Frozen" is check 1 on that commit; the mutation and external runs
(checks 2 and 3) ran on the commits marked ✓ and cover every commit before them.

| Pass | Module | Commit | Frozen | Mutations (43,014) · external (10,800) |
|---|---|---|---|---|
| harness | `scripts/engine/skeleton-neutrality.ts`, fixture, spec | 1bd22864 | captured | baseline from 3892cfca |
| 0 graph | `skeleton/graph.ts`, `skeleton/anchors.ts` | 88c7330a | 1,656/1,656 | ✓ (0a97375f) |
| perf | parse-once scope around the skeleton build | 0a97375f | 1,656/1,656 | ✓ 0 moved |
| perf | `luw-states.ts`: perform sites and branches read once | f302f2fa | 1,656/1,656 | ✓ 0 · 0 moved |
| 15 LUW | `skeleton/luw.ts` | eca54345 | 1,656/1,656 | ✓ (with f302f2fa) |
| 16 not drawn | `skeleton/not-drawn.ts` | 4a540951 | 1,656/1,656 | ✓ (719e95fd) |
| 14 lanes | `skeleton/lanes.ts` | 7f820d4d | 1,656/1,656 | ✓ (719e95fd) |
| 13 unreachable notes | `skeleton/unreachable-notes.ts` | 05cd3c27 | 1,656/1,656 | ✓ (719e95fd) |
| 10, 12 starts | `skeleton/starts.ts` | 49d28462 | 1,656/1,656 | ✓ (719e95fd) |
| 11 report chain | `skeleton/report-chain.ts`, `skeleton/keywords.ts` | 699efac3 | 1,656/1,656 | ✓ (719e95fd) |
| 9 technical gateways | `skeleton/technical-gateways.ts` | ad7b4485 | 1,656/1,656 | ✓ (719e95fd) |
| 8 guards | `skeleton/guards.ts` | 69aed001 | 1,656/1,656 | ✓ (719e95fd) |
| 7 collapse | `skeleton/collapse.ts` | 9a6a7b2c | 1,656/1,656 | ✓ (719e95fd) |
| 6 early ends | `skeleton/early-ends.ts`, `skeleton/statement-readers.ts` | 719e95fd | 1,656/1,656 | ✓ 0 · 0 moved |
| 3 not-read notes | `skeleton/source-notes.ts` | 06ba99ae | 1,656/1,656 | ✓ (ed289189) |
| 1 declarations | `skeleton/declarations.ts` | ba494de9 | 1,656/1,656 | ✓ (ed289189) |
| recognisers | `skeleton/recognisers.ts` (32 readers and tables) | 96080dfd | 1,656/1,656 | ✓ (ed289189) |
| 2 effects | `skeleton/effects.ts` | ed289189 | 1,656/1,656 | ✓ 0 · 0 moved |
| dispatch | `skeleton/dispatch.ts` (`MethodDispatch`) | 76f83d7e | 1,656/1,656 | ✓ (5b4ffe9f) |
| 4 entries | `skeleton/entries.ts` (`EntryReader`) | 5b4ffe9f | 1,656/1,656 | ✓ 0 · 0 moved |
| walk readers | `skeleton/walk-readers.ts` (`WalkReaders`) | 5266b4f9 | 1,656/1,656 | ✓ 0 · 0 moved |
| tidy | section headers, blank lines | 726f7dd0 | 1,656/1,656 | — (comments only) |

On 5266b4f9, in parse-once verify mode (`ENGINE_PARSE_ONCE_VERIFY=1`), 34 server-free spec files with 1,922 tests: 1,919 pass, 2 skipped, 1 red — `engine-version-callers.spec.ts` "no call outside tests/ leaves the engine version to the default", red with the same seven script call sites (`scripts/engine/frozen-digests.ts`, `scaling-guard.ts`, `scripts/engine4/shadow-references.ts`, `timing-parse.ts`) on the untouched `integrate/engine4` (3892cfca) as well; none of them is a file of this strand. The skeleton, LUW, golden-master, reference-corpus (`korpus-*`), frozen evidence (330) and rebuild (v3.0.11/v3.0.12) specs are among the green.

Two pieces are not graph passes and are named for what they are: `MethodDispatch` (which implementation a call
reaches, the calls of one statement, the bound event handlers; it keeps the builder's caches) and `WalkReaders`
(the walk's read-only questions about the source). Both are asked by passes; neither draws.

**Performance, the user-visible part.** The independent engine review measured the skeleton super-linear
(10k → 25k lines 7.9×). The profile put 68 % of the time at 15k lines in `luw-states.ts fromRegistration`, re-masking
every `PERFORM` for every registration path, because the skeleton build ran outside the parse-once scope. Two
neutral fixes (0a97375f, f302f2fa). `buildProcessSkeletonFrom` on the 1,000-line starter concatenated, this
machine, Node 24, other agents running (`scripts/engine/skeleton-timing.ts`):

| Lines | Before | After |
|---|---|---|
| 1k | 54 ms | 24 ms |
| 5k | 240 ms | 60 ms |
| 10k | 1,597 ms | 94–108 ms |
| 25k | 20,171 ms | 325–482 ms |
| 50k | not measured (15k: 6,451 ms) | 1,030–1,287 ms |

`buildProcessFacts` is now the larger half (25k: 0.5–0.7 s, 50k: 1.9–2.1 s).

**What remains.** `process-skeleton.ts` went from 5,817 to 2,608 lines; the passes are 21 modules in
`lib/abap/skeleton/` (about 3,900 lines with their comments). What is left in `SkeletonBuilder` is pass 5, the walk:
`buildEntryRegion`, `routineRegion` and the `walk*` methods (39 methods, `walkStatement` alone 291 lines), plus the
callbacks the walk discovers and the lane evidence it records. It is one mutually recursive component over about 20
pieces of walk state (`registeredInWalk`, `registrationFrozen`, `expanding`, `regionOfRoutine`, `earlyEnds`,
`callbacks`, `screenCalled`, `reachedRoutines`, …). The next step is a typed `WalkState` object and one module per
walker (`walk/branch.ts`, `walk/loop.ts`, `walk/try.ts`, `walk/parallel.ts`, `walk/calls.ts`, `walk/statement.ts`),
again one at a time behind the same four checks. Then the second half of phase 3: one recogniser per concept with a
probe spec (the recognisers now sit in `skeleton/recognisers.ts`, `statement-readers.ts`, `walk-readers.ts` and
`dispatch.ts`), and closing review §5 #2–#6, #9 as gated readings.

**The helper seam (review B2).** Whether a routine is a step or a technical helper is decided in one place,
`skeleton/effects.ts` `directEffects`; `notDrawn.technicalHelpers` lists what it folded. A routine whose table write
that list does not recognise is folded and its write is not drawn. Widening the list is a reading (a new engine
version), not part of this refactor; the seam is documented in the module header.

## Next steps

1. ~~Build ADR-134 Q5, Q6 and Q9~~ (built, see above). Rerun both shadows on the sample after every L2 change
   (it stays outside the repository, so the specs cannot read it).
2. **Phase 0, the rest** (3.5.0 item 2): `engineDigest` (owner decision, "Phase 0 wiring"); hand `ParsedSource`
   itself to the readers that also mask (`maskedText(i)`) and nest (`containers`) instead of the source-keyed
   scope; the remaining hotspots (`valueAlongTheRun`, `call-graph`); the capture step in the release routine.
3. ~~Remove the two other statement splitters~~ (on parse once since 22.11.2026, above; their scans stay as
   fallback until the gated readings fix the three classes they keep).
4. **L3, second half:** class and interface declarations (visibility, `FINAL`/`ABSTRACT`, events, aliases,
   redefinitions, `RAISING`) and screens by number from `MODULE` names and `CALL SCREEN` (review §8.1), on
   top of the layout. The layout part is done (above).
5. **L4, the rest:** grade the reference table through `lib/knowledge/` (catalog, released classes and
   interfaces, SAP identifiers; level, state, successor per reference) instead of the shadow's `lib/abap` import;
   then a reading that reports the class, interface and exception gap (question 18), gated; then scopes and data
   flow across routines (dynamic names set in another routine, parameters).
6. ~~Statement ledger~~ (built by effect class, above). Next: L5/L6 readings claim their classes; the coverage
   wording from `unclaimedKinds`, gated.

## Open design questions for the owner

**Questions 5–17 are decided: ADR-134 (15.11.2026 evening).** Q5, Q6 and Q9 change as recommended below (not
built yet on the strand), Q7 and Q8 stay, Q10–Q17 are accepted as built. Q11, the shipping upload defect, was
fixed in 3.2.0 (07cf0e32). The text below is the record the decision was taken on.

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
10. **Several objects in one upload.** L3 keeps every object: a report, its classes, its function modules. The
    shipping join reads only one program and drops the rest, 62 files on the learn corpus. Whether a project or a
    run should read all objects is a product decision for the switch, not one for L3. **Default: L3 returns all
    of them, the primary first. The consumer decides.**
11. **The shipping upload refuses programs whose includes hold local classes.** On 15 of the 86 multi-file
    learn uploads, a TOP with `CLASS lcl DEFINITION DEFERRED`, or a `C01`/`_CLS` include, is renamed to the
    class. The own-code upload then reports a `second-program` error and the include as not uploaded
    (`classifySource`, `lib/abap/include-resolution.ts`). This is a 3.x defect outside the inert strand, and
    fixing it changes stored sources and digests of new projects. **Default: nothing changed in `lib/abap/`. A
    roadmap row for the owner, with a fix that takes only `CLASS … DEFINITION PUBLIC` as a class header and
    leaves the rest as it is.**
12. **Object order with no program in the upload.** L3 reads function groups and function modules before
    classes and interfaces, and loose includes (user-exit includes such as `MV45AFZZ`) last. A user-exit
    include is often the business entry (review §5 #5). The process layer may want it first. **Default: type
    order as built. L6 chooses entries itself and does not depend on `primary`.**
13. **A function module in a file of its own joins the only function group of the upload.** Without this,
    BM-172 loses five macro calls. The file does not name its group, so this is an inference, and it is marked
    `how: 'onlyGroup'`. **Default: on when there is exactly one group; off with two or more.**
14. **Macro visibility is object-wide, not positional.** SAP sees a macro only after its `DEFINE` in the
    expanded source. L3 gives every part all of its object's macros, so a call before the definition is
    tolerated, not flagged. **Default: object-wide, for tolerance. A positional check can come with macro
    expansion (question 5).**
15. **System macros.** The list holds `RP_PROVIDE_FROM_LAST`/`_FRST` (HR logical database) and the hyphenated
    TRMAC spellings, and nothing else. **Default: these four names, recognised as calls and never expanded.
    More names enter only with a corpus case and a cited source.**
16. **Missing SAP includes.** An `INCLUDE` outside the customer namespace (`DBPNPMAC`, `<ICON>`-style
    standard includes) is `missing-sap-include` (info), not a question to the reader. **Default: as built.
    Customer names are `Z…`/`Y…`, `/ns/`, and the `L`/`M`/`SAPL`/`SAPM` frames around them.**
17. **The workbench role order** when no main program states the order: TOP, local classes, function modules,
    FORMs, PBO, PAI, events, tests. Local classes come before function modules because a class must be defined
    before the code that uses it (SAP's generated frame only fixes TOP and UXX). **Default: as built.**
18. **How the reference gap becomes visible** (new, 22.11.2026). L4 counts 925 class, interface and exception
    references on the corpus that today's evidence does not name (136 of them listed C or D), and 2,016 DDIC types
    listed C. Options: (a) one finding per object (not per line) for classes, interfaces and exceptions listed C or
    D, with its lines, the DDIC types only in the IT view grouped by level; (b) everything only in the IT view as
    a reference list with levels, no new findings; (c) findings for everything. **Default proposed: (a), behind an
    engine gate (it changes signed findings).**
    **Decided 22.11.2026: (a); built for 3.4.0** (`lib/abap/sap-class-references.ts`, gate `ENGINE_READS_340_FROM`,
    ADR-141 draft). Static references only: the engine review of 22.11.2026 showed the `constant`/`value`/`assigned`/
    `onlyValue` resolutions to be unsound across routines, loops and scopes, so no reading may consume them until L4
    has scopes and data flow. A RAP entity alias (`FOR order~set_status`, EML) is no longer an interface reference.
19. **`engineDigest` in the signed run** (Phase 0, new). It changes what a run stores and signs. **Default
    proposed: on the model card beside `engineVersion`, computed at build time; "unreleased build" when it
    matches no frozen release.**
    **Decided 22.11.2026; built for 3.4.0**: `scripts/engine/engine-digest.cjs` (the modules the three engine entry
    points reach, type-only imports, JSON data and `lib/version.ts` left out), `lib/engine-digest.ts`,
    `lib/engine-releases.json`; captured per release by `.github/workflows/engine-release-capture.yml`.
