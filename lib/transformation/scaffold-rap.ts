/**
 * The RAP / ABAP Cloud scaffold (design §6.3), in abapGit file layout.
 *
 *   - a table, the root view entity and its projection: one element per record
 *     field, a packed field typed `abap.dec(2L−1, d)` from its declaration
 *     (L bytes, d places);
 *   - the behavior definition, `strict ( 2 )`, managed, with **one validation
 *     per carried guard** (none for a guard of a dropped rule) and one
 *     determination that runs the process on save;
 *   - the behavior pool: every method frame engine-written; a validation reads
 *     the instances and asks the guard's predicate in the logic class;
 *   - the logic class `zcl_<name>_logic`: one method per unit and one
 *     predicate per carried guard, each body between fill markers;
 *   - the service definition and binding, an exception class for stubs, and
 *     an ABAP Unit test class with one test method per engine case (exact
 *     arithmetic written by the engine; the rest given/when/then with the
 *     expected value, skipped until the logic exists).
 *
 * Since scaffold version 2 (3.0.12, DSAG ABAP guide review C3, B3, B4, B9):
 *
 *   - **authorization is checked, and denied until filled.** Both views carry
 *     `@AccessControl.authorizationCheck: #CHECK`; an access control (`.dcls`)
 *     per view, the root's granting nothing until replaced and naming the
 *     original's `AUTHORITY-CHECK` objects and fields; the behavior handlers
 *     deny create, update and delete. Each such place carries an `@cc-open`
 *     marker: written by the engine, completed by a developer, never by the
 *     model. Failure pattern FP-GUARD-05 (`docs/failure-patterns/catalogue.json`)
 *     is the risk this closes: a generated write path without the original's
 *     authorization;
 *   - **an access layer** (`zif_<name>_access`, its default implementation and
 *     an exception class) with one method per SAP object the original reads,
 *     writes or calls (`access-layer.ts`), injected into the logic class
 *     through its constructor — code-draft rule 25;
 *   - **an Application Job** (a class implementing `IF_APJ_DT_EXEC_OBJECT` and
 *     `IF_APJ_RT_EXEC_OBJECT`, and a setup class creating its catalog entry and
 *     template through `CL_APJ_DT_CREATE_CONTENT`) where the unit plan says the
 *     original runs in the background (`abap-delivery.ts`) — beside the UI
 *     service, or instead of it when the original has no dialog and no list;
 *   - **ABAP Doc on every public method**, in English, saying why it exists and
 *     anchored at the original's line, or saying it has no counterpart there.
 *
 * What is confirmed and what is not: the release state of every SAP object the
 * scaffold names is in SAP's Cloudification Repository as synced into
 * `lib/abap/generated/` (`IF_APJ_DT_EXEC_OBJECT`, `IF_APJ_RT_EXEC_OBJECT`,
 * `CL_APJ_DT_CREATE_CONTENT`, `CX_APJ_DT_CONTENT`, `CX_APJ_RT_CONTENT`,
 * `IF_OO_ADT_CLASSRUN`, `IF_ABAP_BEHV`, `CL_ABAP_BEHAVIOR_HANDLER`,
 * `CX_STATIC_CHECK`, `CX_NO_CHECK`: released). The shapes follow SAP's own
 * samples, read through the GitHub API on 13.10.2026 and cited where they are
 * used: the access controls, `authorization master` and the authorization
 * handlers after SAP-samples/abap-platform-refscen-flight (branch
 * ABAP-platform-cloud, 93f76917); the job setup after
 * SAP-samples/abap-cheat-sheets (d43eb13c). Not confirmed by either: the
 * parameter structure of `IF_APJ_DT_EXEC_OBJECT~GET_PARAMETERS`, and
 * `where false` (the sample shows `where true`). abaplint has neither SAP's
 * definitions nor a parser for access controls; activation in ADT is the check.
 *
 * Since scaffold version 3 (3.0.12, importable package): **every object carries
 * abapGit's metadata file** (`<name>.<type>.xml`, `abapgit-files.ts`), the
 * table is abapGit's `.tabl.xml` (abapGit has no source form of a table; the
 * `.tabl.astabl` written before was neither abapGit's nor SAP's ABAP file
 * format), the root folder carries `package.devc.xml`, and `.abapgit.xml` is the
 * one the delivery writes. A customer imports the package with abapGit; the
 * formats check (`abapgit-check.ts`) holds every metadata file against the
 * structure abapGit's serializer writes. abapGit, not AFF JSON: abapGit reads AFF
 * for none of the types written here (INTF only behind an experimental switch) —
 * the evidence is in `abapgit-files.ts`.
 *
 * Deviation from the design table: the test class is the logic class's local
 * test include (`zcl_<name>_logic.clas.testclasses.abap`) — an abapGit
 * `.testclasses.abap` file belongs to a class, so a separate `ztc_` file
 * would have no class to belong to.
 *
 * Pure and deterministic. No network, no model.
 */

import { deriveEngineCases, type EngineCaseDerivation } from '../testing-engine-cases';
import { defuseMarkers, findRegions, regionText, scaffoldDigest } from './markers';
import { rangeWords, type EngineFacts } from './unit-plan';
import { requiredGuardsOf } from './scaffold-node';
import { accessPointsOf, type AccessPoint } from './access-layer';
import type { AuthorityCheck } from '../abap/call-graph';
import { NAME_MAX, abapGitRepoSettingsXml, bdefXml, clasXml, dclsXml, ddlsXml, devcXml, intfXml, srvbXml, srvdXml, tablXml, type TableField } from './abapgit-files';
import { SCAFFOLD_VERSION, type ContractField, type PlanGuard, type RequiredGuard, type Scaffold, type ScaffoldFile, type Unit, type UnitPlan } from './types';

/**
 * Marks a place the engine wrote and a developer completes — never the model
 * (authorization, the access layer's SAP calls, the job's parameters). Not a
 * fill marker: no region, no fill unit, part of the scaffold digest.
 */
export const OPEN_MARKER = '@cc-open';

export interface RapScaffoldOptions {
  cases?: EngineCaseDerivation;
}

