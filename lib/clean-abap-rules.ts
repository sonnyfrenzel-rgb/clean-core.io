/**
 * SAP's Clean ABAP style guide, adopted rule by rule for the ABAP the model writes
 * on the RAP path (owner decision, 13.10.2026).
 *
 * Source: github.com/SAP/styleguides, `clean-abap/CleanABAP.md`, read at the
 * commit in `CLEAN_ABAP_SOURCE`. The repository is licensed CC BY 3.0 (its
 * `LICENSE` file); this module quotes no text of the guide beyond section
 * headings, and cites each one by its anchor.
 *
 * The guide is checked, not obeyed. A rule is adopted only when what it flags can
 * cause a defect, is obsolete or forbidden, or makes a method's shape harder to
 * maintain (length, nesting, mixed outputs, parameter semantics). A rule is not
 * adopted when it is formatting or taste (two spellings with the same meaning),
 * when it would merge or reshape the original's decision points — every branch of
 * the original stays its own branch so its line anchor survives — when it
 * conflicts with the engine-written parts of the RAP scaffold or the RAP idiom,
 * when it needs repository objects the package does not have, or when the rule
 * enforces guidance the guide no longer gives.
 *
 * The check runs through abaplint (`@abaplint/core`): every key below is an
 * abaplint rule whose own documentation cites the Clean ABAP section given here
 * (where abaplint still cites an anchor the guide has since renamed, the section
 * is the one at the commit read). `cleanAbapAbaplintRules()` is the `rules`
 * block for the adopted ones, to be merged into the abaplint run on generated
 * RAP code.
 *
 * Pure, no imports, no network.
 */

/** Where the guide was read. Re-read on a change of `commit`, and re-check every decision. */
export const CLEAN_ABAP_SOURCE = {
  repository: 'SAP/styleguides',
  path: 'clean-abap/CleanABAP.md',
  commit: '6279311f42bf1f91896935c071bec8dbca97cf59',
  blob: 'd65b3aa2766af3f9f98f23386df23a3608fb0587',
  readOn: '2026-10-13',
  licence: 'CC BY 3.0',
  /** abaplint version the rule keys and options were checked against. */
  abaplint: '2.120.54',
} as const;

export type CleanAbapStatus = 'adopted' | 'not-adopted';

/**
 * Why. `correctness` and `maintainability` adopt; every other value does not.
 * `decision-points`: the rule would merge or reshape the original's branches.
 * `scaffold`: it conflicts with the engine-written parts or the RAP idiom.
 * `not-applicable`: it needs objects the package has not, or cannot fire on the RAP path.
 */
export type CleanAbapBecause = 'correctness' | 'maintainability' | 'formatting' | 'taste' | 'decision-points' | 'scaffold' | 'not-applicable' | 'outdated';

export interface CleanAbapSection {
  /** The heading as the guide writes it. */
  heading: string;
  /** The anchor GitHub renders for that heading. */
  anchor: string;
}

export interface CleanAbapRule {
  /** abaplint rule key. */
  key: string;
  /** The Clean ABAP sections the rule checks; the first is the primary one. */
  sections: readonly CleanAbapSection[];
  status: CleanAbapStatus;
  because: CleanAbapBecause;
  /** One line: why adopted or not. */
  reason: string;
  /** abaplint options for an adopted rule (merged over abaplint's defaults). */
  options?: Readonly<Record<string, unknown>>;
}

const s = (heading: string, anchor: string): CleanAbapSection => ({ heading, anchor });

