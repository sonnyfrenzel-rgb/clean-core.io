import type { PlainTerm } from './plain-glossary';

/**
 * The dictionary of the Business view (concept "Business-Lesbarkeit" H5, owner decision 06.11.2026) — read from
 * engine 3.1.0 (`ENGINE_READS_310_FROM`) only, on top of `plain-glossary.ts`, which every engine reads and which
 * this module never overrides.
 *
 * Where each word comes from is part of the entry (`source`):
 *
 *   - `sap-standard` — the common name of an SAP standard table, field, function module, transaction or
 *     authorization object, as SAP practitioners use it, written down by hand and conservatively (owner decision
 *     06.11.2026). Not read from help.sap.com, api.sap.com or the Fiori library — their terms forbid automated access —
 *     and not chosen from the gaps of the process benchmark: the lists follow SAP's modules (SD, MM, FI, CO, PP, PM, QM,
 *     WM, HR, cross-application), not the programs the benchmark happens to contain.
 *   - `sap-domain` — a fixed value SAP defines once for every system (a status domain), never a value a customer
 *     configures (a document type, an order type, a payment method).
 *   - `abap-naming` — an abbreviation ABAP developers commonly use inside a variable name (`hdr`, `itm`, `idx`); applied
 *     word by word to a variable's stem, never to a database table or field.
 *
 * The customer's own texts — the comments next to the code, the message texts — are the second source (owner decision
 * 06.11.2026, H4). They are read where the code stands (`plain-language.ts`), never added here, and they are tagged
 * "Author's comment" wherever they are shown.
 *
 * A word here says what the table or field is called in the SAP standard; it does not say what a customer uses it for.
 * The Business view says so where it matters ("The code does not say what this check means (field PROFL).").
 *
 * No imports but a type: pure data, readable by a client component.
 */

export type DictionarySource = 'sap-standard' | 'sap-domain' | 'abap-naming';

export interface DictionaryTerm extends PlainTerm {
  source: DictionarySource;
}

/** What each source means, for the documentation and for a reader who asks where a word comes from. */
export const DICTIONARY_SOURCES: Readonly<Record<DictionarySource, string>> = Object.freeze({
  'sap-standard': 'The common name of an SAP standard object, curated by hand (Clean-Core.io dictionary)',
  'sap-domain': 'A fixed value SAP defines for every system, curated by hand (Clean-Core.io dictionary)',
  'abap-naming': 'A common abbreviation in ABAP variable names, curated by hand (Clean-Core.io dictionary)',
});

const sap = (singular: string, plural?: string, short?: string): DictionaryTerm => ({
  singular, plural: plural ?? `${singular}s`, ...(short ? { short } : {}), source: 'sap-standard',
});
/** A word that does not inflect (data, stock, status …). */
const sapSame = (word: string, short?: string): DictionaryTerm => ({ singular: word, plural: word, ...(short ? { short } : {}), source: 'sap-standard' });

