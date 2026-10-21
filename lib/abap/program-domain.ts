import { maskLiterals, readStatements } from './statement-reader';

/**
 * What a program is for, in business words, read off its own vocabulary —
 * roadmap 3.0.20, owner report 21.10.2026 on a goods-receipt / invoice check
 * whose "In short" said only *"A read-only report that reads no table by
 * name, selected by document"*: nothing about what it is *for*.
 *
 * The code says what a program works on in the names it chooses: the program's
 * own name (`ZMM_RECEIPT_INVOICE_CHECK`), its routines and fields, its
 * messages ("No goods receipt found for the purchase order"), the SAP tables
 * it names and the functions it calls (`BAPI_PO_GETDETAIL1`,
 * `BAPI_INCOMINGINVOICE_GETDETAIL`). This module counts the business objects
 * those names stand for and the verb the program's name gives, and says one
 * sentence — *"Checks supplier invoices against purchase orders and goods
 * receipts, within a tolerance"* — with the lines it was read from.
 *
 * **Only what the names support.** The verb comes from the program's name and
 * nowhere else; an object counts when the program's name names it or at least
 * two lines of code do. Without a verb or without an object the purpose is not
 * determined (`null`), never guessed. The sentence says what the program does
 * as its names say it — never why the company needs it.
 *
 * Pure: the statement reader only. The callers gate it (`ENGINE_READS_3020_FROM`).
 */

export interface DomainObject {
  /** The business object in words, plural — "supplier invoices". */
  word: string;
  /** The tokens of a name that stand for it, upper case; a token is a whole part of a name between `_`, `-` or `/`. */
  tokens: readonly string[];
}

export const DOMAIN_OBJECTS: readonly DomainObject[] = Object.freeze([
  // "Invoice" alone is a supplier's or a customer's: only the logistics invoice's own names make it a supplier invoice.
  { word: 'supplier invoices', tokens: ['INCINV', 'INCOMINGINVOICE', 'RBKP', 'RSEG', 'MIRO'] },
  { word: 'invoices', tokens: ['INVOICE', 'INVOICES', 'INVOICEDOCNUMBER', 'INV'] },
  { word: 'purchase orders', tokens: ['PO', 'POS', 'PURCHASEORDER', 'POHEADER', 'POITEM', 'EKKO', 'EKPO', 'EBELN', 'ME21N', 'ME22N', 'ME23N'] },
  { word: 'goods receipts', tokens: ['RECEIPT', 'RECEIPTS', 'GR', 'MIGO'] },
  { word: 'goods movements', tokens: ['GOODSMVT', 'MSEG', 'MKPF', 'MBLNR'] },
  { word: 'purchase requisitions', tokens: ['EBAN', 'PREQ', 'REQUISITION', 'REQUISITIONS', 'BANFN'] },
  { word: 'sales orders', tokens: ['VBAK', 'VBAP', 'SALESORDER', 'SALESORDERS'] },
  { word: 'deliveries', tokens: ['LIKP', 'LIPS', 'DELIVERY', 'DELIVERIES'] },
  { word: 'billing documents', tokens: ['VBRK', 'VBRP', 'BILLING'] },
  { word: 'payments', tokens: ['PAYMENT', 'PAYMENTS', 'REGUH', 'REGUP'] },
  { word: 'accounting documents', tokens: ['BKPF', 'BSEG'] },
  { word: 'customers', tokens: ['KNA1', 'KNB1', 'CUSTOMER', 'CUSTOMERS', 'KUNNR'] },
  { word: 'suppliers', tokens: ['LFA1', 'LFB1', 'VENDOR', 'VENDORS', 'SUPPLIER', 'SUPPLIERS', 'LIFNR'] },
  { word: 'materials', tokens: ['MARA', 'MARC', 'MATERIAL', 'MATERIALS', 'MATNR'] },
  { word: 'stock', tokens: ['MARD', 'STOCK', 'LABST'] },
  { word: 'cost centers', tokens: ['CSKS', 'KOSTL', 'COSTCENTER'] },
  { word: 'freight costs', tokens: ['FREIGHT'] },
  { word: 'prices', tokens: ['PRICE', 'PRICES', 'KONP', 'NETPR'] },
] as DomainObject[]);

/** The verb a program's name gives — only the program's name, the one place a program says what it does. */
const VERBS: ReadonlyArray<[string, readonly string[]]> = [
  ['checks', ['CHECK', 'CHK', 'VALIDATE', 'VALIDATION', 'VERIFY', 'VERIFICATION', 'CONTROL']],
  ['compares', ['MATCH', 'MATCHING', 'RECON', 'RECONCILE', 'RECONCILIATION', 'COMPARE', 'COMPARISON', 'CMP']],
  ['audits', ['AUDIT']],
  ['monitors', ['MONITOR', 'MONITORING', 'COCKPIT']],
  ['lists', ['LIST', 'OVERVIEW', 'DISPLAY']],
  ['calculates', ['CALC', 'CALCULATE', 'CALCULATION']],
  ['evaluates', ['EVAL', 'EVALUATE', 'EVALUATION', 'ANALYSIS', 'ANALYZE', 'ANALYSE']],
];

/** Objects a check is made *of*, weighed against the others: an invoice is checked against its order and receipt. */
const CHECKED = ['supplier invoices', 'invoices', 'billing documents', 'deliveries', 'payments', 'goods receipts'];

const TOLERANCE = new Set(['TOLERANCE', 'TOL', 'TOLER']);