const S = {
  hungarian: s('Avoid encodings, esp. Hungarian notation and prefixes', 'avoid-encodings-esp-hungarian-notation-and-prefixes'),
  builtIn: s('Avoid obscuring built-in functions', 'avoid-obscuring-built-in-functions'),
  procedural: s('Prefer object orientation to procedural programming', 'prefer-object-orientation-to-procedural-programming'),
  functionalConstructs: s('Prefer functional to procedural language constructs', 'prefer-functional-to-procedural-language-constructs'),
  obsolete: s('Avoid obsolete language elements', 'avoid-obsolete-language-elements'),
  enumConstants: s('Prefer ENUM to constants interfaces', 'prefer-enum-to-constants-interfaces'),
  inline: s('Prefer inline to up-front declarations', 'prefer-inline-to-up-front-declarations'),
  loopTargets: s('Choose the right targets for your loops', 'choose-the-right-targets-for-your-loops'),
  outsideBlock: s('Do not use variables outside of the statement block they are declared in', 'do-not-use-variables-outside-of-the-statement-block-they-are-declared-in'),
  tableType: s('Use the right table type', 'use-the-right-table-type'),
  defaultKey: s('Avoid DEFAULT KEY', 'avoid-default-key'),
  insertInto: s('Prefer INSERT INTO TABLE to APPEND TO', 'prefer-insert-into-table-to-append-to'),
  lineExists: s('Prefer LINE_EXISTS to READ TABLE or LOOP AT', 'prefer-line_exists-to-read-table-or-loop-at'),
  xsdbool: s('Use XSDBOOL to set Boolean variables', 'use-xsdbool-to-set-boolean-variables'),
  isNot: s('Prefer IS NOT to NOT IS', 'prefer-is-not-to-not-is'),
  emptyIf: s('No empty IF branches', 'no-empty-if-branches'),
  caseElseIf: s('Prefer CASE to ELSE IF for multiple alternative conditions', 'prefer-case-to-else-if-for-multiple-alternative-conditions'),
  nesting: s('Keep the nesting depth low', 'keep-the-nesting-depth-low'),
  membersPrivate: s('Members PRIVATE by default, PROTECTED only if needed', 'members-private-by-default-protected-only-if-needed'),
  newObject: s('Prefer NEW to CREATE OBJECT', 'prefer-new-to-create-object'),
  constructorPublic: s('If your global class is CREATE PRIVATE, leave the CONSTRUCTOR public', 'if-your-global-class-is-create-private-leave-the-constructor-public'),
  staticViaInstance: s("Don't call static methods through instance variables", 'dont-call-static-methods-through-instance-variables'),
  functionalCalls: s('Prefer functional to procedural calls', 'prefer-functional-to-procedural-calls'),
  receiving: s('Omit RECEIVING', 'omit-receiving'),
  exporting: s('Omit the optional keyword EXPORTING', 'omit-the-optional-keyword-exporting'),
  parameterName: s('Omit the parameter name in single parameter calls', 'omit-the-parameter-name-in-single-parameter-calls'),
  selfReference: s('Omit the self-reference me when calling an instance attribute or method', 'omit-the-self-reference-me-when-calling-an-instance-attribute-or-method'),
  returningToExporting: s('Prefer RETURNING to EXPORTING', 'prefer-returning-to-exporting'),
  mixReturning: s('Use either RETURNING or EXPORTING or CHANGING, but not a combination', 'use-either-returning-or-exporting-or-changing-but-not-a-combination'),
  clearExporting: s('Clear or overwrite EXPORTING reference parameters', 'clear-or-overwrite-exporting-reference-parameters'),
  methodsSmall: s('Keep methods small', 'keep-methods-small'),
  checkReturn: s('CHECK vs. RETURN', 'check-vs-return'),
  messages: s('Make messages easy to find', 'make-messages-easy-to-find'),
  classExceptions: s('Use class-based exceptions', 'use-class-based-exceptions'),
  raiseNew: s('Prefer RAISE EXCEPTION NEW to RAISE EXCEPTION TYPE', 'prefer-raise-exception-new-to-raise-exception-type'),
  commentsBefore: s('Put comments before the statement they relate to', 'put-comments-before-the-statement-they-relate-to'),
  deleteCode: s('Delete code instead of commenting it', 'delete-code-instead-of-commenting-it'),
  abapDoc: s('ABAP Doc only for public APIs', 'abap-doc-only-for-public-apis'),
  pragmas: s('Prefer pragmas to pseudo comments', 'prefer-pragmas-to-pseudo-comments'),
  consistent: s('Be consistent', 'be-consistent'),
  formatterSettings: s("Use your team's ABAP Formatter settings", 'use-your-teams-abap-formatter-settings'),
  oneStatement: s('No more than one statement per line', 'no-more-than-one-statement-per-line'),
  lineLength: s('Stick to a reasonable line length', 'stick-to-a-reasonable-line-length'),
  condense: s('Condense your code', 'condense-your-code'),
  blankLines: s("Don't obsess with separating blank lines", 'dont-obsess-with-separating-blank-lines'),
  closeBrackets: s('Close brackets at line end', 'close-brackets-at-line-end'),
  singleParameterLine: s('Keep single parameter calls on one line', 'keep-single-parameter-calls-on-one-line'),
  lineBreakParameters: s('Line-break multiple parameters', 'line-break-multiple-parameters'),
  alignParameters: s('Align parameters', 'align-parameters'),
  snapToTab: s('Indent and snap to tab', 'indent-and-snap-to-tab'),
  typeClauses: s("Don't align TYPE clauses", 'dont-align-type-clauses'),
  chainAssignments: s("Don't chain assignments", 'dont-chain-assignments'),
  testSeams: s('Use test seams as temporary workaround', 'use-test-seams-as-temporary-workaround'),
} as const;