/** SAP standard database tables → the business object one row of them is. Keys lower case. */
export const SAP_TABLES: Readonly<Record<string, DictionaryTerm>> = Object.freeze({
  // --- Sales and distribution ---
  tvak: sap('Sales document type'), tvap: sap('Sales item category', 'Sales item categories'), tvlk: sap('Delivery type'),
  tvfk: sap('Billing type'), tvst: sap('Shipping point'), tvtw: sap('Distribution channel'), tspa: sap('Division'),
  tvkbz: sap('Sales office assignment'), tvsb: sap('Shipping condition'),
  knvh: sap('Customer hierarchy entry', 'Customer hierarchy entries'), knvi: sapSame('Customer tax data'),
  knmt: sap('Customer-material info record'), knbk: sapSame('Customer bank details'),
  konh: sap('Condition header'), konp: sap('Condition item'),
  vekp: sap('Handling unit'), vepo: sap('Handling unit item'), vtts: sap('Shipment stage'),
  mvke: sapSame('Material sales data'), mlan: sapSame('Material tax data'), veda: sapSame('Contract data'),
  vbka: sap('Sales activity', 'Sales activities'), vbuv: sap('Incompletion log entry', 'Incompletion log entries'),
  vakpa: sap('Sales order by partner', 'Sales orders by partner'), vapma: sap('Sales order by material', 'Sales orders by material'),
  vbsk: sap('Collective processing run'), vbss: sap('Collective processing document'),
  // --- Materials management and inventory ---
  marm: sap('Unit of measure conversion'), mean: sap('Material GTIN', 'Material GTINs'), mlgn: sapSame('Material warehouse data'),
  mlgt: sapSame('Material storage type data'), mchb: sapSame('Batch stock'), msku: sapSame('Customer consignment stock'),
  mslb: sapSame('Stock at supplier'), mska: sapSame('Sales order stock'), mardh: sapSame('Storage location stock history'),
  marv: sapSame('Material period control'), mver: sapSame('Material consumption'), t134: sap('Material type'),
  t023: sap('Material group'), t001k: sap('Valuation area'), t156: sap('Movement type'),
  ekbe: sapSame('Purchase order history'), ekkn: sap('Purchase order account assignment'), ekes: sap('Supplier confirmation'),
  ebkn: sap('Requisition account assignment'), eord: sap('Source list entry', 'Source list entries'),
  eipa: sapSame('Info record price history'), lfbk: sapSame('Supplier bank details'), lfb5: sapSame('Supplier dunning data'),
  lfm2: sapSame('Supplier purchasing data'), rbkp: sap('Supplier invoice'), rseg: sap('Supplier invoice item'),
  t161: sap('Purchasing document type'), t024d: sap('MRP controller'), rkpf: sap('Reservation'),
  ikpf: sap('Physical inventory document'), iseg: sap('Physical inventory item'), mkol: sapSame('Supplier consignment stock'),
  // --- Warehouse management ---
  lein: sap('Storage unit'), t300: sap('Warehouse number'), t301: sap('Storage type'), ltbk: sap('Transfer requirement'),
  ltbp: sap('Transfer requirement item'),
  // --- Financial accounting ---
  faglflexa: sap('G/L line item'), faglflext: sapSame('G/L account totals'), glt0: sapSame('G/L account totals'),
  knc1: sapSame('Customer totals'), lfc1: sapSame('Supplier totals'), bset: sapSame('Document tax data'),
  bsec: sapSame('One-time account data'), t003: sap('Accounting document type'), t030: sapSame('Account determination'),
  t001b: sap('Open posting period'), t052: sapSame('Payment terms'), t012: sap('House bank'), t012k: sap('House bank account'),
  reguh: sap('Payment run payment'), regup: sap('Payment run item'), reguv: sapSame('Payment run control data'),
  payr: sapSame('Check register'), febko: sap('Bank statement'), febep: sap('Bank statement item'),
  t005: sap('Country', 'Countries'), t005t: sap('Country name'), t005s: sap('Region'), tcurc: sap('Currency code'),
  tcurt: sap('Currency name'), tcurf: sap('Currency conversion factor'), t009: sap('Fiscal year variant'),
  bnka: sapSame('Bank master data'), mhnk: sapSame('Dunning data'), mhnd: sap('Dunned item'),
  anlb: sapSame('Asset depreciation terms'), anek: sap('Asset document'), t007a: sap('Tax code'), t007s: sap('Tax code text'),
  skat: sap('G/L account name'), cepct: sap('Profit center text'), t880: sap('Trading partner'), t001a: sapSame('Company code currency data'),
  bsip: sap('Supplier document index entry', 'Supplier document index entries'), vbsegs: sap('Parked G/L item'),
  vbkpf: sap('Parked document'), t042: sapSame('Payment program settings'),
  // --- Contract accounting, real estate, funds management, treasury ---
  dfkkop: sap('Contract accounting item'), dfkkko: sap('Contract accounting document'), fkkvkp: sap('Contract account'),
  vicncn: sap('Real estate contract'), vicdcond: sap('Real estate condition'), vibdbe: sap('Business entity', 'Business entities'),
  vibdro: sap('Rental object'), fmci: sap('Commitment item'), fmfctr: sap('Funds center'), vtbfha: sap('Financial transaction'),
  vtbfhapo: sap('Financial transaction flow'),
  // --- Controlling and projects ---
  csla: sap('Activity type'), cssl: sap('Cost center activity type'), keko: sap('Product cost estimate'),
  keph: sap('Cost component'), ckis: sap('Costing item'), prps: sap('WBS element'), proj: sap('Project definition'),
  jsto: sap('Status object'), tj02t: sap('System status text'), tj30t: sap('User status text'),
  coas: sap('Internal order'), cosb: sapSame('Results analysis totals'),
  // --- Production planning ---
  afvv: sapSame('Operation quantities and dates'), afru: sap('Order confirmation'), affl: sap('Order sequence'),
  mast: sap('Material BOM link'), stas: sap('BOM item selection'), plpo: sap('Routing operation'), plas: sap('Routing selection'),
  mapl: sap('Material routing link'), crtx: sap('Work center text'), plaf: sap('Planned order'),
  pbim: sap('Planned independent requirement'), pbed: sap('Independent requirement schedule'),
  // --- Plant maintenance and customer service ---
  equz: sap('Equipment time segment'), eqkt: sap('Equipment text'), iloa: sapSame('Location data'),
  iflotx: sap('Functional location text'), qmfe: sap('Notification item'), qmur: sap('Notification cause'),
  qmsm: sap('Notification task'), qmma: sap('Notification activity', 'Notification activities'), mpla: sap('Maintenance plan'),
  mpos: sap('Maintenance item'), mhis: sapSame('Maintenance plan history'), objk: sap('Object list entry', 'Object list entries'),
  qmih: sapSame('Notification maintenance data'), viqmel: sap('Notification'), viaufks: sap('Maintenance order'),
  // --- Quality management ---
  qave: sap('Usage decision'), qamr: sap('Inspection result'), qamv: sap('Inspection characteristic'), qase: sap('Sample result'),
  qmat: sap('Material inspection setting'),
  // --- Human resources ---
  pa0003: sapSame('Payroll status'), pa0006: sap('Employee address', 'Employee addresses'), pa0007: sapSame('Planned working time'),
  pa0009: sapSame('Employee bank details'), pa0014: sap('Recurring payment'), pa0015: sap('Additional payment'),
  pa0041: sapSame('Date specifications'), pa2001: sap('Absence', 'Absences'), pa2002: sap('Attendance', 'Attendances'),
  pa2005: sapSame('Overtime'), pa2006: sap('Absence quota'), pa2010: sapSame('Employee remuneration info'),
  hrp1000: sap('Organizational object'), hrp1001: sap('Organizational relationship'), t500p: sap('Personnel area'),
  t501: sap('Employee group'), t503: sap('Employee subgroup'), t512t: sap('Wage type text'),
  pcl1: sapSame('HR cluster data'), pcl2: sapSame('Payroll results'), catsdb: sap('Timesheet entry', 'Timesheet entries'),
  ptrv_head: sap('Business trip'), ptrv_srec: sap('Trip receipt'),
  // --- Utilities ---
  eabl: sap('Meter reading'), eablg: sap('Meter reading reason'), ever: sap('Utility contract'), eanl: sap('Utility installation'),
  erch: sap('Utility billing document'),
  // --- Cross-application ---
  usr21: sap('User address key'), tstc: sap('Transaction code'), tstct: sap('Transaction text'), trdir: sap('Program attribute'),
  tadir: sap('Repository object'), dd02l: sap('Table definition'), dd03l: sap('Table field'), tbtcp: sap('Background job step'),
  edids: sap('IDoc status record'), edp13: sap('Outbound partner profile'), edp21: sap('Inbound partner profile'),
  stxh: sap('Text header'), stxl: sap('Text line'), toa01: sap('Archive link'), srgbtbrel: sap('Attachment link'),
  sood: sap('Office document'), adrp: sap('Person address', 'Person addresses'), t002: sap('Language'),
  tfacs: sap('Factory calendar'), nriv: sap('Number range'), balhdr: sap('Application log header'),
  cdhdr: sap('Change document'), cdpos: sap('Change document item'), swwwihead: sap('Workflow work item'),
  but050: sap('Business partner relationship'), but100: sap('Business partner role'), but0id: sap('Business partner ID'),
  cvi_cust_link: sap('Business partner customer link'), cvi_vend_link: sap('Business partner supplier link'),
  t001s: sap('Accounting clerk'), t006: sap('Unit of measure', 'Units of measure'), t006a: sap('Unit of measure text'),
});

