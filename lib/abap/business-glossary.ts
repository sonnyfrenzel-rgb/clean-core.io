/**
 * Das Wörterbuch, das aus einem ABAP-Bezeichner ein **fachliches** Wort macht.
 *
 * Roadmap 17.7, Forderung 1 (Sonny, 23.09.2026): der Satz muss den Code für
 * einen Fachbereichsmenschen verständlich machen — nicht „SELECT auf KNA1",
 * sondern was fachlich geschieht. Genau daran hängt dieses Modul: `KNA1` sind
 * Kunden, `LAND1` ist ein Länderschlüssel, `NETWR` ein Nettowert.
 *
 * **Eine Übersetzung ist eine Auslegung, und sie steht deshalb hier, sichtbar
 * und vollständig, statt in einem Satzbaustein zu verschwinden** — dasselbe
 * Prinzip wie `RULE_BRIDGES` und `STATEMENT_STOPWORDS` im Korpus-Vergleicher.
 * Wer eine Zeile für falsch hält, findet sie an einer Stelle und kann sie
 * belegen oder streichen.
 *
 * **Die ehrliche Grenze:** die Liste ist am Referenzkorpus gewachsen und
 * deckt dessen Felder. Ein unbekannter Bezeichner wird **nicht** geraten — er
 * steht so im Satz, wie der Quelltext ihn schreibt (das ist dann derselbe
 * wörtliche Umgang wie Regel 6 im Skelett), und die Stelle bleibt damit
 * belegbar statt erfunden.
 *
 * Kein Import, keine Abhängigkeit: reine Daten, damit auch eine
 * Client-Komponente sie lesen kann.
 */

export interface BusinessTerm {
  /** Wie ein Fachsatz die Sache in der Einzahl nennt. */
  singular: string;
  /** Die Mehrzahl — Deutsch beugt, und ein Dice-Maß sieht den Unterschied. */
  plural: string;
  /**
   * Der Genitiv Singular („des Falls", „des Kunden").
   *
   * Er steht hier, weil „die Route eines Fall" kein deutscher Satz ist und ein
   * Fachbereichsmensch bei so etwas aufhört zu lesen. Ohne Angabe wird er
   * nicht gebildet, sondern es bleibt beim Nominativ — geraten wird auch in
   * der Grammatik nichts.
   */
  genitive: string;
}

const term = (singular: string, plural: string, genitive?: string): BusinessTerm => ({
  singular,
  plural,
  genitive: genitive ?? singular,
});

/**
 * Datenbankfelder und Variablenstämme → Fachwort.
 *
 * Der Schlüssel ist kleingeschrieben und ohne die üblichen ABAP-Präfixe
 * (`lv_`, `gv_`, `ls_`, `iv_`, `p_` …), die `stemOf` abschneidet.
 */
export const FIELD_TERMS: Readonly<Record<string, BusinessTerm>> = Object.freeze({
  kunnr: term('Kundennummer', 'Kundennummern'),
  customer: term('Kundennummer', 'Kundennummern'),
  name1: term('Name', 'Namen'),
  customername: term('Name', 'Namen'),
  name: term('Name', 'Namen'),
  land1: term('Länderschlüssel', 'Länderschlüssel'),
  land: term('Länderschlüssel', 'Länderschlüssel'),
  country: term('Länderschlüssel', 'Länderschlüssel'),
  bukrs: term('Buchungskreis', 'Buchungskreise'),
  akont: term('Abstimmkonto', 'Abstimmkonten'),
  vkorg: term('Verkaufsorganisation', 'Verkaufsorganisationen'),
  vtweg: term('Vertriebsweg', 'Vertriebswege'),
  spart: term('Sparte', 'Sparten'),
  mandt: term('Mandant', 'Mandanten'),
  bname: term('Benutzername', 'Benutzernamen'),
  bcode: term('Kennwort-Hash', 'Kennwort-Hashes'),
  uflag: term('Sperrstatus', 'Sperrstatus'),
  vbeln: term('Belegnummer', 'Belegnummern'),
  auart: term('Auftragsart', 'Auftragsarten'),
  netwr: term('Nettowert', 'Nettowerte'),
  lifsk: term('Sperrkennzeichen', 'Sperrkennzeichen'),
  amount: term('Betrag', 'Beträge'),
  amt: term('Betrag', 'Beträge'),
  betrag: term('Betrag', 'Beträge'),
  route: term('Route', 'Routen'),
  status: term('Status', 'Status'),
  count: term('Anzahl', 'Anzahlen'),
  sum: term('Summe', 'Summen'),
  min: term('Mindestwert', 'Mindestwerte'),
  value: term('Wert', 'Werte'),
  text: term('Text', 'Texte'),
  key: term('Schlüssel', 'Schlüssel'),
  keys: term('Schlüssel', 'Schlüssel'),
  id: term('Fall', 'Fälle'),
  case_id: term('Fall', 'Fälle'),
  case: term('Fall', 'Fälle'),
  review: term('Review-Markierung', 'Review-Markierungen'),
  title: term('Listtitel', 'Listtitel'),
  tab: term('Tabelle', 'Tabellen'),
  func: term('Funktionsbaustein', 'Funktionsbausteine'),
  function: term('Funktionsbaustein', 'Funktionsbausteine'),
  prog: term('Programm', 'Programme'),
  form: term('Unterprogramm', 'Unterprogramme'),
  dest: term('Destination', 'Destinationen'),
  field: term('Feld', 'Felder'),
  rows: term('Zeile', 'Zeilen'),
  row: term('Zeile', 'Zeilen'),
  result: term('Ergebnis', 'Ergebnisse'),
  total: term('Summe', 'Summen'),
  rule: term('Regel', 'Regeln'),
  user: term('Benutzer', 'Benutzer'),
  type: term('Typ', 'Typen'),
  where: term('Prädikat', 'Prädikate'),
});

