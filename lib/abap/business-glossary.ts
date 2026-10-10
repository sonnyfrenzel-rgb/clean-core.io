/**
 * The dictionary that turns an ABAP identifier into a **business** word.
 *
 * Roadmap 17.7, requirement 1 (Sonny, 23.09.2026): the sentence must make the
 * code understandable for a business reader — not "SELECT on KNA1", but what
 * happens in business terms. This module is where that hangs: `KNA1` are
 * customers, `LAND1` is a country key, `NETWR` a net value.
 *
 * **A translation is an interpretation, so it stands here, visible and
 * complete, instead of disappearing into a sentence template** — the same
 * principle as `RULE_BRIDGES` and `STATEMENT_STOPWORDS` in the corpus
 * comparison. Whoever thinks a line is wrong finds it in one place and can
 * prove it or strike it out.
 *
 * English since the owner decision of 01.10.2026 ("alles Englisch"): the
 * business statements are product text, and product text is English. The
 * words follow the German entries they replace one for one; the English label
 * vocabulary of the process map is `plain-glossary.ts`.
 *
 * **The honest limit:** the list grew with the reference corpus and covers its
 * fields. An unknown identifier is **not** guessed — it stands in the sentence
 * as the source writes it (the same literal handling as rule 6 in the
 * skeleton), so the place stays provable instead of invented.
 *
 * No import, no dependency: pure data, so a client component can read it too.
 */

export interface BusinessTerm {
  /** How a business statement names one of it, lower case mid-sentence. */
  singular: string;
  /** The plural. */
  plural: string;
}

const term = (singular: string, plural?: string): BusinessTerm => ({
  singular,
  plural: plural ?? `${singular}s`,
});
/** A word that does not inflect (status, data …). */
const same = (word: string): BusinessTerm => ({ singular: word, plural: word });

/**
 * Database fields and variable stems → business word.
 *
 * The key is lower case and without the usual ABAP prefixes (`lv_`, `gv_`,
 * `ls_`, `iv_`, `p_` …) that `stemOf` cuts off.
 */
export const FIELD_TERMS: Readonly<Record<string, BusinessTerm>> = Object.freeze({
  kunnr: term('customer number'),
  customer: term('customer number'),
  name1: term('name'),
  customername: term('name'),
  name: term('name'),
  land1: term('country key'),
  land: term('country key'),
  country: term('country key'),
  bukrs: term('company code'),
  akont: term('reconciliation account'),
  vkorg: term('sales organization'),
  vtweg: term('distribution channel'),
  spart: term('division'),
  mandt: term('client'),
  bname: term('user name'),
  bcode: term('password hash', 'password hashes'),
  uflag: same('lock status'),
  vbeln: term('document number'),
  auart: term('order type'),
  netwr: term('net value'),
  lifsk: term('delivery block'),
  amount: term('amount'),
  amt: term('amount'),
  betrag: term('amount'),
  route: term('route'),
  status: same('status'),
  count: term('count'),
  sum: term('sum'),
  min: term('minimum value'),
  value: term('value'),
  text: term('text'),
  key: term('key'),
  keys: term('key'),
  id: term('case'),
  case_id: term('case'),
  case: term('case'),
  review: term('review flag'),
  title: term('list title'),
  tab: term('table'),
  func: term('function module'),
  function: term('function module'),
  prog: term('program'),
  form: term('subroutine'),
  dest: term('destination'),
  field: term('field'),
  rows: term('row'),
  row: term('row'),
  result: term('result'),
  total: term('sum'),
  rule: term('rule'),
  user: term('user'),
  type: term('type'),
  where: term('predicate'),

  // --- SAP standard fields (data elements), across modules ----------------
  //
  // Source: the short descriptions of the SAP standard data elements in the
  // ABAP Dictionary (SE11) or the SAP Help Portal, shortened to the business
  // word. Included are the common key and quantity fields of the core modules
  // — not fields that happen to stand in a test case, and no customer (Z/Y)
  // field. A field missing here stays in the sentence as the source names it.
  matnr: term('material number'),
  werks: term('plant'),
  lgort: term('storage location'),
  charg: term('batch', 'batches'),
  menge: term('quantity', 'quantities'),
  meins: term('unit of measure', 'units of measure'),
  waers: term('currency', 'currencies'),
  waerk: term('document currency', 'document currencies'),
  posnr: term('item number'),
  ebeln: term('purchase order number'),
  ebelp: term('purchase order item'),
  banfn: term('purchase requisition number'),
  lifnr: term('supplier number'),
  belnr: term('document number'),
  gjahr: term('fiscal year'),
  budat: term('posting date'),
  bldat: term('document date'),
  // Roadmap 3.0.7 — the schedule-line date a batch input to ME22 changes
  // (`EKET-EEIND` on the screen, `EKET-EINDT` in the table).
  eindt: term('delivery date'),
  eeind: term('delivery date'),
  hkont: term('G/L account'),
  saknr: term('G/L account'),
  kostl: term('cost center'),
  prctr: term('profit center'),
  kokrs: term('controlling area'),
  aufnr: term('order number'),
  ekorg: term('purchasing organization'),
  ekgrp: term('purchasing group'),
  bwart: term('movement type'),
  mblnr: term('material document number'),
  pernr: term('personnel number'),
  equnr: term('equipment number'),
  qmnum: term('notification number'),
  vornr: term('operation number'),
  arbpl: term('work center'),
  abgru: term('rejection reason'),
  faksk: term('billing block'),
  aufsd: term('order block'),
  loevm: term('deletion flag'),
  kwmeng: term('order quantity', 'order quantities'),
  lfimg: term('delivery quantity', 'delivery quantities'),
  vstel: term('shipping point'),
  spras: term('language'),
  ernam: term('creator'),
  erdat: term('creation date'),
  aedat: term('change date'),
  dmbtr: term('amount in local currency', 'amounts in local currency'),
  wrbtr: term('amount in document currency', 'amounts in document currency'),
  shkzg: term('debit/credit indicator'),
});