/** SAP standard fields → their business word. Keys lower case, as `FIELD_TERMS_EN`. */
export const SAP_FIELDS: Readonly<Record<string, DictionaryTerm>> = Object.freeze({
  // --- status fields of sales documents (domain STATV) ---
  gbstk: sapSame('Overall status', 'Overall status'), gbsta: sapSame('Item status', 'Item status'),
  lfstk: sapSame('Delivery status'), lfsta: sapSame('Item delivery status'), wbstk: sapSame('Goods movement status'),
  wbsta: sapSame('Item goods movement status'), kostk: sapSame('Picking status'), kosta: sapSame('Item picking status'),
  fkstk: sapSame('Billing status'), fksta: sapSame('Item billing status'), absta: sapSame('Rejection status'),
  // --- material master ---
  profl: sap('Dangerous goods profile', undefined, 'Profile'), mmsta: sapSame('Plant material status', 'Material status'),
  mstae: sapSame('Material status'), vmsta: sapSame('Sales status', 'Sales status'), mstav: sapSame('Sales status'),
  lvorm: sap('Deletion flag'), beskz: sap('Procurement type'), sobsl: sap('Special procurement type'), dismm: sap('MRP type'),
  disls: sap('Lot size'), plifz: sapSame('Planned delivery time'), webaz: sapSame('Goods receipt processing time'),
  eisbe: sapSame('Safety stock'), minbe: sap('Reorder point'), bstmi: sap('Minimum lot size'), bstma: sap('Maximum lot size'),
  bstrf: sap('Rounding value'), xchpf: sapSame('Batch management', 'Batch management'), sernp: sap('Serial number profile'),
  gewei: sap('Weight unit'), brgew: sap('Gross weight'), ntgew: sap('Net weight'), volum: sapSame('Volume'),
  voleh: sap('Volume unit'), ean11: sap('GTIN'), bismt: sap('Old material number'), mtpos: sap('Item category group'),
  ktgrm: sap('Material account group'), prodh: sap('Product hierarchy', 'Product hierarchies'), bstme: sap('Order unit'),
  vrkme: sap('Sales unit'), kdmat: sap('Customer material number'), maktx: sap('Material description'),
  // --- sales ---
  uepos: sap('Higher-level item'), vsbed: sap('Shipping condition'), inco2: sap('Incoterm location'), kurrf: sap('Exchange rate'),
  knumv: sap('Condition document number'), kbetr: sap('Condition rate'), kwert: sap('Condition value'), kpein: sap('Condition price unit'),
  kposn: sap('Condition item number'), krech: sap('Calculation type'), kinak: sapSame('Condition inactive'),
  kappl: sap('Application'), datab: sap('Valid-from date'), datbi: sap('Valid-to date'), knumh: sap('Condition record number'),
  vgbel: sap('Reference document'), vgpos: sap('Reference item'), aubel: sap('Sales document'), kunag: sap('Sold-to party', 'Sold-to parties'),
  kunwe: sap('Ship-to party', 'Ship-to parties'), kunrg: sap('Payer'), kunre: sap('Bill-to party', 'Bill-to parties'),
  parvw: sap('Partner function'), vdatu: sap('Requested delivery date'), audat: sap('Document date'), erzet: sap('Entry time'),
  lprio: sap('Delivery priority', 'Delivery priorities'), mwsbp: sap('Tax amount'), zmeng: sap('Target quantity', 'Target quantities'),
  lddat: sap('Loading date'), tddat: sap('Transport planning date'), kodat: sap('Picking date'), wadat_ist: sap('Actual goods issue date'),
  btgew: sap('Total weight'), anzpk: sap('Number of packages', 'Numbers of packages'), tknum: sap('Shipment number'),
  kkber: sap('Credit control area'), klimk: sap('Credit limit'), skfor: sapSame('Total receivables'), ctlpc: sap('Credit risk category', 'Credit risk categories'),
  bzirk: sap('Sales district'), kvgr1: sap('Customer group 1'),
  // --- purchasing and inventory ---
  bstyp: sap('Purchasing document category', 'Purchasing document categories'), frgke: sap('Release indicator'),
  frgzu: sap('Release state'), elikz: sap('Delivery completed flag'), erekz: sap('Final invoice flag'), wepos: sap('Goods receipt flag'),
  repos: sap('Invoice receipt flag'), webre: sap('GR-based invoice verification flag'), bprme: sap('Order price unit'),
  ktmng: sap('Target quantity', 'Target quantities'), uebto: sap('Overdelivery tolerance'), untto: sap('Underdelivery tolerance'),
  afnam: sap('Requisitioner'), txz01: sap('Short text'), konnr: sap('Outline agreement'), ktpnr: sap('Outline agreement item'),
  esokz: sap('Info record category', 'Info record categories'), sakto: sap('G/L account'), vgabe: sap('Transaction type'),
  insmk: sap('Stock type'), sobkz: sap('Special stock indicator'), kzbew: sap('Movement indicator'), grund: sap('Reason for movement', 'Reasons for movement'),
  umlgo: sap('Receiving storage location'), umwrk: sap('Receiving plant'), lgnum: sap('Warehouse number'), lgtyp: sap('Storage type'),
  lgpla: sap('Storage bin'), tanum: sap('Transfer order number'), verme: sapSame('Available stock'), gesme: sapSame('Total stock'),
  lenum: sap('Storage unit number'), exidv: sap('Handling unit ID'), venum: sap('Handling unit number'), iblnr: sap('Physical inventory document'),
  zldat: sap('Count date'), buchm: sap('Book quantity', 'Book quantities'), mjahr: sap('Material document year'),
  // --- financial accounting ---
  blart: sap('Document type'), bschl: sap('Posting key'), xblnr: sap('Reference number'), bktxt: sap('Document header text'),
  sgtxt: sap('Item text'), poper: sap('Posting period'), rldnr: sap('Ledger'), racct: sap('Account'),
  zlsch: sap('Payment method'), zlspr: sap('Payment block'), zbd1t: sap('Cash discount days'), zbd2t: sap('Second cash discount days'),
  zbd3t: sap('Net payment days'), netdt: sap('Net due date'), mansp: sap('Dunning block'), manst: sap('Dunning level'),
  madat: sap('Last dunning date'), umskz: sap('Special G/L indicator'), vbund: sap('Trading partner'), gsber: sap('Business area'),
  fkber: sap('Functional area'), hwaer: sap('Local currency', 'Local currencies'), kursf: sap('Exchange rate'), stblg: sap('Reversal document'),
  bvtyp: sap('Partner bank type'), laufd: sap('Payment run date'), laufi: sap('Payment run ID'), xvorl: sap('Proposal run flag'),
  vblnr: sap('Payment document number'), rzawe: sap('Payment method'), hbkid: sap('House bank'), hktid: sap('House bank account'),
  bankl: sap('Bank key'), bankn: sap('Bank account number'), banks: sap('Bank country', 'Bank countries'),
  stceg: sap('VAT registration number'), stcd1: sap('Tax number'), ktopl: sap('Chart of accounts', 'Charts of accounts'),
  anln1: sap('Asset number'), anln2: sap('Asset subnumber'), anlkl: sap('Asset class', 'Asset classes'), afabe: sap('Depreciation area'),
  deakt: sap('Deactivation date'), xref1: sap('Reference key'), xnegp: sap('Negative posting flag'),
  // --- controlling, projects, funds management ---
  kstar: sap('Cost element'), lstar: sap('Activity type'), objnr: sap('Object number'), posid: sap('WBS element'),
  pspnr: sap('WBS element'), psphi: sap('Project'), autyp: sap('Order category', 'Order categories'), wrttp: sap('Value type'),
  versn: sap('Version'), wkgbtr: sap('Amount in controlling area currency', 'Amounts in controlling area currency', 'CO amount'),
  fistl: sap('Funds center'), fipex: sap('Commitment item'), geber: sap('Fund'), potyp: sap('Commitment item category', 'Commitment item categories'),
  // --- production and maintenance ---
  plnnr: sap('Task list number'), plnty: sap('Task list type'), stlnr: sap('BOM number'), stlan: sap('BOM usage'), idnrk: sap('Component'),
  postp: sap('BOM item category', 'BOM item categories'), arbid: sap('Work center ID'), steus: sap('Control key'),
  gamng: sap('Order quantity', 'Order quantities'), gstrp: sap('Basic start date'), gltrp: sap('Basic finish date'),
  rueck: sap('Confirmation number'), rmzhl: sap('Confirmation counter'), ism: sapSame('Actual work'), lmnga: sapSame('Yield'),
  xmnga: sapSame('Scrap'), aueru: sap('Final confirmation flag'), tplnr: sap('Functional location'), iwerk: sap('Planning plant'),
  ingrp: sap('Planner group'), qmart: sap('Notification type'), qmtxt: sap('Notification text'), priok: sap('Priority', 'Priorities'),
  strmn: sap('Required start date'), ltrmn: sap('Required end date'), fecod: sap('Damage code'), urcod: sap('Cause code'),
  ilart: sap('Maintenance activity type'), warpl: sap('Maintenance plan'), wapos: sap('Maintenance item'), recdv: sap('Measured value'),
  sernr: sap('Serial number'), qmdat: sap('Notification date'),
  // --- quality management ---
  prueflos: sap('Inspection lot'), vcode: sap('Usage decision code'), vbewertung: sap('Usage decision valuation'),
  mbewertg: sap('Characteristic valuation'),
  // --- human resources ---
  begda: sap('Start date'), endda: sap('End date'), massn: sap('Action type'), massg: sap('Reason for action', 'Reasons for action'),
  stat2: sapSame('Employment status'), persg: sap('Employee group'), persk: sap('Employee subgroup'), btrtl: sap('Personnel subarea'),
  orgeh: sap('Organizational unit'), abkrs: sap('Payroll area'),
  awart: sap('Absence type'), subty: sap('Subtype'), lgart: sap('Wage type'), betrg: sap('Amount'), anzhl: sap('Number'),
  trfgr: sap('Pay scale group'), trfst: sap('Pay scale level'), vorna: sap('First name'), nachn: sap('Last name'),
  gbdat: sap('Date of birth', 'Dates of birth'), objid: sap('Object ID'), otype: sap('Object type'), rsign: sap('Relationship direction'),
  relat: sap('Relationship type'), sclas: sap('Related object type'), sobid: sap('Related object ID'), plvar: sap('Plan version'),
  istat: sapSame('Planning status'), catshours: sapSame('Hours'), reinr: sap('Trip number'),
  fpper: sap('Payroll for-period'), inper: sap('Payroll in-period'),
  // --- cross-application ---
  aenam: sap('Changed by', 'Changed by'), tcode: sap('Transaction code'), objectclas: sap('Change document object'),
  objectid: sap('Changed object'), changenr: sap('Change number'), udate: sap('Change date'), tabname: sap('Table name'),
  value_new: sap('New value'), value_old: sap('Old value'), lognumber: sap('Log number'), msgty: sap('Message type'),
  msgid: sap('Message class', 'Message classes'), msgno: sap('Message number'), mestyp: sap('IDoc message type'),
  idoctp: sap('IDoc type'), docnum: sap('IDoc number'), rcvprn: sap('Receiving partner'), sndprn: sap('Sending partner'),
  segnam: sap('IDoc segment name'), sdata: sapSame('IDoc segment data'), parnr: sap('Partner number'), nacha: sap('Output medium', 'Output media'),
  vstat: sapSame('Output status'), objky: sap('Object key'), jobname: sap('Job name'), jobcount: sap('Job number'),
  trtyp: sap('Processing mode'), aktyp: sap('Activity category', 'Activity categories'),
});