const adopt = (key: string, sections: CleanAbapSection[], because: 'correctness' | 'maintainability', reason: string, options?: Record<string, unknown>): CleanAbapRule => ({ key, sections, status: 'adopted', because, reason, ...(options ? { options } : {}) });
const skip = (key: string, sections: CleanAbapSection[], because: Exclude<CleanAbapBecause, 'correctness' | 'maintainability'>, reason: string): CleanAbapRule => ({ key, sections, status: 'not-adopted', because, reason });

/** Every abaplint rule that cites a Clean ABAP section, with the decision. Sorted by key. */
export const CLEAN_ABAP_RULES: readonly CleanAbapRule[] = [
  skip('abapdoc', [S.abapDoc], 'not-applicable', 'Demands ABAP Doc on public methods; the engine writes the definitions and their ABAP Doc, the model writes bodies only.'),
  skip('align_parameters', [S.alignParameters], 'formatting', 'Alignment of parameters is layout.'),
  skip('align_type_expressions', [S.typeClauses], 'formatting', 'Alignment of TYPE clauses is layout (and the guide advises against aligning them).'),
  adopt('avoid_use', [S.defaultKey, S.testSeams], 'correctness', 'DEFAULT KEY, BREAK-POINT, macros, STATICS, test seams and EXPORT TO MEMORY/DATABASE hide defects or state; DESCRIBE TABLE LINES is left (same meaning as lines( )).', {
    define: true,
    statics: true,
    defaultKey: true,
    break: true,
    testSeams: true,
    describeLines: false,
    exportToMemory: true,
    exportToDatabase: true,
  }),
  skip('change_if_to_case', [S.caseElseIf], 'decision-points', 'Rewriting an IF/ELSEIF chain as CASE reshapes the original decision points the line anchors follow; the same meaning either way.'),
  skip('check_comments', [S.commentsBefore], 'formatting', 'Where a comment sits is layout.'),
  adopt('clear_exporting_parameters', [S.clearExporting], 'correctness', 'An EXPORTING reference parameter keeps the caller\'s value until cleared; reading it first uses a leftover value.'),
  adopt('commented_code', [S.deleteCode], 'maintainability', 'Commented-out code is dead code a reader must judge; the original is linked by line anchor, not copied into comments.'),
  skip('constant_classes', [S.enumConstants], 'outdated', 'Checks constant classes against DDIC domain values; the guide now prefers ENUM (abaplint cites a removed anchor), and the package has no domains.'),
  adopt('constructor_visibility_public', [S.constructorPublic], 'correctness', 'The instance constructor of a global class belongs in the public section.'),
  skip('contains_tab', [S.snapToTab], 'formatting', 'Tabs versus spaces is layout.'),
  skip('easy_to_find_messages', [S.messages], 'not-applicable', 'Needs message classes; the RAP scaffold reports through new_message_with_text and the package has no message class.'),
  skip('empty_line_in_statement', [S.blankLines], 'formatting', 'Blank lines inside a statement are layout.'),
  adopt('empty_structure', [S.emptyIf], 'correctness', 'An empty IF, LOOP, CASE, WHEN, WHILE, DO, SELECT or TRY is usually missing code.'),
  adopt('exit_or_check', [S.checkReturn], 'correctness', 'CHECK and EXIT outside a loop behave differently by context; RETURN says what is meant.', { allowExit: false, allowCheck: false }),
  skip('exporting', [S.exporting], 'taste', 'An optional EXPORTING keyword changes nothing.'),
  adopt('fully_type_itabs', [S.tableType, S.defaultKey], 'correctness', 'An implicit table type or key gives a default key over every character-like column, which silently changes READ, SORT and DELETE ADJACENT DUPLICATES.'),
  adopt('functional_writing', [S.functionalCalls], 'maintainability', 'CALL METHOD in its static form is obsolete; dynamic calls stay allowed by the rule.', { ignoreExceptions: true }),
  skip('if_in_if', [S.nesting], 'decision-points', 'Merging nested IFs merges two decision points of the original into one; nesting depth is checked by nesting.'),
  skip('keep_single_parameter_on_one_line', [S.singleParameterLine], 'formatting', 'Line breaks are layout.'),
  skip('keyword_case', [S.formatterSettings], 'formatting', 'Keyword case is the pretty printer\'s job (abaplint cites a renamed anchor).'),
  skip('line_break_multiple_parameters', [S.lineBreakParameters], 'formatting', 'Line breaks are layout.'),
  skip('line_length', [S.lineLength], 'formatting', 'Line length is layout.'),
  skip('line_only_punc', [S.closeBrackets], 'formatting', 'Where a bracket closes is layout.'),
  skip('max_one_statement', [S.oneStatement], 'formatting', 'Statements per line is layout (Formatting chapter of the guide).'),
  adopt('method_length', [S.methodsSmall], 'maintainability', 'A method over 100 statements does more than one thing; empty frames (an unused authorization handler) are allowed.', {
    statements: 100,
    errorWhenEmpty: false,
    ignoreTestClasses: true,
    checkForms: true,
    checkFunctionModules: true,
  }),
  adopt('method_overwrites_builtin', [S.builtIn], 'correctness', 'A method named like a built-in function changes which one an unqualified call reaches.'),
  adopt('mix_returning', [S.mixReturning], 'maintainability', 'A method returns one way: RETURNING, EXPORTING or CHANGING, not a mix.'),
  adopt('nesting', [S.nesting], 'maintainability', 'Nesting deeper than 5 levels is hard to follow and to test.', { depth: 5 }),
  adopt('no_chained_assignment', [S.chainAssignments], 'correctness', 'A chained assignment converts through each target type in turn, and confuses the reader.'),
  skip('no_inline_in_optional_branches', [S.outsideBlock, S.loopTargets], 'scaffold', 'abaplint flags every inline declaration in a branch or loop, the target of the loop itself too (LOOP AT … INTO DATA( … ), which the guide recommends and the behavior pool writes); the guide only objects to use after the block.'),
  skip('no_prefixes', [S.hungarian], 'scaffold', 'The engine-written scaffold uses prefixes (lv_, is_, ty_, rv_ …) throughout, as SAP\'s own RAP generators do; the guide calls it a matter of encoding, not of meaning.'),
  adopt('no_public_attributes', [S.membersPrivate], 'maintainability', 'Public writable attributes let any caller change state; READ-ONLY attributes and exception classes stay allowed.', { allowReadOnly: true, ignoreTestClasses: true }),
  adopt('obsolete_statement', [S.functionalConstructs, S.obsolete], 'correctness', 'Obsolete statements (MOVE, COMPUTE, REFRESH, OCCURS, header lines, POSIX regex, FORM …) are disallowed or misleading in ABAP Cloud.'),
  skip('omit_parameter_name', [S.parameterName], 'scaffold', 'Naming a single parameter changes nothing; the engine-written calls name it on purpose (NEW zcx_…( unit = … )).'),
  skip('omit_receiving', [S.receiving], 'taste', 'RECEIVING in a functional call changes nothing; CALL METHOD itself is caught by functional_writing.'),
  skip('prefer_corresponding', [S.functionalConstructs], 'taste', 'Not equivalent: MOVE-CORRESPONDING keeps target fields without counterpart, CORRESPONDING #( ) clears them; the translation keeps the original\'s semantics.'),
  skip('prefer_inline', [S.inline], 'taste', 'Experimental in abaplint; an inline declaration takes the type of the right side, which would change a declared packed type.'),
  skip('prefer_insert_into_table', [S.insertInto], 'scaffold', 'For a standard table both mean the same; the engine-written behavior pool fills failed/reported with APPEND, the RAP idiom.'),
  skip('prefer_is_not', [S.isNot], 'taste', 'IS NOT and NOT IS mean the same.'),
  adopt('prefer_pragmas', [S.pragmas], 'maintainability', 'Pseudo comments for the checks are obsolete; pragmas are checked by the compiler.'),
  skip('prefer_raise_exception_new', [S.raiseNew], 'taste', 'RAISE EXCEPTION NEW and TYPE mean the same; the scaffold already writes NEW.'),
  adopt('prefer_returning_to_exporting', [S.returningToExporting], 'maintainability', 'One EXPORTING result belongs in RETURNING, so the call can be used as an expression.'),
  adopt('prefer_xsdbool', [S.xsdbool], 'correctness', 'boolc( ) returns a string; compared with abap_false it is never equal, xsdbool( ) returns abap_bool.'),
  skip('prefix_is_current_class', [S.selfReference], 'taste', 'A redundant class prefix changes nothing.'),
  skip('reduce_procedural_code', [S.procedural], 'not-applicable', 'FORMs and function modules cannot occur in the RAP package; obsolete_statement already refuses FORM.'),
  skip('space_before_dot', [S.consistent, S.condense], 'formatting', 'Spaces before a period are layout.'),
  adopt('sql_escape_host_variables', [S.obsolete], 'correctness', 'Host variables without @ are the obsolete non-strict Open SQL mode, which ABAP Cloud does not accept.'),
  skip('start_at_tab', [S.snapToTab], 'formatting', 'Indentation is layout.'),
  adopt('static_call_via_instance', [S.staticViaInstance], 'maintainability', 'Calling a static method through an instance suggests instance state that is not used.', { allowInTestclassIncludes: false }),
  skip('use_bool_expression', [S.xsdbool], 'decision-points', 'Replacing IF … abap_true ELSE abap_false with xsdbool( ) folds a decision point of the original; the meaning is the same.'),
  adopt('use_class_based_exceptions', [S.classExceptions], 'correctness', 'Classic EXCEPTIONS are ignored unless the caller checks sy-subrc; class-based exceptions cannot be.'),
  skip('use_line_exists', [S.lineExists], 'taste', 'line_exists( ) and READ TABLE TRANSPORTING NO FIELDS with sy-subrc mean the same.'),
  skip('use_new', [S.newObject], 'taste', 'NEW and CREATE OBJECT mean the same; the scaffold already writes NEW.'),
];