/**
 * Database tables and read models → the business set behind them.
 *
 * A business reader reads "customers", not "KNA1". The technical name stays in
 * the anchor and in the evidence; it does not disappear, it just does not
 * stand in the sentence.
 */
export const TABLE_TERMS: Readonly<Record<string, BusinessTerm>> = Object.freeze({
  kna1: term('customer'),
  knb1: term('customer'),
  knvv: term('customer'),
  i_customer: term('customer'),
  usr02: term('user'),
  vbak: term('order'),
  zi_order: term('order'),
  zcc_decision: term('case'),
  zcc_case: term('case'),

  // --- SAP standard tables, the common ones per module --------------------
  //
  // Source: the short descriptions of the tables in the ABAP Dictionary (SE11)
  // and the module table overviews in the SAP Help Portal, brought to the
  // business word. Included per module are the master and document tables that
  // occur in almost every customer code — no selection by test case and no
  // customer (Z/Y) table.
  //
  // Sales (SD)
  vbap: term('order item'),
  vbep: term('schedule line'),
  vbpa: term('document partner'),
  vbfa: term('document flow record'),
  likp: term('delivery', 'deliveries'),
  lips: term('delivery item'),
  vbrk: term('billing document'),
  vbrp: term('billing document item'),
  konv: term('condition record'),
  knvp: term('customer partner'),
  // Materials management (MM)
  mara: term('material'),
  makt: term('material short text'),
  marc: term('plant record of a material', 'plant records of materials'),
  mard: term('storage location stock'),
  mbew: term('material valuation'),
  mkpf: term('material document'),
  mseg: term('material document item'),
  mch1: term('batch', 'batches'),
  mcha: term('batch', 'batches'),
  ekko: term('purchase order'),
  ekpo: term('purchase order item'),
  eket: term('purchase order schedule line'),
  eban: term('purchase requisition'),
  lfa1: term('supplier'),
  lfb1: term('supplier'),
  t001w: term('plant'),
  t001l: term('storage location'),
  // Financial accounting (FI)
  bkpf: term('accounting document'),
  bseg: term('accounting document item'),
  acdoca: term('journal entry item'),
  bsid: term('open customer item'),
  bsad: term('cleared customer item'),
  bsik: term('open supplier item'),
  bsak: term('cleared supplier item'),
  bsis: term('open G/L account item'),
  bsas: term('cleared G/L account item'),
  ska1: term('G/L account'),
  skb1: term('G/L account'),
  t001: term('company code'),
  tcurr: term('exchange rate'),
  // Controlling (CO)
  csks: term('cost center'),
  cska: term('cost element'),
  cepc: term('profit center'),
  aufk: term('order master record'),
  // Production (PP)
  afko: term('production order'),
  afpo: term('production order item'),
  afvc: term('operation'),
  resb: term('reservation item'),
  stko: term('bill of material', 'bills of material'),
  stpo: term('bill of material item'),
  plko: term('routing'),
  crhd: term('work center'),
  // Plant maintenance and quality (PM/QM)
  equi: term('equipment', 'equipment'),
  iflot: term('functional location'),
  qmel: term('notification'),
  afih: term('maintenance order'),
  imptt: term('measuring point'),
  imrg: term('measurement document'),
  qals: term('inspection lot'),
  // Logistics execution (LE/WM)
  vttk: term('shipment'),
  vttp: term('shipment item'),
  ltak: term('transfer order'),
  ltap: term('transfer order item'),
  lqua: term('quant'),
  lagp: term('storage bin'),
  // Human resources (HR)
  pa0000: term('personnel action'),
  pa0001: term('organizational assignment'),
  pa0002: term('personal data record'),
  pa0008: term('basic pay record'),
  // Cross-application (Basis, business partner, addresses, messages, IDoc)
  but000: term('business partner'),
  adrc: term('address', 'addresses'),
  adr6: term('e-mail address', 'e-mail addresses'),
  tvarvc: term('variable entry', 'variable entries'),
  t100: term('message text'),
  jest: same('object status'),
  nast: term('output message'),
  edidc: term('IDoc control record'),
  edid4: term('IDoc data record'),
  tbtco: term('background job'),
});

