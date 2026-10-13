/**
 * lib/sap-reference-citations.ts — what Clean-Core.io takes from four SAP
 * repositories on GitHub (roadmap 3.0.12, owner decision 13.10.2026), one row
 * per reviewed reference:
 *
 *   SAP-samples/abap-cheat-sheets            Apache-2.0  ABAP Cloud usage (RAP, application jobs, CL_BALI_*, mail, XCO, released APIs)
 *   SAP-samples/abap-platform-refscen-flight Apache-2.0  reference RAP app (CDS, BDEF, DCL, authorization, draft) — template for our RAP scaffold
 *   SAP/styleguides (Clean ABAP)             CC BY 3.0   rules for generated ABAP
 *   SAP/abap-file-formats                    MIT         JSON schemas of ABAP object files, to validate generated object files
 *
 * Same statuses as the DSAG registry (lib/dsag-citations.ts):
 *   - `adopted` — followed as the cited files or sections show;
 *   - `adopted-with-correction` — followed, `correction` says what we changed and why;
 *   - `not-adopted` — deliberately not followed; `correction` says why.
 * A file or section that bears on a row but is not followed goes under `watched`.
 *
 * From the samples we follow the structure; no code is copied. Clean ABAP
 * rules are cited and paraphrased (and partly enabled through abaplint). The
 * AFF schemas are the only content copied, unchanged (lib/generated/aff-schemas/).
 *
 * `hashAtAdoption` is the SHA-256 from `lib/generated/sap-references/<source>.json`
 * at the commit in `SAP_REFERENCE_REVIEWED`: of the whole file for a file ref, of
 * the section's normalised text for a ref with `section`. tests/sap-references.spec.ts
 * fails when an adopted file or section is gone or its hash moved — on the weekly
 * bot branch `chore/sync-sap-references` that is the signal to review the row by
 * hand, then record the new hash (and, once all rows of a source are reviewed,
 * the new commit). Watched and not-adopted refs only produce an annotation.
 *
 * Code that follows a row cites it with one of two comments, checked by the spec:
 *   `// SAP sample: <repo>@<sha8> <path>`   e.g. `// SAP sample: SAP-samples/abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef`
 *   `// Clean ABAP: <section>`              e.g. `// Clean ABAP: Prefer RETURNING to EXPORTING`
 * `<sha8>` is the first eight characters of the reviewed commit, `<path>` a file a
 * row adopts (or the Markdown file of an adopted section), `<section>` a heading a
 * `styleguides` row adopts. Rows `clean-abap-<section>` are added by the change
 * that enables a Clean ABAP rule.
 */
import type { SapReferenceKey } from './sap-references';

export type SapReferenceAdoption = 'adopted' | 'adopted-with-correction' | 'not-adopted';

export interface SapReferenceRef {
  /** Path in the source repository, e.g. `src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls` or `22_Released_ABAP_Classes.md`. */
  path: string;
  /** For Markdown: the heading exactly as the source writes it. Without it the ref is the whole file. */
  section?: string;
  /** SHA-256 of the file, or of the section's normalised text, when the row was reviewed. */
  hashAtAdoption: string;
}

export interface SapReferenceWatchedRef extends SapReferenceRef {
  /** Why the product does not follow this file or section. */
  why: string;
}

export interface SapReferenceCitation {
  /** `flight-*`, `cheat-*`, `aff-*` or `clean-abap-*`. */
  id: string;
  source: SapReferenceKey;
  status: SapReferenceAdoption;
  /** What the product takes over, in short English. */
  adopted: string;
  /** Required unless `status` is `adopted`. */
  correction?: string;
  refs: SapReferenceRef[];
  watched?: SapReferenceWatchedRef[];
}