/**
 * Anchors abaplint's rule documentation still cites that the guide has since renamed, mapped to the anchor at
 * `CLEAN_ABAP_SOURCE.commit`. A new stale anchor after an abaplint or guide update fails the spec.
 */
export const ABAPLINT_RENAMED_ANCHORS: Readonly<Record<string, string>> = {
  'dont-declare-inline-in-optional-branches': 'do-not-use-variables-outside-of-the-statement-block-they-are-declared-in',
  'prefer-enumeration-classes-to-constants-interfaces': 'prefer-enum-to-constants-interfaces',
  'use-your-pretty-printer-team-settings': 'use-your-teams-abap-formatter-settings',
};

/**
 * The adopted rules' abaplint `rules` block: `{ key: options | true }`, to merge into the abaplint run on generated
 * RAP code. That run needs `parser_error` on as well: with syntax version Cloud, abaplint refuses obsolete statements
 * (MOVE, COMPUTE, REFRESH, BREAK-POINT …) at parse level, and only `parser_error` reports them.
 */
export function cleanAbapAbaplintRules(): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  for (const r of CLEAN_ABAP_RULES) if (r.status === 'adopted') rules[r.key] = r.options ? { ...r.options } : true;
  return rules;
}

/** The adopted rule keys, sorted. */
export function adoptedCleanAbapRuleKeys(): string[] {
  return CLEAN_ABAP_RULES.filter((r) => r.status === 'adopted').map((r) => r.key).sort();
}

/** The section's URL, pinned to the commit read. */
export function cleanAbapSectionUrl(anchor: string): string {
  return `https://github.com/${CLEAN_ABAP_SOURCE.repository}/blob/${CLEAN_ABAP_SOURCE.commit}/${CLEAN_ABAP_SOURCE.path}#${anchor}`;
}

export interface CitedCleanAbapSection extends CleanAbapSection {
  url: string;
  /** Adopted rule keys that check this section; empty when only not-adopted rules cite it. */
  adopted: string[];
  /** Not-adopted rule keys citing it. */
  notAdopted: string[];
}

/** Every section the table cites, once, in the order of first citation — for the citation registry. */
export function cleanAbapCitedSections(): CitedCleanAbapSection[] {
  const byAnchor = new Map<string, CitedCleanAbapSection>();
  for (const r of CLEAN_ABAP_RULES) {
    for (const sec of r.sections) {
      const entry = byAnchor.get(sec.anchor) ?? { ...sec, url: cleanAbapSectionUrl(sec.anchor), adopted: [], notAdopted: [] };
      (r.status === 'adopted' ? entry.adopted : entry.notAdopted).push(r.key);
      byAnchor.set(sec.anchor, entry);
    }
  }
  return [...byAnchor.values()];
}