/** "of the customer", "of the purchase order" — the possessive a sentence hangs after a noun. */
export function genitivePhrase(entity: BusinessTerm): string {
  return `of the ${entity.singular}`;
}

/** The ABAP prefixes that say nothing about the thing — only about its visibility. */
const PREFIXES = ['lv_', 'gv_', 'ls_', 'lt_', 'gt_', 'gs_', 'iv_', 'ev_', 'cv_', 'rv_', 'it_', 'et_', 'ct_', 'rt_', 'is_', 'es_', 'cs_', 'rs_', 'lo_', 'go_', 'io_', 'ro_', 'p_', 's_'];

/**
 * The stem of an identifier: without prefix, without structure name.
 *
 * `ls_customer-kunnr` → `kunnr`, `lv_count` → `count`, `p_land` → `land`.
 * The field name behind the dash wins, because it names the thing and the
 * structure only says where it currently sits.
 */
export function stemOf(identifier: string): string {
  let name = identifier.trim().toLowerCase().replace(/^[@<]+/, '').replace(/[>]+$/, '');
  const dash = name.lastIndexOf('-');
  if (dash > 0) name = name.slice(dash + 1);
  const tilde = name.lastIndexOf('~');
  if (tilde >= 0) name = name.slice(tilde + 1);
  for (const prefix of PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      name = name.slice(prefix.length);
      break;
    }
  }
  return name;
}

/**
 * The business word for an identifier — or the identifier itself.
 *
 * **Never guessed.** If the stem is not in the dictionary, the sentence carries
 * the name the source writes. That is less pretty and provable; an invented
 * business name would be prettier and wrong.
 */
export function termFor(identifier: string): BusinessTerm {
  const stem = stemOf(identifier);
  const hit = FIELD_TERMS[stem];
  if (hit) return hit;
  const raw = identifier.trim().replace(/<([A-Za-z0-9_]+)>/g, '$1').replace(/^[@<]+/, '').replace(/[>]+$/, '');
  return same(raw);
}

/** The business set behind a table or entity name. */
export function tableTerm(name: string): BusinessTerm | null {
  return TABLE_TERMS[name.trim().toLowerCase()] ?? null;
}

/** Whether the dictionary knows an identifier — then it carries a business word. */
export function isKnownField(identifier: string): boolean {
  return FIELD_TERMS[stemOf(identifier)] !== undefined;
}

/**
 * An identifier as a noun phrase with its article.
 *
 * A business word gets "the" ("the amount", "the customer number"); anything
 * else is "the field lv_x" — true for every identifier and guessing nothing.
 */
export function nounPhrase(identifier: string): string {
  if (isKnownField(identifier)) return `the ${termFor(identifier).singular}`;
  const raw = identifier.trim().replace(/<([A-Za-z0-9_]+)>/g, '$1').replace(/^[@<]+/, '').replace(/[>]+$/, '');
  return `the field ${raw}`;
}