/** The short name every object of the package carries: ≤ 12 characters, so every name stays ≤ 30. */
export function rapShortName(program: string | null): string {
  const base = (program ?? 'program').toLowerCase().replace(/^\/[\w]+\//, '').replace(/^[zy]/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'program').slice(0, 12).replace(/_+$/, '');
}

const abapField = (f: ContractField) => f.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).slice(0, 30);

/**
 * The table field of a record field: a packed field is DEC(2L−1, d) from its
 * declaration (the declared digits are 2L−1 already) — `abap.dec(2L−1, d)` in
 * ADT's table source; a flag the data element ABAP_BOOLEAN.
 */
function tableField(f: ContractField): TableField {
  const name = abapField(f);
  switch (f.kind) {
    case 'packed':
      return { name, builtin: 'DEC', length: f.digits ?? 15, decimals: f.places };
    case 'digits':
      return { name, builtin: 'NUMC', length: f.digits ?? 10 };
    case 'integer':
      return { name, builtin: f.max === '9223372036854775807' ? 'INT8' : 'INT4' };
    case 'date':
      return { name, builtin: 'DATS' };
    case 'flag':
      return { name, dataElement: 'ABAP_BOOLEAN' };
    default:
      return { name, builtin: 'CHAR', length: 40 };
  }
}

/** A transparent table's name has at most 16 characters (abaplint `getAllowedNaming` of TABL): `z<short>_rec`, the short name cut where it would not fit. */
export function rapTableName(short: string): string {
  const room = NAME_MAX.TABL - 'z'.length - '_rec'.length;
  return `z${short.length <= room ? short : short.slice(0, room).replace(/_+$/, '')}_rec`;
}

function abapType(f: ContractField): string {
  switch (f.kind) {
    case 'packed':
      return `p LENGTH ${Math.ceil(((f.digits ?? 15) + 1) / 2)} DECIMALS ${f.places}`;
    case 'digits':
      return `n LENGTH ${f.digits ?? 10}`;
    case 'integer':
      return f.max === '9223372036854775807' ? 'int8' : 'i';
    case 'date':
      return 'd';
    case 'flag':
      return 'abap_bool';
    case 'range':
      return 'RANGE OF string';
    default:
      return 'string';
  }
}

const validationName = (g: PlanGuard) => `val_${g.rule ? `${g.rule.replace('-', '_').toLowerCase()}_` : ''}${g.id.replace('-', '').toLowerCase()}`.slice(0, 30);
const predicateName = (g: PlanGuard) => `when_${g.id.replace('-', '').toLowerCase()}`;

function unitComment(u: Unit, plan: UnitPlan): string[] {
  const rules = u.rules.map((id) => `${id} (${plan.rules.find((r) => r.id === id)?.decision ?? 'open'})`);
  return [
    `    "! ${u.title}. ABAP: ${rangeWords(u.abap.slice(0, 1))}${u.routine ? ` (${u.kind === 'method' ? 'METHOD' : 'FORM'} ${u.routine})` : ''}${u.folded.length ? `; folded: ${u.folded.join(', ')}` : ''}`,
    `    "! Rules: ${rules.join(', ') || 'none'}. Guards: ${u.guards.join(', ') || 'none'}. Unit ${u.id}: frame by the engine, body a model proposal.`,
    ...(u.bodyCalls.length > 0 ? [`    "! The body calls, where the original checks: ${u.bodyCalls.map((id) => `${predicateName(plan.guards.find((x) => x.id === id)!)}( ) (L${id.slice(2).replace(/^0+/, '')})`).join(', ')}.`] : []),
  ];
}

/** The original's authority checks as one line each: `L120 AUTHORITY-CHECK OBJECT 'M_BEST_BSA' ID 'ACTVT' FIELD '03'`. */
function authorityLines(checks: readonly AuthorityCheck[]): string[] {
  return checks.map((c) => `L${c.lineStart} ${c.text.replace(/["\n\r]/g, "'").replace(/\*\//g, '* /').slice(0, 160)}`);
}