/**
 * Datenbanktabellen und Lesemodelle → die fachliche Menge dahinter.
 *
 * Ein Fachbereichsmensch liest „Kunden", nicht „KNA1". Der technische Name
 * bleibt im Anker und in der Evidenz; er verschwindet nicht, er steht nur
 * nicht im Satz.
 */
export const TABLE_TERMS: Readonly<Record<string, BusinessTerm>> = Object.freeze({
  kna1: term('Kunde', 'Kunden', 'Kunden'),
  knb1: term('Kunde', 'Kunden', 'Kunden'),
  knvv: term('Kunde', 'Kunden', 'Kunden'),
  i_customer: term('Kunde', 'Kunden', 'Kunden'),
  usr02: term('Benutzer', 'Benutzer', 'Benutzers'),
  vbak: term('Auftrag', 'Aufträge', 'Auftrags'),
  zi_order: term('Auftrag', 'Aufträge', 'Auftrags'),
  zcc_decision: term('Fall', 'Fälle', 'Falls'),
  zcc_case: term('Fall', 'Fälle', 'Falls'),
});

/** Die ABAP-Präfixe, die über die Sache nichts sagen — nur über die Sichtbarkeit. */
const PREFIXES = ['lv_', 'gv_', 'ls_', 'lt_', 'gt_', 'gs_', 'iv_', 'ev_', 'cv_', 'rv_', 'it_', 'et_', 'ct_', 'rt_', 'is_', 'es_', 'cs_', 'rs_', 'lo_', 'go_', 'io_', 'ro_', 'p_', 's_'];

/**
 * Der Stamm eines Bezeichners: ohne Präfix, ohne Strukturvorsatz.
 *
 * `ls_customer-kunnr` → `kunnr`, `lv_count` → `count`, `p_land` → `land`.
 * Der Feldname hinter dem Bindestrich gewinnt, weil er die Sache benennt und
 * die Struktur nur sagt, wo sie gerade liegt.
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
 * Das Fachwort zu einem Bezeichner — oder der Bezeichner selbst.
 *
 * **Nie geraten.** Steht der Stamm nicht im Wörterbuch, trägt der Satz den
 * Namen, den der Quelltext schreibt. Das ist unschöner und belegbar; eine
 * erfundene Fachbezeichnung wäre schöner und falsch.
 */
export function termFor(identifier: string): BusinessTerm {
  const stem = stemOf(identifier);
  const hit = FIELD_TERMS[stem];
  if (hit) return hit;
  const raw = identifier.trim().replace(/^[@<]+/, '').replace(/[>]+$/, '');
  return term(raw, raw);
}

/** Die fachliche Menge hinter einem Tabellen- oder Entitätsnamen. */
export function tableTerm(name: string): BusinessTerm | null {
  return TABLE_TERMS[name.trim().toLowerCase()] ?? null;
}