/**
 * Fixed values SAP defines for every system, by field (as `FIELD_VALUE_TERMS_EN`). Only domains whose values are the
 * same in every SAP system; a value not listed is shown as the code writes it.
 */
const STATV = Object.freeze({ A: 'not yet processed', B: 'partly processed', C: 'completely processed' });
export const SAP_FIELD_VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  // Domain STATV — the processing status of a sales document, a delivery and its items.
  gbstk: STATV, gbsta: STATV, lfstk: STATV, lfsta: STATV, wbstk: STATV, wbsta: STATV, kostk: STATV, kosta: STATV,
  fkstk: STATV, fksta: STATV,
  // Domain TRTYP — the mode of a dialog transaction (T180).
  trtyp: Object.freeze({ H: 'create', V: 'change', A: 'display' }),
  // Domain AKTYP — the same in the activity of a transaction.
  aktyp: Object.freeze({ H: 'create', V: 'change', A: 'display' }),
  // Domain BSTYP — the category of a purchasing document.
  bstyp: Object.freeze({ F: 'purchase order', A: 'request for quotation', K: 'contract', L: 'scheduling agreement', B: 'purchase requisition' }),
  // Domain MSGTY / BAPI_MTYPE — the type of a message.
  msgty: Object.freeze({ E: 'error', A: 'abort', W: 'warning', I: 'information', S: 'success' }),
  // Domain AUFTYP — the category of an order (the values SAP ships).
  autyp: Object.freeze({ '01': 'internal order', '10': 'production order', '20': 'network', '30': 'maintenance order', '40': 'process order' }),
  // Domain XFELD for the completion flags.
  elikz: Object.freeze({ X: 'yes' }), erekz: Object.freeze({ X: 'yes' }), lvorm: Object.freeze({ X: 'yes' }),
});

