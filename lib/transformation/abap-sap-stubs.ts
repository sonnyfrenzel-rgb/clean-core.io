/**
 * The SAP classes a generated ABAP package inherits from, as empty
 * declarations (roadmap 3.0.13, item 1: an honest activation check).
 *
 * abaplint's syntax check needs a class's superclass to check the class: a
 * class `INHERITING FROM cx_static_check` is "not found or contains errors"
 * when `cx_static_check` is not there, and every use of that class is then
 * reported too — an exception class of the package, used in forty places,
 * becomes forty findings that are not the package's. SAP's released objects
 * are not available to the check, so the few roots the scaffold derives from
 * are given here, as declarations with the public signature the generated
 * code uses and no implementation.
 *
 * What is here, and why each is safe to state:
 *
 *   - `cx_root` and its three direct subclasses: the constructor takes
 *     `textid` and `previous`, both optional, and `get_text` / `get_longtext`
 *     return strings — the signature every ABAP release has had;
 *   - `cl_abap_behavior_handler`: the abstract base of every RAP handler
 *     class, with the two protected methods a handler calls to build a
 *     message (`new_message`, `new_message_with_text`);
 *   - `cl_abap_behavior_saver`: the base of a saver class (unmanaged or
 *     additional save), with its save-phase methods.
 *
 * Nothing else. Every other SAP object the code names (job interfaces,
 * `if_oo_adt_classrun`, `cl_abap_unit_assert` …) is not declared here; the
 * check counts each reference it cannot resolve apart from the package's own
 * errors (`abap-check.ts`). The same files are delivered under
 * `checks/sap-stubs/`, and the delivered `abaplint.json` names that folder as
 * its dependency, so the package's own CI reads exactly what the check read.
 *
 * Pure, no imports.
 */

/** The folder the stubs are delivered in, relative to the package root. */
export const SAP_STUBS_FOLDER = 'checks/sap-stubs';

const HEAD = '* Declaration only, for abaplint (Clean-Core.io): the public signature of an SAP class, without its implementation.';

const cxRoot = [
  HEAD,
  'CLASS cx_root DEFINITION PUBLIC ABSTRACT CREATE PUBLIC.',
  '  PUBLIC SECTION.',
  '    INTERFACES if_message.',
  '    DATA textid TYPE sotr_conc READ-ONLY.',
  '    DATA previous TYPE REF TO cx_root READ-ONLY.',
  '    DATA is_resumable TYPE abap_bool READ-ONLY.',
  '    METHODS constructor IMPORTING textid LIKE textid OPTIONAL previous LIKE previous OPTIONAL.',
  '    METHODS get_text RETURNING VALUE(result) TYPE string.',
  '    METHODS get_longtext IMPORTING preserve_newlines TYPE abap_bool OPTIONAL RETURNING VALUE(result) TYPE string.',
  'ENDCLASS.',
  '',
  'CLASS cx_root IMPLEMENTATION.',
  '  METHOD constructor.',
  '  ENDMETHOD.',
  '  METHOD get_text.',
  '  ENDMETHOD.',
  '  METHOD get_longtext.',
  '  ENDMETHOD.',
  '  METHOD if_message~get_text.',
  '  ENDMETHOD.',
  '  METHOD if_message~get_longtext.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
].join('\n');

/** IF_MESSAGE, which CX_ROOT implements: an exception class of the package redefines its get_text (3.0.13, the refusal). */
const ifMessage = [
  HEAD,
  'INTERFACE if_message PUBLIC.',
  '  METHODS get_text RETURNING VALUE(result) TYPE string.',
  '  METHODS get_longtext IMPORTING preserve_newlines TYPE abap_bool OPTIONAL RETURNING VALUE(result) TYPE string.',
  'ENDINTERFACE.',
  '',
].join('\n');