/** The objects and fields the original checks, `M_BEST_BSA (ACTVT, BSART)`, for one line of a comment. */
function authorityObjects(checks: readonly AuthorityCheck[]): string {
  const by = new Map<string, Set<string>>();
  for (const c of checks) {
    const name = (c.object ?? c.objectExpression).replace(/["']/g, '');
    const fields = by.get(name) ?? new Set<string>();
    for (const f of c.fields) fields.add(f.dummy ? `${f.id} DUMMY` : f.id);
    by.set(name, fields);
  }
  return [...by].map(([o, f]) => `${o}${f.size ? ` (${[...f].join(', ')})` : ''}`).join(', ');
}

/** The data type and length an Application Job parameter takes for a selection field, and whether that is known. */
function jobParameterType(f: ContractField): { datatype: string; length: number; decimals: number; known: boolean } {
  switch (f.kind) {
    case 'date':
      return { datatype: 'D', length: 8, decimals: 0, known: true };
    case 'digits':
      return { datatype: 'N', length: f.digits ?? 10, decimals: 0, known: f.digits !== null };
    case 'flag':
      return { datatype: 'C', length: 1, decimals: 0, known: true };
    case 'packed':
      return { datatype: 'P', length: f.digits ?? 15, decimals: f.places, known: f.digits !== null };
    case 'integer':
      return { datatype: 'I', length: 10, decimals: 0, known: false };
    default:
      return { datatype: 'C', length: 40, decimals: 0, known: false };
  }
}

/** The RAP scaffold of a plan — see the file comment. */
export function buildRapScaffold(plan: UnitPlan, facts: EngineFacts, options: RapScaffoldOptions = {}): Scaffold {
  const s = rapShortName(plan.program);
  const cases = options.cases ?? deriveEngineCases(facts.source, facts.ruleSet.rules);
  const table = rapTableName(s);
  const root = `z${s}_r`;
  const proj = `z${s}_c`;
  const logic = `zcl_${s}_logic`;
  const pool = `zbp_${s}_r`;
  const cx = `zcx_${s}_nofill`;
  const srvd = `z${s}_srvd`;
  const srvb = `z${s}_srvb`;
  const accessIf = `zif_${s}_access`;
  const accessCl = `zcl_${s}_access`;
  const accessCx = `zcx_${s}_access`;
  const job = `zcl_${s}_job`;
  const jobSetup = `zcl_${s}_job_setup`;
  const access = accessPointsOf(facts);
  const hasAccess = access.points.length > 0;
  const delivery = plan.abapDelivery;
  const withJob = delivery.kind !== 'ui-service';
  const withService = delivery.kind !== 'application-job';
  const checks = facts.graph.authorityChecks;
  const checkedObjects = checks.length > 0 ? authorityObjects(checks) : '';
  const record = plan.fields.filter((f) => f.where === 'record');
  const selection = plan.fields.filter((f) => f.where === 'selection');
  const carried = plan.guards.filter((g) => g.carried);
  // A validation checks the instance on save: only a raw check that refuses fits (rule 15). A derived or skipping
  // check stays a predicate the logic method calls where the original checks.
  const validated = carried.filter((g) => g.placement !== 'body' && g.outcome === 'refuses');
  const files: ScaffoldFile[] = [];
  const available: Record<string, string[]> = {};
  const head = `* Generated by Clean-Core.io (engine) for ${plan.program ?? 'the program'}; bodies between the fill markers are model proposals.`;

  // ---- table (abapGit has no source form of a table: its XML is the whole object), views
  files.push({
    path: `src/${table}.tabl.xml`,
    owner: 'engine',
    content: tablXml(table, `Records of ${plan.program ?? 'the program'} (Clean-Core.io)`, [
      { name: 'client', key: true, notNull: true, builtin: 'CLNT' },
      { name: 'rec_uuid', key: true, notNull: true, dataElement: 'SYSUUID_X16' },
      ...record.map(tableField),
      { name: 'local_last_changed', dataElement: 'ABP_LOCINST_LASTCHANGE_TSTMPL' },
    ]),
  });
  const viewFields = record.map((f) => `      ${abapField(f)}, // ${f.original} ${f.declaration}, L${f.line}`);
  files.push({
    path: `src/${root}.ddls.asddls`,
    owner: 'engine',
    content: [
      `@AccessControl.authorizationCheck: #CHECK`,
      `@EndUserText.label: 'Root view of ${plan.program ?? 'the program'}'`,
      `define root view entity ${root.toUpperCase()}`,
      `  as select from ${table}`,
      '{',
      '  key rec_uuid as RecUuid,',
      ...viewFields,
      '      @Semantics.systemDateTime.localInstanceLastChangedAt: true',
      '      local_last_changed',
      '}',
      '',
    ].join('\n'),
  });
  files.push({
    path: `src/${proj}.ddls.asddls`,
    owner: 'engine',
    content: [
      `@AccessControl.authorizationCheck: #CHECK`,
      `@EndUserText.label: 'Projection of ${plan.program ?? 'the program'}'`,
      `define root view entity ${proj.toUpperCase()}`,
      `  provider contract transactional_query`,
      `  as projection on ${root.toUpperCase()}`,
      '{',
      '  key RecUuid,',
      ...record.map((f) => `      ${abapField(f)},`),
      '      local_last_changed',
      '}',
      '',
    ].join('\n'),
  });

  // ---- access controls: the root grants nothing until a developer writes its condition (C3, FP-GUARD-05)
  const originalChecks =
    checks.length > 0
      ? ['  // The original checks (read by the engine):', ...authorityLines(checks).map((l) => `  //   ${l}`)]
      : ['  // The original makes no AUTHORITY-CHECK: decide who may read these records before you replace the condition.'];
  // SAP sample: abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.dcls.asdcls and
  // #dmo#c_traveltp_cd.dcls.asdcls — a mapping role per view, the projection inheriting the root's conditions. The
  // sample's root grants `where true` and the projection inherits with `default true`; the scaffold grants
  // `where false` and inherits with `default false`, so nothing is readable until a developer writes the condition.
  files.push({
    path: `src/${root}.dcls.asdcls`,
    owner: 'engine',
    content: [
      `@EndUserText.label: 'Access to the records of ${plan.program ?? 'the program'}'`,
      '@MappingRole: true',
      `define role ${root.toUpperCase()} {`,
      `  // ${OPEN_MARKER} AUTH: fails closed - the condition below holds for no record, so nobody`,
      '  // reads a record until you replace it, for example with',
      "  //   where ( <element> ) = aspect pfcg_auth( <authorization object>, <field>, ACTVT = '03' );",
      '  // using an authorization object of your own or one SAP has released for ABAP Cloud. Failure pattern FP-GUARD-05.',
      '  // Not checked by Clean-Core.io: abaplint has no parser for access controls - activate in ADT.',
      ...originalChecks,
      `  grant select on ${root.toUpperCase()}`,
      '    where false;',
      '}',
      '',
    ].join('\n'),
  });
  files.push({
    path: `src/${proj}.dcls.asdcls`,
    owner: 'engine',
    content: [
      `@EndUserText.label: 'Access to the projection of ${plan.program ?? 'the program'}'`,
      '@MappingRole: true',
      `define role ${proj.toUpperCase()} {`,
      `  grant select on ${proj.toUpperCase()}`,
      `    where inheriting conditions from entity ${root.toUpperCase()} default false;`,
      '}',
      '',
    ].join('\n'),
  });

  // ---- behavior definition: one validation per carried guard
  const recFieldList = record.map(abapField).join(', ') || 'local_last_changed';
  files.push({
    path: `src/${root}.bdef.asbdef`,
    owner: 'engine',
    content: [
      `managed implementation in class ${pool} unique;`,
      'strict ( 2 );',
      '',
      `define behavior for ${root.toUpperCase()} alias Rec`,
      `persistent table ${table}`,
      'lock master',
      // SAP sample: abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#r_traveltp_cd.bdef.asbdef
      'authorization master ( instance, global )',
      'etag master local_last_changed',
      '{',
      '  create;',
      '  update;',
      '  delete;',
      '  field ( numbering : managed, readonly ) RecUuid;',
      ...validated.map((g) => `  validation ${validationName(g)} on save { create; update; field ${recFieldList}; } // ${g.id} ${g.rule ?? ''} L${g.line}`),
      `  determination run_process on save { create; update; }`,
      '  mapping for ' + table + ' corresponding { RecUuid = rec_uuid; }',
      '}',
      '',
    ].join('\n'),
  });

  // ---- logic class: one method per unit, one predicate per carried guard
  const typeLines = [
    '    TYPES:',
    '      BEGIN OF ty_rec,',
    ...(record.length ? record.map((f) => `        ${abapField(f)} TYPE ${abapType(f)},`) : ['        rec_uuid TYPE sysuuid_x16,']),
    '      END OF ty_rec,',
    '      tt_rec TYPE STANDARD TABLE OF ty_rec WITH EMPTY KEY,',
    '      BEGIN OF ty_selection,',
    ...(selection.length ? selection.map((f) => `        ${abapField(f)} TYPE ${abapType(f)},`) : ['        run TYPE abap_bool,']),
    '      END OF ty_selection,',
    '      BEGIN OF ty_state,',
    '        records TYPE tt_rec,',
    '        not_filled TYPE string_table,',
    '      END OF ty_state.',
  ];
  const defs: string[] = [];
  const impls: string[] = [];
  const unitsWithBody = plan.units.filter((u) => !plan.units.some((p) => p.part?.parent === u.id));
  for (const u of unitsWithBody) {
    defs.push(...unitComment(u, plan));
    defs.push(`    METHODS ${u.rapName} IMPORTING is_sel TYPE ty_selection CHANGING cs_st TYPE ty_state.`);
    const anchor = `${u.rapName}|${u.abap.map((a) => `${a.lineStart}-${a.lineEnd}`).join(',')}|${u.rules.join(',')}|${u.guards.join(',')}`;
    impls.push(`  METHOD ${u.rapName}.`);
    impls.push(regionText('rap', u.id, anchor, '    ', `RAISE EXCEPTION NEW ${cx}( unit = '${u.id}' ).`));
    impls.push('  ENDMETHOD.', '');
    available[u.id] = [logic, 'me', ...(hasAccess ? ['mo_access'] : []), ...u.callees.map((id) => plan.units.find((x) => x.id === id)?.rapName ?? id)];
  }
  for (const g of carried) {
    defs.push(`    "! ${g.id} · ${g.rule ?? 'no rule'} (${g.decision}) · L${g.line}: ${g.condition.replace(/"/g, "'")}`);
    if (g.placement === 'body') {
      defs.push(`    "! ${g.basis === 'derived' ? `Derived (${(g.basisReason ?? '').replace(/"/g, "'")})` : 'Skips one record'}: the unit's method calls this where the original checks, at L${g.line}.`);
    }
    // A derived check receives the values the method computed before it, one parameter each.
    const values = g.basis === 'derived' ? g.operands.map((o) => ` iv_${o.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`.slice(0, 31) + ' TYPE string OPTIONAL').join('') : '';
    defs.push(`    METHODS ${predicateName(g)} IMPORTING is_sel TYPE ty_selection is_rec TYPE ty_rec OPTIONAL${values} RETURNING VALUE(rv_holds) TYPE abap_bool.`);
    impls.push(`  METHOD ${predicateName(g)}.`);
    impls.push(regionText('rap', g.regionId!, `${predicateName(g)}|${g.line}|${g.condition}`, '    ', `RAISE EXCEPTION NEW ${cx}( unit = '${g.regionId}' ).`));
    impls.push('  ENDMETHOD.', '');
    available[g.regionId!] = [logic, 'me'];
  }
  const accessDefs = hasAccess
    ? [
        '    "! The access layer: every SAP read, write and call of the original goes through it (rule 25). No counterpart in the original.',
        `    DATA mo_access TYPE REF TO ${accessIf} READ-ONLY.`,
        `    "! Takes the access layer, so ABAP Unit can pass a test double; without one, ${accessCl}. No counterpart in the original.`,
        `    METHODS constructor IMPORTING io_access TYPE REF TO ${accessIf} OPTIONAL.`,
      ]
    : [];
  const accessImpl = hasAccess ? ['  METHOD constructor.', `    mo_access = COND #( WHEN io_access IS BOUND THEN io_access ELSE NEW ${accessCl}( ) ).`, '  ENDMETHOD.', ''] : [];
  files.push({
    path: `src/${logic}.clas.abap`,
    owner: 'fill',
    content: [
      head,
      `CLASS ${logic} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      ...typeLines,
      ...accessDefs,
      ...defs,
      'ENDCLASS.',
      '',
      `CLASS ${logic} IMPLEMENTATION.`,
      '',
      ...accessImpl,
      ...impls,
      'ENDCLASS.',
      '',
    ].join('\n'),
  });

  // ---- behavior pool: frames written by the engine; a validation asks the predicate
  const poolDefs = [
    `CLASS lhc_rec DEFINITION INHERITING FROM cl_abap_behavior_handler.`,
    '  PRIVATE SECTION.',
    '    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION',
    '      IMPORTING REQUEST requested_authorizations FOR Rec RESULT result.',
    '    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION',
    '      IMPORTING keys REQUEST requested_authorizations FOR Rec RESULT result.',
    '    METHODS is_create_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
    '    METHODS is_update_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
    '    METHODS is_delete_granted RETURNING VALUE(rv_granted) TYPE abap_bool.',
    ...validated.map((g) => `    METHODS ${validationName(g)} FOR VALIDATE ON SAVE IMPORTING keys FOR Rec~${validationName(g)}.`),
    '    METHODS run_process FOR DETERMINE ON SAVE IMPORTING keys FOR Rec~run_process.',
    'ENDCLASS.',
  ];
  const authWhat =
    checks.length > 0
      ? `the original checks ${checkedObjects} (${checks.map((c) => `L${c.lineStart}`).join(', ')})`
      : 'the original makes no AUTHORITY-CHECK - decide who may change these records';
  // SAP sample: abap-platform-refscen-flight@93f76917 src/colldraft/#dmo#bp_r_traveltp_cd.clas.locals_imp.abap —
  // global and instance authorization answer per requested operation from is_*_granted helpers that hold the
  // AUTHORITY-CHECK, and report a message when they deny. Where the sample then simulates full authorization
  // ("not to be used in productive code"), the scaffold denies: the helpers return abap_false until a developer
  // writes the check (fail closed, FP-GUARD-05).
  const denied = (scope: 'global' | 'instance') =>
    scope === 'global'
      ? "        APPEND VALUE #( %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = 'Not authorized' ) %global = if_abap_behv=>mk-on ) TO reported-rec."
      : "          APPEND VALUE #( %tky = key-%tky %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = 'Not authorized' ) ) TO reported-rec.";
  const globalOp = (op: 'create' | 'update' | 'delete') => [
    `    IF requested_authorizations-%${op} = if_abap_behv=>mk-on.`,
    `      result-%${op} = COND #( WHEN is_${op}_granted( ) = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).`,
    `      IF result-%${op} = if_abap_behv=>auth-unauthorized.`,
    `  ${denied('global')}`,
    '      ENDIF.',
    '    ENDIF.',
  ];
  const granted = (op: 'create' | 'update' | 'delete', activity: string) => [
    `  METHOD is_${op}_granted.`,
    `    " ${OPEN_MARKER} AUTH: ${op} is denied until you check authorization here (activity ${activity}); ${authWhat}.`,
    '    " Failure pattern FP-GUARD-05: a write path without the original\'s authorization.',
    '    rv_granted = abap_false.',
    '  ENDMETHOD.',
    '',
  ];
  const poolImpls: string[] = [
    'CLASS lhc_rec IMPLEMENTATION.',
    '',
    '  METHOD get_global_authorizations.',
    ...globalOp('create'),
    ...globalOp('update'),
    ...globalOp('delete'),
    '  ENDMETHOD.',
    '',
    '  METHOD get_instance_authorizations.',
    '    DATA(lv_update) = COND #( WHEN requested_authorizations-%update = if_abap_behv=>mk-on AND is_update_granted( ) = abap_true',
    '                              THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
    '    DATA(lv_delete) = COND #( WHEN requested_authorizations-%delete = if_abap_behv=>mk-on AND is_delete_granted( ) = abap_true',
    '                              THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).',
    '    LOOP AT keys INTO DATA(key).',
    '      APPEND VALUE #( %tky = key-%tky %update = lv_update %delete = lv_delete ) TO result.',
    '      IF ( requested_authorizations-%update = if_abap_behv=>mk-on AND lv_update = if_abap_behv=>auth-unauthorized )',
    '         OR ( requested_authorizations-%delete = if_abap_behv=>mk-on AND lv_delete = if_abap_behv=>auth-unauthorized ).',
    denied('instance'),
    '      ENDIF.',
    '    ENDLOOP.',
    '  ENDMETHOD.',
    '',
    ...granted('create', "'01'"),
    ...granted('update', "'02'"),
    ...granted('delete', "'06'"),
  ];
  for (const g of validated) {
    const effect = g.effect === 'check' ? 'NOT ' : '';
    poolImpls.push(
      `  METHOD ${validationName(g)}.`,
      `    " ${g.id} ${g.rule ?? ''} L${g.line}: ${g.condition.replace(/"/g, "'")} → ${g.ending.replace(/"/g, "'")} (${g.effect})`,
      `    READ ENTITIES OF ${root} IN LOCAL MODE ENTITY Rec ALL FIELDS WITH CORRESPONDING #( keys ) RESULT DATA(lt_rec).`,
      `    DATA(lo_logic) = NEW ${logic}( ).`,
      '    LOOP AT lt_rec INTO DATA(ls_rec).',
      `      IF ${effect}lo_logic->${predicateName(g)}( is_sel = VALUE #( ) is_rec = CORRESPONDING #( ls_rec ) ) = abap_true.`,
      '        APPEND VALUE #( %tky = ls_rec-%tky ) TO failed-rec.',
      `        APPEND VALUE #( %tky = ls_rec-%tky %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = '${(g.rule ?? `L${g.line}`)}: ${g.condition.replace(/'/g, "''").slice(0, 60)}' ) ) TO reported-rec.`,
      '      ENDIF.',
      '    ENDLOOP.',
      '  ENDMETHOD.',
      '',
    );
  }
  poolImpls.push(
    '  METHOD run_process.',
    `    READ ENTITIES OF ${root} IN LOCAL MODE ENTITY Rec ALL FIELDS WITH CORRESPONDING #( keys ) RESULT DATA(lt_rec).`,
    `    DATA(ls_st) = VALUE ${logic}=>ty_state( records = CORRESPONDING #( lt_rec ) ).`,
    `    NEW ${logic}( )->run_steps( EXPORTING is_sel = VALUE #( ) CHANGING cs_st = ls_st ).`,
    '  ENDMETHOD.',
    '',
    'ENDCLASS.',
  );
  files.push({ path: `src/${pool}.clas.abap`, owner: 'engine', content: [head, `CLASS ${pool} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${root}.`, 'ENDCLASS.', '', `CLASS ${pool} IMPLEMENTATION.`, 'ENDCLASS.', ''].join('\n') });
  files.push({ path: `src/${pool}.clas.locals_imp.abap`, owner: 'engine', content: [head, ...poolDefs, '', ...poolImpls, ''].join('\n') });

  // ---- exception for stubs, service
  files.push({
    path: `src/${cx}.clas.abap`,
    owner: 'engine',
    content: [
      head,
      `CLASS ${cx} DEFINITION PUBLIC INHERITING FROM cx_no_check FINAL CREATE PUBLIC.`,
      '  PUBLIC SECTION.',
      '    "! The unit or guard the generation left as a stub.',
      '    DATA unit TYPE string READ-ONLY.',
      '    "! Raised where a body is still a stub, so an unfinished function never passes for a finished one. No counterpart in the original.',
      '    METHODS constructor IMPORTING unit TYPE string OPTIONAL previous LIKE previous OPTIONAL.',
      'ENDCLASS.',
      '',
      `CLASS ${cx} IMPLEMENTATION.`,
      '  METHOD constructor ##ADT_SUPPRESS_GENERATION.',
      '    super->constructor( previous = previous ).',
      '    me->unit = unit.',
      '  ENDMETHOD.',
      'ENDCLASS.',
      '',
    ].join('\n'),
  });
  // ---- the access layer (B4, rule 25): one method per SAP object the original reads, writes or calls
  if (hasAccess) {
    const signature = (p: AccessPoint) =>
      p.kind === 'read'
        ? `IMPORTING is_sel TYPE ${logic}=>ty_selection CHANGING ct_rows TYPE STANDARD TABLE`
        : p.kind === 'write'
          ? 'IMPORTING it_rows TYPE STANDARD TABLE'
          : `IMPORTING is_sel TYPE ${logic}=>ty_selection CHANGING cs_data TYPE any`;
    const verb = (p: AccessPoint) => (p.kind === 'read' ? 'Reads' : p.kind === 'write' ? 'Writes' : 'Calls');
    const anchor = (p: AccessPoint) => p.lines.map((l) => `L${l}`).join(', ');
    files.push({
      path: `src/${accessIf}.intf.abap`,
      owner: 'engine',
      content: [
        head,
        `"! Every SAP object ${plan.program ?? 'the program'} reads, writes or calls, behind one interface: the logic never calls SAP itself,`,
        '"! so ABAP Unit can replace this layer with a test double, and a released API can replace the original object in one place.',
        ...(access.more.length > 0 ? [`"! Not listed (more than ${access.points.length}): ${access.more.slice(0, 20).join(', ')}.`] : []),
        `INTERFACE ${accessIf} PUBLIC.`,
        ...access.points.flatMap((p) => [
          `  "! ${verb(p)} ${p.object} where the original does, ${anchor(p)}; a failure raises ${accessCx} instead of a return code.`,
          `  METHODS ${p.method} ${signature(p)} RAISING ${accessCx}.`,
        ]),
        'ENDINTERFACE.',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${accessCl}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! The default access layer of ${plan.program ?? 'the program'}: connect each method to an API SAP has released for ABAP Cloud.`,
        `CLASS ${accessCl} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        `    INTERFACES ${accessIf}.`,
        'ENDCLASS.',
        '',
        `CLASS ${accessCl} IMPLEMENTATION.`,
        '',
        ...access.points.flatMap((p) => [
          `  METHOD ${accessIf}~${p.method}.`,
          `    " ${OPEN_MARKER} ACCESS: the original ${verb(p).toLowerCase()} ${p.object} at ${anchor(p)}. Connect a released API here (Analyze names`,
          "    \" SAP's successor where its Cloudification Repository has one); until then this raises.",
          `    RAISE EXCEPTION NEW ${accessCx}( object = '${p.object}' ).`,
          '  ENDMETHOD.',
          '',
        ]),
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
    files.push({
      path: `src/${accessCx}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `CLASS ${accessCx} DEFINITION PUBLIC INHERITING FROM cx_static_check FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    "! The SAP object the access layer could not read, write or call.',
        '    DATA object TYPE string READ-ONLY.',
        '    "! A failed SAP access raises this instead of a return code nobody reads. No counterpart in the original.',
        '    METHODS constructor IMPORTING object TYPE string OPTIONAL previous LIKE previous OPTIONAL.',
        'ENDCLASS.',
        '',
        `CLASS ${accessCx} IMPLEMENTATION.`,
        '  METHOD constructor ##ADT_SUPPRESS_GENERATION.',
        '    super->constructor( previous = previous ).',
        '    me->object = object.',
        '  ENDMETHOD.',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
  }

  // ---- the Application Job (B3): where the unit plan says the original runs in the background
  // SAP's current sample (abap-cheat-sheets@d43eb13c 22_Released_ABAP_Classes.md) implements IF_APJ_RT_RUN, with the
  // parameters as public attributes. The scaffold implements IF_APJ_DT_EXEC_OBJECT and IF_APJ_RT_EXEC_OBJECT instead:
  // both are released in every Cloudification Repository release synced into lib/abap/generated/, IF_APJ_RT_RUN is
  // missing from the Private Cloud 2023 one — a package for that release would not activate.
  if (withJob) {
    const selection = plan.fields.filter((f) => f.where === 'selection');
    const unknownTypes = selection.filter((f) => !jobParameterType(f).known).map((f) => f.original);
    const defs = selection.map((f) => {
      const t = jobParameterType(f);
      return `      ( selname = '${f.original.slice(0, 8)}' kind = if_apj_dt_exec_object=>${f.kind === 'range' ? 'select_option' : 'parameter'} datatype = '${t.datatype}' length = ${t.length}${t.decimals ? ` decimals = ${t.decimals}` : ''} param_text = '${`${f.original} (L${f.line})`.replace(/'/g, "''")}' changeable_ind = abap_true${f.obligatory ? ' mandatory_ind = abap_true' : ''} )`;
    });
    const maps = selection.map((f) =>
      f.kind === 'range'
        ? `        WHEN '${f.original.slice(0, 8)}'.\n          APPEND VALUE #( sign = ls_par-sign option = ls_par-option low = ls_par-low high = ls_par-high ) TO ls_sel-${abapField(f)}.`
        : `        WHEN '${f.original.slice(0, 8)}'.\n          ls_sel-${abapField(f)} = ls_par-low.`,
    );
    const evidence = [...delivery.background, ...delivery.dialog].slice(0, 4).map((e) => `${e.what} L${e.line}`).join(', ');
    files.push({
      path: `src/${job}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! The Application Job of ${plan.program ?? 'the program'}: runs the process unattended, as the original did in the background${evidence ? ` (${evidence})` : ''}.`,
        '"! IF_APJ_DT_EXEC_OBJECT and IF_APJ_RT_EXEC_OBJECT are released in SAP\'s Cloudification Repository; their method signatures are',
        '"! not checked by Clean-Core.io - activate in ADT.',
        `CLASS ${job} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    INTERFACES if_apj_dt_exec_object.',
        '    INTERFACES if_apj_rt_exec_object.',
        'ENDCLASS.',
        '',
        `CLASS ${job} IMPLEMENTATION.`,
        '',
        '  METHOD if_apj_dt_exec_object~get_parameters.',
        `    " The original's selection inputs, one job parameter each.${unknownTypes.length > 0 ? ` ${OPEN_MARKER} JOB: check type and length of ${unknownTypes.join(', ')} against the original's declaration.` : ''}`,
        ...(defs.length > 0 ? ['    et_parameter_def = VALUE #(', ...defs, '    ).'] : ['    " The original has no selection input.', '    CLEAR et_parameter_def.']),
        '  ENDMETHOD.',
        '',
        '  METHOD if_apj_rt_exec_object~execute.',
        `    DATA(ls_sel) = VALUE ${logic}=>ty_selection( ).`,
        ...(maps.length > 0 ? ['    LOOP AT it_parameters INTO DATA(ls_par).', '      CASE ls_par-selname.', ...maps, '      ENDCASE.', '    ENDLOOP.'] : []),
        `    " Reads the records through the root view, so its access control applies to the job's user too.`,
        `    SELECT * FROM ${root} INTO TABLE @DATA(lt_rec).`,
        '    IF sy-subrc <> 0.',
        "      \" No record the job's user may read: nothing to process.",
        '      RETURN.',
        '    ENDIF.',
        `    DATA(ls_st) = VALUE ${logic}=>ty_state( records = CORRESPONDING #( lt_rec ) ).`,
        `    NEW ${logic}( )->run_steps( EXPORTING is_sel = ls_sel CHANGING cs_st = ls_st ).`,
        `    " ${OPEN_MARKER} JOB: keep what the original kept of a background run - write the results back (MODIFY ENTITIES) or to an`,
        '    " application log (CL_BALI_LOG, released).',
        '  ENDMETHOD.',
        '',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
    // SAP sample: abap-cheat-sheets@d43eb13c 22_Released_ABAP_Classes.md "Application Jobs" — typed constants of
    // CL_APJ_DT_CREATE_CONTENT, an existence check before each create, the long text of CX_APJ_DT_CONTENT. The sample
    // keeps catalog creation and the job in one class; the scaffold keeps the one-time setup apart from the job.
    const catalog = `Z${s.toUpperCase()}_JOB_CAT`;
    const template = `Z${s.toUpperCase()}_JOB_TMPL`;
    const jobText = `Job of ${plan.program ?? 'the program'}`.replace(/'/g, "''").slice(0, 60);
    files.push({
      path: `src/${jobSetup}.clas.abap`,
      owner: 'engine',
      content: [
        head,
        `"! Creates the job catalog entry ${catalog} and the job template ${template} for ${job.toUpperCase()}: run it once in ADT (F9).`,
        '"! CL_APJ_DT_CREATE_CONTENT is released in SAP\'s Cloudification Repository; its parameters are not checked by Clean-Core.io.',
        `CLASS ${jobSetup} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
        '  PUBLIC SECTION.',
        '    INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        '',
        `CLASS ${jobSetup} IMPLEMENTATION.`,
        '',
        '  METHOD if_oo_adt_classrun~main.',
        `    " ${OPEN_MARKER} JOB: name your transport request and package before you run this class.`,
        `    CONSTANTS lc_catalog TYPE cl_apj_dt_create_content=>ty_catalog_name VALUE '${catalog}'.`,
        `    CONSTANTS lc_template TYPE cl_apj_dt_create_content=>ty_template_name VALUE '${template}'.`,
        `    CONSTANTS lc_class TYPE cl_apj_dt_create_content=>ty_class_name VALUE '${job.toUpperCase()}'.`,
        `    CONSTANTS lc_text TYPE cl_apj_dt_create_content=>ty_text VALUE '${jobText}'.`,
        "    CONSTANTS lc_transport TYPE cl_apj_dt_create_content=>ty_transport_request VALUE ''.",
        "    CONSTANTS lc_package TYPE cl_apj_dt_create_content=>ty_package VALUE ''.",
        '    DATA(lo_dt) = cl_apj_dt_create_content=>get_instance( ).',
        '    TRY.',
        "        IF lo_dt->exists_job_cat_entry( lc_catalog ) <> 'Y'.",
        '          lo_dt->create_job_cat_entry( iv_catalog_name       = lc_catalog',
        '                                       iv_class_name         = lc_class',
        '                                       iv_text               = lc_text',
        '                                       iv_catalog_entry_type = cl_apj_dt_create_content=>class_based',
        '                                       iv_transport_request  = lc_transport',
        '                                       iv_package            = lc_package ).',
        '        ENDIF.',
        "        IF lo_dt->exists_job_template_entry( lc_template ) <> 'Y'.",
        '          lo_dt->create_job_template_entry( iv_template_name     = lc_template',
        '                                            iv_catalog_name      = lc_catalog',
        '                                            iv_text              = lc_text',
        '                                            iv_transport_request = lc_transport',
        '                                            iv_package           = lc_package ).',
        '        ENDIF.',
        "        out->write( |Job catalog entry { lc_catalog } and template { lc_template } are there.| ).",
        '      CATCH cx_apj_dt_content INTO DATA(lx_content).',
        '        out->write( lx_content->get_longtext( ) ).',
        '    ENDTRY.',
        '  ENDMETHOD.',
        '',
        'ENDCLASS.',
        '',
      ].join('\n'),
    });
  }

  if (withService) files.push({ path: `src/${srvd}.srvd.srvdsrv`, owner: 'engine', content: [`@EndUserText.label: 'Service of ${plan.program ?? 'the program'}'`, `define service ${srvd.toUpperCase()} {`, `  expose ${proj.toUpperCase()} as Records;`, '}', ''].join('\n') });

  // ---- ABAP Unit: one test method per engine case
  const testDefs: string[] = [];
  const testImpls: string[] = [];
  const packedByName = new Map(plan.fields.filter((f) => f.kind === 'packed').map((f) => [f.original, f]));
  for (const c of cases.cases) {
    const m = c.id.toLowerCase();
    testDefs.push(`    METHODS ${m} FOR TESTING.`);
    testImpls.push(`  METHOD ${m}.`, `    " ${c.name.replace(/"/g, "'")}`);
    let written = false;
    let variable = 0;
    for (const e of c.engineCase.examples) {
      testImpls.push(`    " given/when: ${e.input.replace(/"/g, "'").slice(0, 200)}`, `    " then: ${e.expected.replace(/"/g, "'").slice(0, 200)}`);
      const call = e.call;
      if (call?.op === 'compute' && call.compute && call.expect.kind === 'equals') {
        const f = packedByName.get(call.compute.field) ?? packedByName.get(call.compute.field.split('-').pop() ?? '');
        if (!f) continue;
        const type = abapType(f);
        const name = `lv_value_${++variable}`;
        testImpls.push(`    DATA ${name} TYPE ${type}.`);
        testImpls.push(`    ${name} = '${call.compute.start}'.`);
        for (const step of call.compute.steps) testImpls.push(`    ${name} = ${name} ${step.op} '${step.b}'.`);
        testImpls.push(`    DATA ${name}_exp TYPE ${type}.`, `    ${name}_exp = '${call.expect.value}'.`);
        testImpls.push(`    cl_abap_unit_assert=>assert_equals( act = ${name} exp = ${name}_exp ).`);
        written = true;
      }
    }
    if (!written) testImpls.push(`    cl_abap_unit_assert=>skip( msg = '${c.id}: runs through the call contract; the ABAP when-line follows the logic class' ).`);
    testImpls.push('  ENDMETHOD.', '');
  }
  files.push({
    path: `src/${logic}.clas.testclasses.abap`,
    owner: 'engine',
    content: [
      head,
      ...(hasAccess
        ? [
            `"! A test double of the access layer: pass NEW ltd_access( ) to the constructor of ${logic} and the logic runs without SAP.`,
            'CLASS ltd_access DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
            '  PUBLIC SECTION.',
            `    INTERFACES ${accessIf} PARTIALLY IMPLEMENTED.`,
            'ENDCLASS.',
            '',
            'CLASS ltd_access IMPLEMENTATION.',
            'ENDCLASS.',
            '',
          ]
        : []),
      '"! Engine cases of the original (TC_ENG_*), derived by Clean-Core.io — not by a model.',
      'CLASS ltc_engine_cases DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
      '  PRIVATE SECTION.',
      ...testDefs,
      'ENDCLASS.',
      '',
      'CLASS ltc_engine_cases IMPLEMENTATION.',
      '',
      ...testImpls,
      'ENDCLASS.',
      '',
    ].join('\n'),
  });
  // ---- abapGit metadata (abapgit-files.ts): one file per object, so abapGit imports the package as it is.
  // abapGit would not create an object whose metadata file is missing; the formats check fails such a package.
  const program = plan.program ?? 'the program';
  const meta: ScaffoldFile[] = [
    { path: '.abapgit.xml', owner: 'engine', content: abapGitRepoSettingsXml() },
    { path: 'src/package.devc.xml', owner: 'engine', content: devcXml(`Clean-Core.io: ${program}`) },
    { path: `src/${root}.ddls.xml`, owner: 'engine', content: ddlsXml(root, `Root view of ${program}`, 'W') },
    { path: `src/${proj}.ddls.xml`, owner: 'engine', content: ddlsXml(proj, `Projection of ${program}`, 'P') },
    { path: `src/${root}.dcls.xml`, owner: 'engine', content: dclsXml(root, `Access to the records of ${program}`) },
    { path: `src/${proj}.dcls.xml`, owner: 'engine', content: dclsXml(proj, `Access to the projection of ${program}`) },
    { path: `src/${root}.bdef.xml`, owner: 'engine', content: bdefXml(root, `Behavior of the records of ${program}`) },
    { path: `src/${logic}.clas.xml`, owner: 'engine', content: clasXml({ name: logic, description: `Logic of ${program}`, withUnitTests: true }) },
    { path: `src/${pool}.clas.xml`, owner: 'engine', content: clasXml({ name: pool, description: `Behavior implementation for ${root.toUpperCase()}`, category: '06', behaviorFor: root }) },
    { path: `src/${cx}.clas.xml`, owner: 'engine', content: clasXml({ name: cx, description: `A stub of ${program} that is not filled yet`, category: '40' }) },
    ...(hasAccess
      ? [
          { path: `src/${accessIf}.intf.xml`, owner: 'engine' as const, content: intfXml(accessIf, `SAP access of ${program}`) },
          { path: `src/${accessCl}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: accessCl, description: `Default SAP access of ${program}` }) },
          { path: `src/${accessCx}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: accessCx, description: `A failed SAP access of ${program}`, category: '40' }) },
        ]
      : []),
    ...(withJob
      ? [
          { path: `src/${job}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: job, description: `Application Job of ${program}` }) },
          { path: `src/${jobSetup}.clas.xml`, owner: 'engine' as const, content: clasXml({ name: jobSetup, description: `Job catalog entry and template of ${program}` }) },
        ]
      : []),
    ...(withService
      ? [
          { path: `src/${srvd}.srvd.xml`, owner: 'engine' as const, content: srvdXml(srvd, `Service of ${program}`) },
          { path: `src/${srvb}.srvb.xml`, owner: 'engine' as const, content: srvbXml(srvb, `OData V4 UI service of ${program}`, srvd) },
        ]
      : []),
  ];
  files.push(...meta);

  for (const file of files) file.content = defuseMarkers(file.content);
  const required: Record<string, RequiredGuard[]> = {};
  for (const u of plan.units) if (u.bodyCalls.length > 0) required[u.id] = requiredGuardsOf(u, plan, 'rap');
  return { track: 'rap', version: SCAFFOLD_VERSION, files, units: plan.units, regions: findRegions(files), digest: scaffoldDigest(files), adapter: null, notCarried: plan.notCarried, available, required };
}