/** Function modules SAP ships, by what they do for the business (as `FUNCTION_TERMS_EN`). Keys upper case. */
export const SAP_FUNCTIONS: Readonly<Record<string, string>> = Object.freeze({
  BAL_LOG_CREATE: 'Start the run log', BAL_LOG_MSG_ADD: 'Add a message to the run log',
  BAL_LOG_MSG_ADD_FREE_TEXT: 'Add a message to the run log', BAL_DB_SAVE: 'Save the run log',
  BAL_DSP_LOG_DISPLAY: 'Show the run log', BAL_LOG_REFRESH: 'Clear the run log', BAL_DB_LOAD: 'Read the run log',
  BAPI_ALM_NOTIF_CREATE: 'Create maintenance notification', BAPI_ALM_NOTIF_SAVE: 'Save maintenance notification',
  BAPI_ALM_NOTIF_DATA_MODIFY: 'Change maintenance notification', BAPI_ALM_ORDER_MAINTAIN: 'Maintain maintenance order',
  BAPI_ALM_NOTIF_CLOSE: 'Complete maintenance notification', BAPI_ALM_ORDER_GET_DETAIL: 'Read maintenance order',
  BAPI_PRODORDCONF_CREATE_TT: 'Confirm production order', BAPI_PRODORD_CREATE: 'Create production order',
  BAPI_PRODORD_RELEASE: 'Release production order', BAPI_MATERIAL_GET_DETAIL: 'Read material',
  BAPI_MATERIAL_GET_ALL: 'Read material', BAPI_MATERIAL_AVAILABILITY: 'Check material availability',
  BAPI_OUTB_DELIVERY_CREATE_SLS: 'Create outbound delivery', BAPI_OUTB_DELIVERY_CHANGE: 'Change outbound delivery',
  BAPI_OUTB_DELIVERY_CONFIRM_DEC: 'Confirm outbound delivery', BAPI_BILLINGDOC_CREATEMULTIPLE: 'Create billing documents',
  BAPI_INCOMINGINVOICE_CREATE: 'Create supplier invoice', BAPI_INCOMINGINVOICE_CREATE1: 'Create supplier invoice',
  BAPI_ACC_DOCUMENT_CHECK: 'Check accounting document', BAPI_ACC_GL_POSTING_POST: 'Post G/L document',
  BAPI_ACC_DOCUMENT_REV_POST: 'Reverse accounting document', BAPI_PO_GETDETAIL: 'Read purchase order',
  BAPI_PO_GETDETAIL1: 'Read purchase order', BAPI_PO_RELEASE: 'Release purchase order',
  BAPI_REQUISITION_CREATE: 'Create purchase requisition', BAPI_PR_CHANGE: 'Change purchase requisition',
  BAPI_SALESORDER_GETLIST: 'Read sales orders', BAPI_SALESORDER_SIMULATE: 'Simulate sales order',
  BAPI_CUSTOMERRETURN_CREATE: 'Create customer return', BAPI_GOODSMVT_CANCEL: 'Reverse goods movement',
  BAPI_EQUI_CREATE: 'Create equipment', BAPI_EQUI_CHANGE: 'Change equipment', BAPI_FUNCLOC_CREATE: 'Create functional location',
  BAPI_BUPA_CREATE_FROM_DATA: 'Create business partner', BAPI_BUPA_ADDRESS_CHANGE: 'Change business partner address',
  BAPI_EMPLOYEE_ENQUEUE: 'Lock employee', BAPI_EMPLOYEE_DEQUEUE: 'Unlock employee',
  HR_INFOTYPE_OPERATION: 'Maintain employee data', HR_READ_INFOTYPE: 'Read employee data', RH_STRUC_GET: 'Read organizational structure',
  BAPI_CATIMESHEETMGR_INSERT: 'Record working times', BAPI_ACC_ACTIVITY_ALLOC_POST: 'Post activity allocation',
  MATERIAL_UNIT_CONVERSION: 'Convert unit of measure', UNIT_CONVERSION_SIMPLE: 'Convert unit of measure',
  CONVERSION_EXIT_ALPHA_INPUT: 'Add leading zeros', CONVERSION_EXIT_ALPHA_OUTPUT: 'Remove leading zeros',
  DATE_CHECK_PLAUSIBILITY: 'Check date', RP_CALC_DATE_IN_INTERVAL: 'Calculate date', DAY_ATTRIBUTES_GET: 'Read day attributes',
  DATE_CONVERT_TO_FACTORYDATE: 'Find working day', CALCULATE_TAX_FROM_NET_AMOUNT: 'Calculate tax',
  CALCULATE_TAX_FROM_GROSSAMOUNT: 'Calculate tax', SSF_FUNCTION_MODULE_NAME: 'Find the form', FP_FUNCTION_MODULE_NAME: 'Find the form',
  FP_JOB_OPEN: 'Start form output', FP_JOB_CLOSE: 'Finish form output', OPEN_FORM: 'Start form output', CLOSE_FORM: 'Finish form output',
  START_FORM: 'Start form output', END_FORM: 'Finish form output', WRITE_FORM: 'Print form text',
  IDOC_STATUS_WRITE_TO_DATABASE: 'Set IDoc status', RFC_READ_TABLE: 'Read a table via RFC',
  BAPI_USER_GET_DETAIL: 'Read user details', POPUP_TO_DISPLAY_TEXT: 'Show information', SAPGUI_PROGRESS_INDICATOR: 'Show progress',
  READ_EXCHANGE_RATE: 'Read exchange rate', BAPI_EXCHANGERATE_GETDETAIL: 'Read exchange rate', FI_PERIOD_DETERMINE: 'Determine posting period',
  DATE_TO_PERIOD_CONVERT: 'Determine posting period', FI_PERIOD_CHECK: 'Check posting period',
  BAPI_AR_ACC_GETOPENITEMS: 'Read open customer items', BAPI_AP_ACC_GETOPENITEMS: 'Read open supplier items',
  CLAF_CLASSIFICATION_OF_OBJECTS: 'Read classification', BAPI_OBJCL_GETDETAIL: 'Read classification', BAPI_OBJCL_CHANGE: 'Change classification',
  BAPI_INSPLOT_SETUSAGEDECISION: 'Record usage decision', BAPI_INSPLOT_GETDETAIL: 'Read inspection lot',
  BAPI_QUALNOT_CREATE: 'Create quality notification', BAPI_SERVICENOTIFICAT_CREATE: 'Create service notification',
  STATUS_READ: 'Read object status', STATUS_CHANGE_EXTERN: 'Set user status', L_TO_CREATE_SINGLE: 'Create transfer order',
  L_TO_CONFIRM: 'Confirm transfer order', L_TO_CREATE_DN: 'Create transfer order', WS_DELIVERY_UPDATE: 'Update delivery',
  BAPI_SHIPMENT_CREATE: 'Create shipment', NAST_PROTOCOL_UPDATE: 'Add a message to the output log',
  IDOC_INPUT_ORDERS: 'Process incoming sales order IDoc', EDI_DOCUMENT_OPEN_FOR_EDIT: 'Open IDoc for editing',
});