export interface ProgramDomain {
  /** The sentence, a verb phrase in sentence case — "Checks supplier invoices against purchase orders and goods receipts, within a tolerance." */
  text: string;
  /** The lines it was read from: the program's name, then the first line naming each object. */
  lines: number[];
  /** The objects, in the sentence's order. */
  objects: string[];
}

const tokensOf = (identifier: string): string[] => identifier.toUpperCase().split(/[_\-/~>=]+/).filter(Boolean);

/** The business object a single name stands for — a called function, a table — or null. */
export function domainObjectOf(name: string): string | null {
  const tokens = tokensOf(name);
  for (const object of DOMAIN_OBJECTS) if (tokens.some((t) => object.tokens.includes(t))) return object.word;
  return null;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The purpose the names support, or null when they do not (no verb in the program's name, or no object). */
export function readProgramDomain(source: string): ProgramDomain | null {
  let statements;
  try {
    statements = readStatements(source);
  } catch {
    return null;
  }
  const head = statements.find((s) => /^(?:REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL)$/i.test(s.keyword));
  const program = head ? /^\S+\s+([\w/]+)/.exec(head.text)?.[1] ?? null : null;
  if (!program || !head) return null;
  const nameTokens = tokensOf(program.replace(/^[ZY]_?/i, ''));
  const verb = VERBS.find(([, words]) => nameTokens.some((t) => words.includes(t)))?.[0] ?? null;
  if (!verb) return null;

  // Every name and message word on every line, comments left out.
  const found = new Map<string, number[]>();
  // A tolerance is said only when the program uses what it declares for it, not for the declaration alone.
  const toleranceDeclared = new Map<string, number>();
  for (const s of statements) {
    const words = [
      ...(maskLiterals(s.text).match(/[A-Za-z_][\w/-]*/g) ?? []),
      ...[...s.text.matchAll(/'((?:[^']|'')*)'/g)].flatMap((m) => m[1].match(/[A-Za-z][\w-]*/g) ?? []),
    ];
    const tokens = new Set(words.flatMap(tokensOf));
    for (const object of DOMAIN_OBJECTS) {
      if (!object.tokens.some((t) => tokens.has(t))) continue;
      const lines = found.get(object.word) ?? [];
      if (!lines.includes(s.lineStart)) lines.push(s.lineStart);
      found.set(object.word, lines);
    }
    if (/^(?:PARAMETERS?|CONSTANTS|SELECT-OPTIONS)$/i.test(s.keyword)) {
      for (const word of maskLiterals(s.text).match(/[A-Za-z_][\w/]*/g) ?? []) {
        if (tokensOf(word).some((t) => TOLERANCE.has(t)) && !toleranceDeclared.has(word.toUpperCase())) toleranceDeclared.set(word.toUpperCase(), s.lineStart);
      }
    }
  }
  let tolerance: number | null = null;
  for (const [name, line] of toleranceDeclared) {
    const word = new RegExp(`(?<![\\w/-])${name.replace(/[/]/g, '\\/')}(?![\\w/])`, 'i');
    // Used means it takes part in the check: a condition reads it, a WHERE filters by it, or a
    // calculation takes it in. Shown in a list or a message, it decides nothing.
    const used = statements.some((st) => {
      const text = maskLiterals(st.text);
      if (!word.test(text)) return false;
      if (/^(?:IF|ELSEIF|CHECK|WHILE|WHEN)$/i.test(st.keyword)) return true;
      if (/\bWHERE\b[\s\S]*$/i.test(text) && word.test(/\bWHERE\b([\s\S]*)$/i.exec(text)?.[1] ?? '')) return true;
      const calc = /^[\w/<>~-]+\s*=\s*([\s\S]+)$/.exec(text.trim());
      return !!calc && word.test(calc[1]);
    });
    if (used && (tolerance === null || line < tolerance)) tolerance = line;
  }
  // A supplier invoice in the code makes the name's "invoice" one.
  const supplier = (found.get('supplier invoices')?.length ?? 0) > 0;
  if (supplier) found.delete('invoices');
  const inName = [...new Set(DOMAIN_OBJECTS
    .filter((o) => nameTokens.some((t) => o.tokens.includes(t)))
    .map((o) => (o.word === 'invoices' && supplier ? 'supplier invoices' : o.word)))];
  const others = [...found.entries()]
    .filter(([word, lines]) => !inName.includes(word) && lines.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || DOMAIN_OBJECTS.findIndex((o) => o.word === a[0]) - DOMAIN_OBJECTS.findIndex((o) => o.word === b[0]))
    .map(([word]) => word);
  // "goods movements" is the technical side of "goods receipts": one of the two is said.
  const objects = [...inName, ...others].filter((w, i, all) => !(w === 'goods movements' && all.includes('goods receipts'))).slice(0, 3);
  if (objects.length === 0) return null;

  let phrase: string;
  // "Checks A against B": only when the program's name names A — "freight rate check" is not a check of deliveries.
  const subject = (verb === 'checks' || verb === 'compares') && objects.length > 1 ? CHECKED.find((c) => inName.includes(c)) : undefined;
  if (subject) {
    const rank = (word: string) => DOMAIN_OBJECTS.findIndex((o) => o.word === word);
    const against = objects.filter((o) => o !== subject).sort((a, b) => rank(a) - rank(b));
    phrase = `${verb} ${subject} against ${joinAnd(against)}`;
  } else phrase = `${verb} ${joinAnd(objects)}`;
  if (tolerance !== null) phrase += ', within a tolerance';
  const lines = [head.lineStart, ...objects.map((o) => found.get(o)?.[0]).filter((l): l is number => typeof l === 'number'), ...(tolerance !== null ? [tolerance] : [])];
  return { text: `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`, lines: [...new Set(lines)], objects };
}
