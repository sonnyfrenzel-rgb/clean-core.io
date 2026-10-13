/**
 * The abapGit metadata files of the RAP package (roadmap 3.0.12, owner 13.10.2026):
 * one `<name>.<type>.xml` per object and the repository settings `.abapgit.xml`,
 * so a customer can import the package with abapGit as it is.
 *
 * Why abapGit XML and not SAP's ABAP file formats (AFF JSON): abapGit reads AFF
 * only for the object types its AFF registry lists
 * (abapGit/abapGit@37f226f4 src/objects/aff/zcl_abapgit_aff_registry.clas.abap
 * `initialize_registry_table`). Of the types this package writes, INTF is listed
 * as experimental (only behind the "AFF" feature switch), and TABL, DDLS, DCLS,
 * BDEF, SRVD, SRVB and CLAS are not listed at all — their serializers
 * (src/objects/zcl_abapgit_object_<type>.clas.abap, tabl/…) read and write XML.
 * An object carrying both formats is an error to abaplint (`aff_and_xml`).
 *
 * Every element written here is one abapGit's serializer writes — copied from
 * files abapGit serialized in SAP's own sample repositories, never invented:
 *
 *   - SAP-samples/abap-platform-refscen-flight@93f76917 (branch
 *     ABAP-platform-cloud): src/colldraft/#dmo#a_travel_cd.tabl.xml,
 *     #dmo#r_traveltp_cd.ddls.xml, #dmo#c_traveltp_cd.ddls.xml,
 *     #dmo#r_traveltp_cd.dcls.xml, #dmo#r_traveltp_cd.bdef.xml,
 *     #dmo#ui_travel_o4_cd.srvd.xml, #dmo#bp_r_traveltp_cd.clas.xml;
 *     src/reuse/agency/#dmo#i_agencytp.bdef.xml (ABAP_LANGU_VERSION 5);
 *     src/legacy/#dmo#flight_legacy.srvb.xml (an unpublished OData V4 binding);
 *     src/legacy/#dmo#if_flight_legacy.intf.xml; src/draft/#dmo#bp_bookingsupplement_d.clas.xml
 *     (WITH_UNIT_TESTS, UNICODE 5); src/hierarchy/draft/#dmo#cx_hierarchy.clas.xml (CATEGORY 40);
 *     src/reuse/carrier/#dmo#d_carr_lock.tabl.xml (a DEC field);
 *   - SAP-samples/abap-cheat-sheets@d43eb13c: src/zdemo_abap_fli.tabl.xml (NUMC, DATS),
 *     src/zdemo_abap_draft.tabl.xml (INT4, CHAR), src/zdemo_abap_tab2.tabl.xml (INT8),
 *     src/package.devc.xml.
 *
 * The wrapper `<abapGit version="v1.0.0" serializer="LCL_OBJECT_<TYPE>"
 * serializer_version="v1.0.0">` is what abapGit's XML reader checks first: it
 * raises "abapGit element not found" without it and a version mismatch for
 * any abapGit version but `v1.0.0` (abapGit/abapGit@37f226f4 src/xml/zcl_abapgit_xml.clas.abap
 * `parse`; zif_abapgit_version `c_xml_version`). The serializer name is the
 * class name with ZCL_ABAPGIT replaced by LCL (zcl_abapgit_objects_super `get_metadata`).
 *
 * ABAP language version: the repository leaves it undefined ("Any", every SAP
 * sample above does), and the source-based objects whose serializer output in
 * those samples carries it say ABAP for Cloud Development (`5`): CLAS and INTF
 * (`UNICODE`), BDEF and SRVB (`ABAP_LANGU_VERSION`). For TABL, DDLS, DCLS and
 * SRVD no sample shows the field, so none is written and the object takes what
 * the target package and system set (docs.abapgit.org@ea7c1124
 * src/user-guide/reference/abap-language-version.md).
 *
 * Pure, no imports.
 */