/** Transactions SAP ships, by what they do (as `TRANSACTION_TERMS_EN`). Keys upper case. */
export const SAP_TRANSACTIONS: Readonly<Record<string, string>> = Object.freeze({
  IW21: 'Create notification', IW22: 'Change notification', IW31: 'Create maintenance order', IW32: 'Change maintenance order',
  IW41: 'Confirm maintenance order', CO01: 'Create production order', CO02: 'Change production order', CO11N: 'Confirm production order',
  MB1A: 'Post goods issue', MB1B: 'Post transfer', MB1C: 'Post goods receipt', MB01: 'Post goods receipt for purchase order',
  MI01: 'Create physical inventory document', MI04: 'Enter inventory count', MI07: 'Post inventory difference',
  ME21: 'Create purchase order', ME22: 'Change purchase order', ME23: 'Display purchase order', ME51: 'Create purchase requisition',
  ME28: 'Release purchase orders', ME29N: 'Release purchase order', ME54N: 'Release purchase requisition', VL02: 'Change outbound delivery',
  VA21: 'Create quotation', VA41: 'Create contract', VA42: 'Change contract', VF11: 'Cancel billing document', VF04: 'Process billing due list',
  FB05: 'Post with clearing', F110: 'Run automatic payments', FB60: 'Enter supplier invoice', FB70: 'Enter customer invoice',
  FB08: 'Reverse accounting document', KB21N: 'Enter activity allocation', KO01: 'Create internal order', KO02: 'Change internal order',
  PA30: 'Maintain employee data', PA40: 'Run personnel action', CAT2: 'Record working times', QA11: 'Record usage decision',
  QM01: 'Create quality notification', LT01: 'Create transfer order', LT12: 'Confirm transfer order', VT01N: 'Create shipment',
  VT02N: 'Change shipment', MM17: 'Change materials in bulk', CS01: 'Create bill of material', CS02: 'Change bill of material',
  CA01: 'Create routing', CR01: 'Create work center', IE01: 'Create equipment', IE02: 'Change equipment',
  IL01: 'Create functional location', IK11: 'Create measurement document', SM35: 'Process batch input sessions', SU01: 'Maintain users',
});