/** The commit of each source every `hashAtAdoption` below was taken at. */
export const SAP_REFERENCE_REVIEWED: Record<SapReferenceKey, { repo: string; branch: string; commit: string; licence: string; licenceUrl: string }> = {
  'abap-cheat-sheets': {
    repo: 'SAP-samples/abap-cheat-sheets',
    branch: 'main',
    commit: 'd43eb13c4c7c17599f5709a0314bca257b283137',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  'abap-platform-refscen-flight': {
    repo: 'SAP-samples/abap-platform-refscen-flight',
    branch: 'ABAP-platform-cloud',
    commit: '93f769170fa0b41591c3a4d39284f353cd90799e',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  styleguides: {
    repo: 'SAP/styleguides',
    branch: 'main',
    commit: '6279311f42bf1f91896935c071bec8dbca97cf59',
    licence: 'CC-BY-3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  'abap-file-formats': {
    repo: 'SAP/abap-file-formats',
    branch: 'main',
    commit: 'e42c8003d8aa7b7b510b6ff4a8f1ed83a97a835b',
    licence: 'MIT',
    licenceUrl: 'https://opensource.org/licenses/MIT',
  },
};

export const SAP_SAMPLE_COMMENT_PREFIX = '// SAP sample: ';
export const CLEAN_ABAP_COMMENT_PREFIX = '// Clean ABAP: ';
export const sapSampleComment = (source: SapReferenceKey, path: string) =>
  `${SAP_SAMPLE_COMMENT_PREFIX}${SAP_REFERENCE_REVIEWED[source].repo}@${SAP_REFERENCE_REVIEWED[source].commit.slice(0, 8)} ${path}`;
export const cleanAbapComment = (section: string) => `${CLEAN_ABAP_COMMENT_PREFIX}${section}`;

export const SAP_REFERENCE_CITATIONS: SapReferenceCitation[] = [
  /* ---------------------------------------------- SAP-samples/abap-platform-refscen-flight */
  {
    id: 'flight-dcl',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'Read access is declared at the data layer: one access control (DCL) per CDS entity of the business object, the projection inheriting the conditions of the base entity, and an authorization object of its own for the business object.',
    refs: [
      { path: 'src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls', hashAtAdoption: '7eded62bcead711d1c68f7c2d2f8aa2de65b9a14990e3b4832b9294836dff400' },
      { path: 'src/colldraft/#dmo#c_traveltp_cd.dcls.asdcls', hashAtAdoption: '553633b7cd5d7fc6ddc0d2456bc00621214850d3f83f14673645a160b35c998b' },
      { path: 'src/colldraft/#dmo#tr_cd.suso.xml', hashAtAdoption: 'd78040fe25f33999eb4da8ccb9da82b31be0017616dee32986214afbfe03285c' },
    ],
  },
  {
    id: 'flight-bdef',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'The behavior definition of a managed business object: strict mode 2, draft, ETag and lock master, `authorization master ( global, instance )` with an own authorization context naming the authorization object, and a projection behavior that uses what the base exposes.',
    refs: [
      { path: 'src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef', hashAtAdoption: '13602067e2f3a67bc0f91634ce265bbf7167f2cea32b5924594c8e4cf3334b19' },
      { path: 'src/colldraft/#dmo#c_traveltp_cd.bdef.asbdef', hashAtAdoption: 'e36bb3ca9954bda9a3a4941fb6c71c3353dac59d703e6f42905e5ab4d78c363d' },
      { path: 'src/draft/#dmo#r_travel_d.bdef.asbdef', hashAtAdoption: 'b31ccd2c71a347e5c6e21cb744c1a1f7a47d990955d31911285a4eb6366e4898' },
    ],
  },
  {
    id: 'flight-auth-impl',
    source: 'abap-platform-refscen-flight',
    status: 'adopted',
    adopted:
      'Global and instance authorization are implemented in the behavior pool (`get_global_authorizations`, `get_instance_authorizations`) with AUTHORITY-CHECK on the business object\'s own authorization object.',
    refs: [{ path: 'src/colldraft/#dmo#bp_r_traveltp_cd.clas.locals_imp.abap', hashAtAdoption: 'ec9c0875661138359a1917ac8d90daa68ad63b5dc600f978a8e96c5ee023ea6f' }],
  },

  /* ---------------------------------------------- SAP/styleguides (Clean ABAP) */
  {
    id: 'clean-abap-rules',
    source: 'styleguides',
    status: 'adopted-with-correction',
    adopted:
      'The ABAP the model writes on the RAP path is checked with the abaplint rules that implement Clean ABAP sections on correctness or maintainability (lib/clean-abap-rules.ts, merged into the ABAP Cloud abaplint run and the delivered abaplint.json).',
    correction:
      'Only rules that affect correctness or maintainability are adopted; formatting and taste rules, rules that would merge or reshape the original’s decision points, rules that conflict with the engine-written scaffold, and the outdated constant-class advice are not (each with its reason in lib/clean-abap-rules.ts).',
    refs: [
      { path: "clean-abap/CleanABAP.md", section: "Avoid DEFAULT KEY", hashAtAdoption: 'f3091318acc3203011f47d7a5cb791b466a94cad164a99583a42728653e4348d' }, // avoid_use, fully_type_itabs
      { path: "clean-abap/CleanABAP.md", section: "Use test seams as temporary workaround", hashAtAdoption: 'c14b0d183db728d402bb5f606726418eb2ef47d5da01840e1be30e8c003d3ce1' }, // avoid_use
      { path: "clean-abap/CleanABAP.md", section: "Clear or overwrite EXPORTING reference parameters", hashAtAdoption: '30221d456b66c2462f22caec3720e71eb682ab71d3978eef859e5f22089335db' }, // clear_exporting_parameters
      { path: "clean-abap/CleanABAP.md", section: "Delete code instead of commenting it", hashAtAdoption: 'd0b5e81f98a2a5ae2eafb6be388af78450cc58fd9e3634b6f7f73f747cd34ae8' }, // commented_code
      { path: "clean-abap/CleanABAP.md", section: "If your global class is CREATE PRIVATE, leave the CONSTRUCTOR public", hashAtAdoption: '0bceb756e2e05220a333f13196957eb51c099b6daf3f1372f945bfddeaf9a16a' }, // constructor_visibility_public
      { path: "clean-abap/CleanABAP.md", section: "No empty IF branches", hashAtAdoption: '6af8c655bf5ff39eff16d767ffea3e34467a4a1b9d05f78f26377c70a63de051' }, // empty_structure
      { path: "clean-abap/CleanABAP.md", section: "CHECK vs. RETURN", hashAtAdoption: 'd450984fe9fc5d97446c4049170d27c26b1df8b43c2c559e500da92eedae4710' }, // exit_or_check
      { path: "clean-abap/CleanABAP.md", section: "Use the right table type", hashAtAdoption: 'f7220216d77c50de62351c612d47619545d9a4f59a3588b5a127f2221417ae5a' }, // fully_type_itabs
      { path: "clean-abap/CleanABAP.md", section: "Prefer functional to procedural calls", hashAtAdoption: '842c777431ceecc873ae2e070f139f5ebd4b4a6709107cdf271591fe9ac56b06' }, // functional_writing
      { path: "clean-abap/CleanABAP.md", section: "Keep the nesting depth low", hashAtAdoption: '2327279f7141f889776f7faf08ee18a530b810cbcd6cb01f298a251a60cae932' }, // nesting
      { path: "clean-abap/CleanABAP.md", section: "Keep methods small", hashAtAdoption: '1d0d1b304d9aaeccf03cb9f19b970ac6a65b76efe3ae727f110d9e5cfa946912' }, // method_length
      { path: "clean-abap/CleanABAP.md", section: "Avoid obscuring built-in functions", hashAtAdoption: '9af1070030590080ad2ca7fbe38fdf058582c892671f478a785632a5d36b7abb' }, // method_overwrites_builtin
      { path: "clean-abap/CleanABAP.md", section: "Use either RETURNING or EXPORTING or CHANGING, but not a combination", hashAtAdoption: '73e745aedd8fb23bdb703d585df4febe29e95680c98949dbc8d7afd0e42f3790' }, // mix_returning
      { path: "clean-abap/CleanABAP.md", section: "Don't chain assignments", hashAtAdoption: '5c5bb6c150f86db538d9cfe4d5470ed201dcf51f51a43dc16492cbfe15f95b52' }, // no_chained_assignment
      { path: "clean-abap/CleanABAP.md", section: "Members PRIVATE by default, PROTECTED only if needed", hashAtAdoption: 'b9cfae8e0f1e34d70f9c5a693d79773dd47cebd975a49e6bdb956bf416b03238' }, // no_public_attributes
      { path: "clean-abap/CleanABAP.md", section: "Prefer functional to procedural language constructs", hashAtAdoption: 'b5694b65d5628a9443308a037a6e5a2bfe3cb813b8fff8ba0b527024ec1a545e' }, // obsolete_statement
      { path: "clean-abap/CleanABAP.md", section: "Avoid obsolete language elements", hashAtAdoption: '46e10150cc93e828237622e075b0df3c21ea1700a0f76b33ec825ca7396bf75d' }, // obsolete_statement, sql_escape_host_variables
      { path: "clean-abap/CleanABAP.md", section: "Prefer pragmas to pseudo comments", hashAtAdoption: '571d22cbae523483e4cf4f43fae855cb40fe6cc632f0393fac3a03437ece5d9f' }, // prefer_pragmas
      { path: "clean-abap/CleanABAP.md", section: "Prefer RETURNING to EXPORTING", hashAtAdoption: 'dd38e2e2580c7a05fe58a7a94aecc0a17b4d9e13a10fd09ff0e6c620f4e65be2' }, // prefer_returning_to_exporting
      { path: "clean-abap/CleanABAP.md", section: "Use XSDBOOL to set Boolean variables", hashAtAdoption: '2d0affa16b5b97e0c3ef89e2f38cefb97b4b73b1a0e418fbe45353abc1ab26af' }, // prefer_xsdbool
      { path: "clean-abap/CleanABAP.md", section: "Don't call static methods through instance variables", hashAtAdoption: '3f3372a088126122cab4229991a2008721d8b1b38e8ad52bdbdf2004e1d4f73c' }, // static_call_via_instance
      { path: "clean-abap/CleanABAP.md", section: "Use class-based exceptions", hashAtAdoption: 'ce0f9df50131d27f297b8c7b5f20ad3e732ed0010a8eb874171acc66d7911612' }, // use_class_based_exceptions
    ],
    watched: [
      { path: "clean-abap/CleanABAP.md", section: "ABAP Doc only for public APIs", hashAtAdoption: '94f58f154e0110e49ccbe52b351f5e46c7339619bffb6d4b76c66235113b9154', why: "rules here not adopted: abapdoc" },
      { path: "clean-abap/CleanABAP.md", section: "Align parameters", hashAtAdoption: 'ed5ca611a65f9bf102055399633924a5349db3ac5206af22d9165924a6a31b8b', why: "rules here not adopted: align_parameters" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer CASE to ELSE IF for multiple alternative conditions", hashAtAdoption: '7bdc5ad93bb0c1faa7df66dd3d90af1a0b0e7a6864d605469e09ae5eddaf2dad', why: "rules here not adopted: change_if_to_case" },
      { path: "clean-abap/CleanABAP.md", section: "Put comments before the statement they relate to", hashAtAdoption: 'e60ec141bb25153f1a9aac709bcdb3ce140c8589e76b067ee3bfac6aec46cece', why: "rules here not adopted: check_comments" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer ENUM to constants interfaces", hashAtAdoption: '1dcd582cb0a54946805fc8dd7a50d131b9f06fb8fdaaa9a6f4778a8cdfd616c5', why: "rules here not adopted: constant_classes" },
      { path: "clean-abap/CleanABAP.md", section: "Indent and snap to tab", hashAtAdoption: 'b3a55413e00defe507eb593216779f0ebb346d171a782be359cec82e2eab838f', why: "rules here not adopted: contains_tab, start_at_tab" },
      { path: "clean-abap/CleanABAP.md", section: "Make messages easy to find", hashAtAdoption: 'c4204a905401cb87697323a9f2c9efacf3dbc48b8766de446d51c785b9331a8f', why: "rules here not adopted: easy_to_find_messages" },
      { path: "clean-abap/CleanABAP.md", section: "Don't obsess with separating blank lines", hashAtAdoption: 'bd45d4888d2255f21a993ab61d99af9e94a02c6288aacc3f975ad3a857b45999', why: "rules here not adopted: empty_line_in_statement" },
      { path: "clean-abap/CleanABAP.md", section: "Omit the optional keyword EXPORTING", hashAtAdoption: '004adb842b73bcdf3ea20ad7bb4acb617d284eaaaf476ff9dfe8baba5abcd673', why: "rules here not adopted: exporting" },
      { path: "clean-abap/CleanABAP.md", section: "Keep single parameter calls on one line", hashAtAdoption: '242d827395b8e4f76405c108719621e262adc50f36f73b47c877cec8a102d9f6', why: "rules here not adopted: keep_single_parameter_on_one_line" },
      { path: "clean-abap/CleanABAP.md", section: "Use your team's ABAP Formatter settings", hashAtAdoption: 'd9c96a08117610be4555b771210df0c9b846d68d1df37295451e06728233f17a', why: "rules here not adopted: keyword_case" },
      { path: "clean-abap/CleanABAP.md", section: "Line-break multiple parameters", hashAtAdoption: 'de9d5ef68e09a76f5da175b588965a8aaac66dd3f3167f52087d9b72b6dd4e7f', why: "rules here not adopted: line_break_multiple_parameters" },
      { path: "clean-abap/CleanABAP.md", section: "Stick to a reasonable line length", hashAtAdoption: '59ca999e702be9a66698db60531aea83b6864287716f7500ed30521a394227a5', why: "rules here not adopted: line_length" },
      { path: "clean-abap/CleanABAP.md", section: "Close brackets at line end", hashAtAdoption: '278ab17930d1158f029bb97c97a49ad9c2c9e847a48ab95474773316e438a152', why: "rules here not adopted: line_only_punc" },
      { path: "clean-abap/CleanABAP.md", section: "No more than one statement per line", hashAtAdoption: '2b532b970bbe46f3d483fd78e15fb566170bd62bd43c846eb6e6eb504b3f1ac9', why: "rules here not adopted: max_one_statement" },
      { path: "clean-abap/CleanABAP.md", section: "Do not use variables outside of the statement block they are declared in", hashAtAdoption: '153e63ebea8238b60ae4842efe10831e4a642bbb1cf76807c296107c5b59fa50', why: "rules here not adopted: no_inline_in_optional_branches" },
      { path: "clean-abap/CleanABAP.md", section: "Choose the right targets for your loops", hashAtAdoption: 'ffc86e1228c5d04e24ffa86f2ae0ca01fd3d750b020e072839147551651a2f5f', why: "rules here not adopted: no_inline_in_optional_branches" },
      { path: "clean-abap/CleanABAP.md", section: "Avoid encodings, esp. Hungarian notation and prefixes", hashAtAdoption: '07603f0b5be2a9ed2cadc6e766c9d711cce85cb33ced592fa301fda3966ff422', why: "rules here not adopted: no_prefixes" },
      { path: "clean-abap/CleanABAP.md", section: "Omit the parameter name in single parameter calls", hashAtAdoption: '0169bfff43f347a1ffe96a57a3f270c6a0c1a814860b0a3d7cc6307c4d032311', why: "rules here not adopted: omit_parameter_name" },
      { path: "clean-abap/CleanABAP.md", section: "Omit RECEIVING", hashAtAdoption: '37ed03b8a73f0de3b33fd34040ee553283dbbcd16bd7da7b3c7c185fd36c16cf', why: "rules here not adopted: omit_receiving" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer inline to up-front declarations", hashAtAdoption: 'bbcc3fa8ca85a36e8c3ff883b3b90b399906f10916e676cbf8c4673ff1053bf3', why: "rules here not adopted: prefer_inline" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer INSERT INTO TABLE to APPEND TO", hashAtAdoption: '223d5ddc1979b86da78872fbeadf713e7459bc676ca46ee95d1173e36820612d', why: "rules here not adopted: prefer_insert_into_table" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer IS NOT to NOT IS", hashAtAdoption: '374102c78bf0a497ced758498cd6e1e60fbfd09c44883196985ddd714fe1d7d8', why: "rules here not adopted: prefer_is_not" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer RAISE EXCEPTION NEW to RAISE EXCEPTION TYPE", hashAtAdoption: 'b2565a9e221384e510dfb8058d57a9fc4dbb5bbfa5be4e5327aa9edc4c519f9d', why: "rules here not adopted: prefer_raise_exception_new" },
      { path: "clean-abap/CleanABAP.md", section: "Omit the self-reference me when calling an instance attribute or method", hashAtAdoption: '00ded58cd2d49d7ca308141d8ff38a64d658055262bec2df20c85a758f53e48f', why: "rules here not adopted: prefix_is_current_class" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer object orientation to procedural programming", hashAtAdoption: 'dda4311005a0b1e279a3cf7e3295a8db457c35db77893f4273e5f14e7f7d7a91', why: "rules here not adopted: reduce_procedural_code" },
      { path: "clean-abap/CleanABAP.md", section: "Be consistent", hashAtAdoption: '74e62a538b0375564b8c3a84c63e0d66c4d0280dd0194ec55caaf65613bb0185', why: "rules here not adopted: space_before_dot" },
      { path: "clean-abap/CleanABAP.md", section: "Condense your code", hashAtAdoption: '1f2c6fea140407103746430e3143b5ca415ab9812f9797a4a860256e39e6e465', why: "rules here not adopted: space_before_dot" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer LINE_EXISTS to READ TABLE or LOOP AT", hashAtAdoption: 'c0bbd5db81349f7cfe240b4c8de2277d1f4c10fb184b61c042dfbc1da3373bab', why: "rules here not adopted: use_line_exists" },
      { path: "clean-abap/CleanABAP.md", section: "Prefer NEW to CREATE OBJECT", hashAtAdoption: '131564e71b8721a9b9f8cc23e314167ef928746118b1862e7420fbeceeed6f31', why: "rules here not adopted: use_new" },
    ],
  },
  /* ---------------------------------------------- SAP-samples/abap-cheat-sheets */
  {
    id: 'cheat-apj',
    source: 'abap-cheat-sheets',
    status: 'adopted-with-correction',
    adopted:
      'Background work in ABAP Cloud is an application job: a job class, an application job catalog entry and a job template, created through CL_APJ_DT_CREATE_CONTENT (typed constants, an existence check before each create).',
    correction:
      'The sample’s job class implements IF_APJ_RT_RUN; the scaffold implements IF_APJ_DT_EXEC_OBJECT and IF_APJ_RT_EXEC_OBJECT, which are released in every synced catalog, while IF_APJ_RT_RUN is missing from SAP Cloud ERP Private 2023. The catalog entry and template are created in a separate setup class, not in the job class.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Application Jobs', hashAtAdoption: 'ddcfb75cea2c1c81b611e95d55f86165f62902c87b5da8bbdfaf6de0f89e917e' }],
  },
  {
    id: 'cheat-bali',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Application logs in ABAP Cloud are written and read with the CL_BALI_* classes (log object, subobject and external ID in the header), not with the classic BAL function modules.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Application Log', hashAtAdoption: 'eb629d7af57795737945fcc19a0ed7367b4f9fd547fc5e964fe7b000ff8165e5' }],
  },
  {
    id: 'cheat-mail',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Mail in ABAP Cloud is sent with CL_BCS_MAIL_MESSAGE (synchronously or with send_async), which needs an e-mail configuration in the system.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'Sending Emails', hashAtAdoption: '941f24cd8fa96e80df22d17bd247e13d1c63fb082ab97368e636569bb693a18d' }],
  },
  {
    id: 'cheat-xco',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'System fields that ABAP Cloud does not offer directly (user, date, time, language and more) are read through the released XCO library.',
    refs: [{ path: '22_Released_ABAP_Classes.md', section: 'XCO Representations of SY Components', hashAtAdoption: '1391f9b48bb0fc667b599263280ae78d9ddbe06395dacd3f7f071a24e0a2aec7' }],
  },
  {
    id: 'cheat-released-apis',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'ABAP Cloud code uses released APIs only; whether an object is released is looked up, not assumed.',
    refs: [{ path: '19_ABAP_for_Cloud_Development.md', section: 'Finding Released APIs', hashAtAdoption: '163ce41da581ea8e858c401e778d7bbbba67b2fc00e827b83e7646ccdf009598' }],
  },
  {
    id: 'cheat-rap-auth',
    source: 'abap-cheat-sheets',
    status: 'adopted',
    adopted: 'Read access is checked implicitly through CDS access control; changing access is checked through RAP authorization control in the behavior definition and its implementation.',
    refs: [
      { path: '25_Authorization_Checks.md', section: 'Implicit Authorization Checks Using CDS Access Control for Read Accesses', hashAtAdoption: '7ad824985e749a786f2625563455b0331dd2a861e9a93c55d413457fd63842f1' },
      { path: '25_Authorization_Checks.md', section: 'Excursion: Authorization Control in RAP', hashAtAdoption: 'd990e620c8ba6f5e466fde9f4b1f466e2f199d72bb8fc5ef9f19060e7e54fe00' },
    ],
  },

  /* ---------------------------------------------- SAP/abap-file-formats */
  {
    id: 'aff-schemas',
    source: 'abap-file-formats',
    status: 'adopted',
    adopted:
      'The JSON schemas of the object types our scaffolds write (TABL with its table type, DDLS, BDEF, SRVD, SRVB, CLAS, DCLS) and of the application job catalog entry and template (SAJC, SAJT), copied unchanged to validate generated object files.',
    refs: [
      { path: 'file-formats/bdef/bdef-v1.json', hashAtAdoption: 'bd89b642dbcbee06af6ad64735f926fe40f64f7c50c550289eefca23930fa335' },
      { path: 'file-formats/clas/clas-v1.json', hashAtAdoption: 'ad907fedc79293554a9189d4f2fbf29e3e71d0a588fcc589b8ade256a1d15cff' },
      { path: 'file-formats/dcls/dcls-v1.json', hashAtAdoption: 'caf2f8ad3facc88e10a644e9a28634a2de74f27c30d4c42a8ee2a14e41fc7b69' },
      { path: 'file-formats/ddls/ddls-v1.json', hashAtAdoption: 'ca662007557098a6692bbba6b5b651a8532e7e97fdd61922d0bd98f6afd71ed3' },
      { path: 'file-formats/sajc/sajc-v1.json', hashAtAdoption: 'b2108ef337ba133ea936793639199f95fae32dcff6af5d08ea59b02e303b168d' },
      { path: 'file-formats/sajt/sajt-v1.json', hashAtAdoption: '5ceede02d0d0a4eb0d5d969a11687c171dc949e2784cd9a453c70383c9006ab1' },
      { path: 'file-formats/srvb/srvb-v1.json', hashAtAdoption: '6c55659de34304c0f5a53dde7748c25d3efc711e28157f361fa8f3c59ce63b49' },
      { path: 'file-formats/srvd/srvd-v1.json', hashAtAdoption: '8022f453a976108f721bb7a869636cc91365786e8e92a04c214fae9b61a74795' },
      { path: 'file-formats/tabl/tabl-v1.json', hashAtAdoption: '2fa7e5d5ffd111972bd92f5aa48e7a11a666689b787883fe981a38a6b38f71e4' },
      { path: 'file-formats/tabl/tabt-v1.json', hashAtAdoption: '8b93d82547f4a7c2588c237e7634c481e6049a6261496e484cea422897b9d7d0' },
    ],
  },
];