const cxChild = (name: string) =>
  [
    HEAD,
    `CLASS ${name} DEFINITION PUBLIC INHERITING FROM cx_root ABSTRACT CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    '    METHODS constructor IMPORTING textid LIKE textid OPTIONAL previous LIKE previous OPTIONAL.',
    'ENDCLASS.',
    '',
    `CLASS ${name} IMPLEMENTATION.`,
    '  METHOD constructor.',
    '    super->constructor( textid = textid previous = previous ).',
    '  ENDMETHOD.',
    'ENDCLASS.',
    '',
  ].join('\n');

const behaviorHandler = [
  HEAD,
  'CLASS cl_abap_behavior_handler DEFINITION PUBLIC ABSTRACT CREATE PUBLIC.',
  '  PROTECTED SECTION.',
  '    METHODS new_message IMPORTING id TYPE symsgid number TYPE symsgno severity TYPE if_abap_behv_message=>t_severity',
  '                                  v1 TYPE simple OPTIONAL v2 TYPE simple OPTIONAL v3 TYPE simple OPTIONAL v4 TYPE simple OPTIONAL',
  '                        RETURNING VALUE(obj) TYPE REF TO if_abap_behv_message.',
  '    METHODS new_message_with_text IMPORTING severity TYPE if_abap_behv_message=>t_severity OPTIONAL text TYPE csequence OPTIONAL',
  '                                  RETURNING VALUE(obj) TYPE REF TO if_abap_behv_message.',
  'ENDCLASS.',
  '',
  'CLASS cl_abap_behavior_handler IMPLEMENTATION.',
  '  METHOD new_message.',
  '  ENDMETHOD.',
  '  METHOD new_message_with_text.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  '',
].join('\n');

/**
 * `cl_abap_behavior_saver` (scaffold version 18): the base of the saver class a business object with an unmanaged or
 * an additional save carries (`rap-save.ts`). Its methods take no parameter here: the real ones are typed by the
 * behavior definition, and the saver the scaffold writes only redefines `save_modified`.
 */
const behaviorSaver = [
  HEAD,
  'CLASS cl_abap_behavior_saver DEFINITION PUBLIC ABSTRACT CREATE PUBLIC.',
  '  PROTECTED SECTION.',
  '    METHODS finalize.',
  '    METHODS check_before_save.',
  '    METHODS adjust_numbers.',
  '    METHODS save.',
  '    METHODS save_modified.',
  '    METHODS cleanup.',
  '    METHODS cleanup_finalize.',
  'ENDCLASS.',
  '',
  'CLASS cl_abap_behavior_saver IMPLEMENTATION.',
  ...['finalize', 'check_before_save', 'adjust_numbers', 'save', 'save_modified', 'cleanup', 'cleanup_finalize'].flatMap((m) => [`  METHOD ${m}.`, '  ENDMETHOD.']),
  'ENDCLASS.',
  '',
].join('\n');

/** The stub files, by file name (abapGit naming, so abaplint reads each as a class). */
export const SAP_STUB_FILES: ReadonlyArray<{ name: string; object: string; content: string }> = [
  { name: 'if_message.intf.abap', object: 'IF_MESSAGE', content: ifMessage },
  { name: 'cx_root.clas.abap', object: 'CX_ROOT', content: cxRoot },
  { name: 'cx_static_check.clas.abap', object: 'CX_STATIC_CHECK', content: cxChild('cx_static_check') },
  { name: 'cx_dynamic_check.clas.abap', object: 'CX_DYNAMIC_CHECK', content: cxChild('cx_dynamic_check') },
  { name: 'cx_no_check.clas.abap', object: 'CX_NO_CHECK', content: cxChild('cx_no_check') },
  { name: 'cl_abap_behavior_handler.clas.abap', object: 'CL_ABAP_BEHAVIOR_HANDLER', content: behaviorHandler },
  { name: 'cl_abap_behavior_saver.clas.abap', object: 'CL_ABAP_BEHAVIOR_SAVER', content: behaviorSaver },
];

/** The stub files as package files (`checks/sap-stubs/…`). */
export function sapStubPackageFiles(): Array<{ path: string; content: string }> {
  return SAP_STUB_FILES.map((f) => ({ path: `${SAP_STUBS_FOLDER}/${f.name}`, content: f.content }));
}