export const ABAPGIT_REFS = {
  abapGit: 'abapGit/abapGit@37f226f425d743aa20aad5549b7b2ac56c514b08',
  docs: 'abapGit/docs.abapgit.org@ea7c112482cb00bf2258aa16bba27fa35b61edb2',
  flight: 'SAP-samples/abap-platform-refscen-flight@93f769170fa0b41591c3a4d39284f353cd90799e',
  cheatSheets: 'SAP-samples/abap-cheat-sheets@d43eb13c4c7c17599f5709a0314bca257b283137',
} as const;

/** abapGit's XML files start with a UTF-8 byte order mark (every serialized sample does; abaplint rule `xml_bom`). */
export const XML_BOM = '﻿';

/** Description length of every object type here: `header.description` maxLength 60 in each AFF schema, DDTEXT/DESCRIPT CHAR 60. */
export const DESCRIPTION_MAX = 60;

/** The longest object name each type allows (abaplint `getAllowedNaming`, @abaplint/core 2.120): a transparent table 16, a binding 26. */
export const NAME_MAX: Readonly<Record<string, number>> = { TABL: 16, SRVB: 26, CLAS: 30, INTF: 30, BDEF: 30, SRVD: 30, DDLS: 30, DCLS: 30 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A description within 60 characters, on one line. */
export function abapDescription(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= DESCRIPTION_MAX ? one : `${one.slice(0, DESCRIPTION_MAX - 3).trimEnd()}...`;
}

type Node = [tag: string, value: string | Node[]];

function render(nodes: readonly Node[], depth: number): string[] {
  const pad = ' '.repeat(depth);
  return nodes.flatMap(([tag, value]) => (typeof value === 'string' ? [`${pad}<${tag}>${esc(value)}</${tag}>`] : [`${pad}<${tag}>`, ...render(value, depth + 1), `${pad}</${tag}>`]));
}

/** One object's metadata file in the shape abapGit's serializer writes it. */
function objectXml(type: string, values: readonly Node[]): string {
  return [
    `${XML_BOM}<?xml version="1.0" encoding="utf-8"?>`,
    `<abapGit version="v1.0.0" serializer="LCL_OBJECT_${type}" serializer_version="v1.0.0">`,
    ' <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">',
    '  <asx:values>',
    ...render(values, 3),
    '  </asx:values>',
    ' </asx:abap>',
    '</abapGit>',
    '',
  ].join('\n');
}

/** The files a package's repository settings tell abapGit to leave alone (the delivery's own documents). */
export const ABAPGIT_IGNORE: readonly string[] = ['/README.md', '/STATUS.md', '/manifest.json', '/abaplint.json', '/docs/'];

/**
 * `.abapgit.xml`: main language English, the sources under `/src/`, folder
 * logic PREFIX (the package the reader links the repository to takes every
 * object of `/src/`). No `<abapGit>` wrapper — the repository settings are not
 * an object (abapGit/abapGit@37f226f4 `.abapgit.xml`; fields:
 * src/repo/zif_abapgit_dot_abapgit.intf.abap `ty_dot_abapgit`).
 */
export function abapGitRepoSettingsXml(ignore: readonly string[] = ABAPGIT_IGNORE): string {
  return [
    `${XML_BOM}<?xml version="1.0" encoding="utf-8"?>`,
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">',
    ' <asx:values>',
    '  <DATA>',
    '   <MASTER_LANGUAGE>E</MASTER_LANGUAGE>',
    '   <STARTING_FOLDER>/src/</STARTING_FOLDER>',
    '   <FOLDER_LOGIC>PREFIX</FOLDER_LOGIC>',
    ...(ignore.length ? ['   <IGNORE>', ...ignore.map((i) => `    <item>${esc(i)}</item>`), '   </IGNORE>'] : []),
    '  </DATA>',
    ' </asx:values>',
    '</asx:abap>',
    '',
  ].join('\n');
}

/** `package.devc.xml` of the root folder: the package's description only (abap-cheat-sheets src/package.devc.xml). */
export function devcXml(description: string): string {
  return objectXml('DEVC', [['DEVC', [['CTEXT', abapDescription(description)]]]]);
}

export interface ClassMeta {
  name: string;
  description: string;
  /** `06` a behavior pool (with `behaviorFor`), `40` an exception class; none for an ordinary class. */
  category?: '06' | '40';
  behaviorFor?: string;
  withUnitTests?: boolean;
}

/** `<name>.clas.xml` (VSEOCLASS). */
export function clasXml(c: ClassMeta): string {
  const fields: Node[] = [
    ['CLSNAME', c.name.toUpperCase()],
    ['LANGU', 'E'],
    ['DESCRIPT', abapDescription(c.description)],
    ...(c.category ? ([['CATEGORY', c.category]] as Node[]) : []),
    ['STATE', '1'],
    ['CLSCCINCL', 'X'],
    ['FIXPT', 'X'],
    ['UNICODE', '5'],
    ...(c.behaviorFor ? ([['CLSDEFINT', c.behaviorFor.toUpperCase()]] as Node[]) : []),
    ...(c.withUnitTests ? ([['WITH_UNIT_TESTS', 'X']] as Node[]) : []),
  ];
  return objectXml('CLAS', [['VSEOCLASS', fields]]);
}

/** `<name>.intf.xml` (VSEOINTERF), exposure public. */
export function intfXml(name: string, description: string): string {
  return objectXml('INTF', [
    [
      'VSEOINTERF',
      [
        ['CLSNAME', name.toUpperCase()],
        ['LANGU', 'E'],
        ['DESCRIPT', abapDescription(description)],
        ['EXPOSURE', '2'],
        ['STATE', '1'],
        ['UNICODE', '5'],
      ],
    ],
  ]);
}

/** `<name>.ddls.xml`; SOURCE_TYPE `W` a view entity, `P` a projection view. */
export function ddlsXml(name: string, description: string, sourceType: 'W' | 'P'): string {
  return objectXml('DDLS', [
    [
      'DDLS',
      [
        ['DDLNAME', name.toUpperCase()],
        ['DDLANGUAGE', 'E'],
        ['DDTEXT', abapDescription(description)],
        ['SOURCE_TYPE', sourceType],
      ],
    ],
  ]);
}

/** `<name>.dcls.xml`. */
export function dclsXml(name: string, description: string): string {
  return objectXml('DCLS', [
    [
      'DCLS',
      [
        ['DCLNAME', name.toUpperCase()],
        ['DCLLANGUAGE', 'E'],
        ['DDTEXT', abapDescription(description)],
      ],
    ],
  ]);
}

/** ADT's URI segment of a name: lower case, a namespace's slashes encoded (`./%2Fdmo%2Fr_traveltp_cd/source/main`). */
const adtName = (name: string) => name.toLowerCase().replace(/\//g, '%2F');

/** `<name>.bdef.xml`. */
export function bdefXml(name: string, description: string): string {
  return objectXml('BDEF', [
    [
      'BDEF',
      [
        ['NAME', name.toUpperCase()],
        ['TYPE', 'BDEF/BDO'],
        ['DESCRIPTION', abapDescription(description)],
        ['DESCRIPTION_TEXT_LIMIT', String(DESCRIPTION_MAX)],
        ['LANGUAGE', 'EN'],
        ['MASTER_LANGUAGE', 'EN'],
        ['ABAP_LANGU_VERSION', '5'],
        ['SOURCE_URI', `./${adtName(name)}/source/main`],
        ['SOURCE_TYPE', 'ABAP_SOURCE'],
        ['SOURCE_FIXED_POINT_ARITHMETIC', 'true'],
        ['SOURCE_UNICODE_CHECKS_ACTIVE', 'true'],
      ],
    ],
  ]);
}

/** `<name>.srvd.xml`. abapGit refuses one without DESCRIPTION, or without a two-letter LANGUAGE and MASTER_LANGUAGE (zcl_abapgit_object_srvd `get_object_data`). */
export function srvdXml(name: string, description: string): string {
  return objectXml('SRVD', [
    [
      'SRVD',
      [
        ['NAME', name.toUpperCase()],
        ['TYPE', 'SRVD/SRV'],
        ['DESCRIPTION', abapDescription(description)],
        ['LANGUAGE', 'EN'],
        ['MASTER_LANGUAGE', 'EN'],
        ['SOURCE_URI', `./${adtName(name)}/source/main`],
        ['SOURCE_TYPE', 'ABAP_SOURCE'],
        ['SOURCE_ORIGIN_DESCRIPTION', 'ABAP Development Tools'],
        ['SRVD_SOURCE_TYPE', 'S'],
        ['SRVD_SOURCE_TYPE_DESC', 'Definition'],
      ],
    ],
  ]);
}

/**
 * `<name>.srvb.xml`: an OData V4 UI binding of one service definition, not
 * published — the reader publishes it in ADT once the access control grants
 * something (an unpublished binding carries no PUBLISHED/ALLOWED_ACTION; abapGit
 * publishes on import only when PUBLISHED is true, zcl_abapgit_object_srvb `publish`).
 */
export function srvbXml(name: string, description: string, serviceDefinition: string): string {
  return objectXml('SRVB', [
    [
      'SRVB',
      [
        [
          'METADATA',
          [
            ['NAME', name.toUpperCase()],
            ['TYPE', 'SRVB/SVB'],
            ['DESCRIPTION', abapDescription(description)],
            ['LANGUAGE', 'EN'],
            ['MASTER_LANGUAGE', 'EN'],
            ['ABAP_LANGU_VERSION', '5'],
          ],
        ],
        [
          'CONTENT',
          [
            ['BIND_TYPE_IMPL', [['NAME', name.toUpperCase()]]],
            ['BIND_TYPE', 'ODATA'],
            ['BIND_TYPE_VERSION', 'V4'],
            [
              'SERVICES',
              [
                [
                  'item',
                  [
                    ['SERVICE_NAME', name.toUpperCase()],
                    [
                      'SERVICE_CONTENT',
                      [
                        [
                          'item',
                          [
                            ['SERVICE_VERSION', '0001'],
                            ['RELEASE_STATE', 'NOT_RELEASED'],
                            [
                              'SRVD_REF',
                              [
                                ['URI', `/sap/bc/adt/ddic/srvd/sources/${serviceDefinition.toLowerCase().replace(/\//g, '%2f')}`],
                                ['TYPE', 'SRVD/SRV'],
                                ['NAME', serviceDefinition.toUpperCase()],
                              ],
                            ],
                            ['BIND_TYPE_DATA', [['CONTENT', [['ENCODING', 'base64']]]]],
                          ],
                        ],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
        ],
        ['CONTRACT', 'C1'],
        ['RELEASE_SUPPORTED', 'true'],
        ['BINDING_CREATED', 'true'],
      ],
    ],
  ]);
}

/** One field of a table: a built-in type, or a data element. */
export type TableField =
  | { name: string; key?: boolean; notNull?: boolean; builtin: 'CLNT' | 'CHAR' | 'NUMC' | 'DATS' | 'INT4' | 'INT8' | 'DEC'; length?: number; decimals?: number }
  | { name: string; key?: boolean; notNull?: boolean; dataElement: string };

const n6 = (n: number) => String(n).padStart(6, '0');

/**
 * The internal type and length abapGit writes for a built-in field, as in the
 * samples: CLNT C/6 len 3; CHAR C/2n; NUMC N/2n; DATS D/16 len 8; INT4 X/4 len 10;
 * INT8 8/8 len 19; DEC P/⌈(n+1)/2⌉ with its decimals.
 */
function builtinFields(f: Extract<TableField, { builtin: string }>): Node[] {
  const len = f.length ?? 0;
  switch (f.builtin) {
    case 'CLNT':
      return [['INTTYPE', 'C'], ['INTLEN', n6(6)], ...notNull(f), ['DATATYPE', 'CLNT'], ['LENG', n6(3)], ['MASK', '  CLNT']];
    case 'CHAR':
      return [['INTTYPE', 'C'], ['INTLEN', n6(2 * len)], ...notNull(f), ['DATATYPE', 'CHAR'], ['LENG', n6(len)], ['MASK', '  CHAR']];
    case 'NUMC':
      return [['INTTYPE', 'N'], ['INTLEN', n6(2 * len)], ...notNull(f), ['DATATYPE', 'NUMC'], ['LENG', n6(len)], ['MASK', '  NUMC']];
    case 'DATS':
      return [['INTTYPE', 'D'], ['INTLEN', n6(16)], ...notNull(f), ['DATATYPE', 'DATS'], ['LENG', n6(8)], ['MASK', '  DATS']];
    case 'INT4':
      return [['INTTYPE', 'X'], ['INTLEN', n6(4)], ...notNull(f), ['DATATYPE', 'INT4'], ['LENG', n6(10)], ['MASK', '  INT4']];
    case 'INT8':
      return [['INTTYPE', '8'], ['INTLEN', n6(8)], ...notNull(f), ['DATATYPE', 'INT8'], ['LENG', n6(19)], ['MASK', '  INT8']];
    case 'DEC':
      return [
        ['INTTYPE', 'P'],
        ['INTLEN', n6(Math.ceil((len + 1) / 2))],
        ...notNull(f),
        ['DATATYPE', 'DEC'],
        ['LENG', n6(len)],
        ...(f.decimals ? ([['DECIMALS', n6(f.decimals)]] as Node[]) : []),
        ['MASK', '  DEC'],
      ];
  }
}

function notNull(f: TableField): Node[] {
  return f.notNull ? [['NOTNULL', 'X']] : [];
}

function fieldNode(f: TableField): Node {
  const head: Node[] = [['FIELDNAME', f.name.toUpperCase()], ...(f.key ? ([['KEYFLAG', 'X']] as Node[]) : [])];
  if ('dataElement' in f) return ['DD03P', [...head, ['ROLLNAME', f.dataElement.toUpperCase()], ['ADMINFIELD', '0'], ...notNull(f), ['COMPTYPE', 'E']]];
  return ['DD03P', [...head, ['ADMINFIELD', '0'], ...builtinFields(f)]];
}

/**
 * `<name>.tabl.xml`: a client-dependent transparent table, delivery class A,
 * not extensible (EXCLASS 1), size category 0, data class APPL0, buffering not
 * allowed — the settings of the samples' RAP persistence tables
 * (#dmo#a_travel_cd.tabl.xml). abapGit has no source form for a table: the
 * XML is the whole object (zcl_abapgit_object_tabl → lcl_tabl_xml `add`).
 */
export function tablXml(name: string, description: string, fields: readonly TableField[]): string {
  const tab = name.toUpperCase();
  return objectXml('TABL', [
    [
      'DD02V',
      [
        ['TABNAME', tab],
        ['DDLANGUAGE', 'E'],
        ['TABCLASS', 'TRANSP'],
        ['CLIDEP', 'X'],
        ['DDTEXT', abapDescription(description)],
        ['MASTERLANG', 'E'],
        ['CONTFLAG', 'A'],
        ['EXCLASS', '1'],
      ],
    ],
    [
      'DD09L',
      [
        ['TABNAME', tab],
        ['AS4LOCAL', 'A'],
        ['TABKAT', '0'],
        ['TABART', 'APPL0'],
        ['BUFALLOW', 'N'],
      ],
    ],
    ['DD03P_TABLE', fields.map(fieldNode)],
  ]);
}