/**
 * Authorization objects SAP ships → what the check protects (H9: a lane named after an authorization check says
 * what the user must be allowed to do). Keys upper case.
 */
export const SAP_AUTHORIZATION_OBJECTS: Readonly<Record<string, string>> = Object.freeze({
  M_BANF_EKG: 'Purchase requisitions by purchasing group', M_BANF_WRK: 'Purchase requisitions by plant',
  M_BEST_EKG: 'Purchase orders by purchasing group', M_BEST_BSA: 'Purchase orders by document type', M_BEST_WRK: 'Purchase orders by plant',
  M_BEST_EKO: 'Purchase orders by purchasing organization', M_MATE_WRK: 'Material master by plant',
  M_MSEG_BWA: 'Goods movements by movement type', M_MSEG_WMB: 'Goods movements by plant', M_RECH_WRK: 'Supplier invoices by plant',
  V_VBAK_VKO: 'Sales documents by sales area', V_VBAK_AAT: 'Sales documents by document type', V_LIKP_VST: 'Deliveries by shipping point',
  V_VBRK_FKA: 'Billing documents by billing type', V_VBRK_VKO: 'Billing documents by sales organization',
  V_KNA1_VKO: 'Customer master by sales area', F_BKPF_BUK: 'Accounting documents by company code',
  F_BKPF_KOA: 'Accounting documents by account type', F_BKPF_BLA: 'Accounting documents by document type',
  F_KNA1_BUK: 'Customer master by company code', F_LFA1_BUK: 'Supplier master by company code', F_REGU_BUK: 'Payment runs by company code',
  K_CSKS: 'Cost centers', K_ORDER: 'Internal orders', P_ORGIN: 'HR master data', P_PERNR: 'HR master data by personnel number',
  PLOG: 'Organizational management', I_IWERK: 'Maintenance by planning plant', C_AFKO_AWK: 'Production orders by plant',
  Q_INSPLOT: 'Inspection lots', S_TCODE: 'Starting a transaction', S_PROGRAM: 'Starting a program', S_TABU_DIS: 'Table maintenance',
  S_BTCH_JOB: 'Background jobs', S_RFC: 'Remote calls', S_GUI: 'File transfer to the PC', S_DATASET: 'Files on the server',
});

/**
 * Abbreviations developers commonly write inside a variable name, applied word by word to a stem without an entry of
 * its own (as `STEM_ABBREVIATIONS`). Never to a database field: `pos` is an item in `lv_pos`, not a field POS.
 */
export const NAMING_ABBREVIATIONS: Readonly<Record<string, string>> = Object.freeze({
  hdr: 'header', itm: 'item', pos: 'item', idx: 'row number', txt: 'text', descr: 'description', sel: 'selection',
  param: 'parameter', prev: 'previous', diff: 'difference', tol: 'tolerance', perc: 'percent', proz: 'percent',
  anz: 'number', kz: 'indicator', rc: 'return code', subrc: 'return code', retcode: 'return code', erg: 'result',
  notif: 'notification', cert: 'certificate', appl: 'application', ctr: 'counter', recv: 'received', req: 'request',
  resp: 'response', conf: 'confirmation', ord: 'order', inv: 'invoice', deliv: 'delivery', matl: 'material',
  plnt: 'plant', uom: 'unit of measure', val: 'value', toler: 'tolerance', lfd: 'running', akt: 'current',
  purch: 'purchasing', org: 'organization', mgr: 'manager', dept: 'department', amnt: 'amount', cntry: 'country',
});

/** The words of this dictionary, for a check that asks whether a word is English (`englishGlossaryWords`). */
export function dictionaryWords(): string[] {
  const out: string[] = [];
  for (const t of [...Object.values(SAP_TABLES), ...Object.values(SAP_FIELDS)]) out.push(t.singular, t.plural, t.short ?? '');
  out.push(...Object.values(SAP_FUNCTIONS), ...Object.values(SAP_TRANSACTIONS), ...Object.values(SAP_AUTHORIZATION_OBJECTS),
    ...Object.values(NAMING_ABBREVIATIONS));
  for (const values of Object.values(SAP_FIELD_VALUES)) out.push(...Object.values(values));
  return out.filter(Boolean);
}
