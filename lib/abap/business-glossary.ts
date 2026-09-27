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

  // --- SAP-Standardfelder (Datenelemente), modulübergreifend -------------
  //
  // Quelle: die Kurzbeschreibungen der SAP-Standard-Datenelemente im ABAP
  // Dictionary (SE11) bzw. im SAP Help Portal, auf das fachliche Wort
  // verkürzt. Aufgenommen sind die gängigen Schlüssel- und Mengenfelder der
  // Kernmodule — nicht Felder, die zufällig in einem Testfall stehen, und kein
  // kundeneigenes (Z/Y) Feld. Ein Feld, das hier fehlt, bleibt im Satz, wie
  // es im Quelltext heißt.
  matnr: term('Materialnummer', 'Materialnummern'),
  werks: term('Werk', 'Werke'),
  lgort: term('Lagerort', 'Lagerorte'),
  charg: term('Charge', 'Chargen'),
  menge: term('Menge', 'Mengen'),
  meins: term('Mengeneinheit', 'Mengeneinheiten'),
  waers: term('Währung', 'Währungen'),
  waerk: term('Belegwährung', 'Belegwährungen'),
  posnr: term('Positionsnummer', 'Positionsnummern'),
  ebeln: term('Bestellnummer', 'Bestellnummern'),
  ebelp: term('Bestellposition', 'Bestellpositionen'),
  banfn: term('Bestellanforderungsnummer', 'Bestellanforderungsnummern'),
  lifnr: term('Lieferantennummer', 'Lieferantennummern'),
  belnr: term('Belegnummer', 'Belegnummern'),
  gjahr: term('Geschäftsjahr', 'Geschäftsjahre'),
  budat: term('Buchungsdatum', 'Buchungsdaten'),
  bldat: term('Belegdatum', 'Belegdaten'),
  hkont: term('Sachkonto', 'Sachkonten'),
  saknr: term('Sachkonto', 'Sachkonten'),
  kostl: term('Kostenstelle', 'Kostenstellen'),
  prctr: term('Profitcenter', 'Profitcenter'),
  kokrs: term('Kostenrechnungskreis', 'Kostenrechnungskreise'),
  aufnr: term('Auftragsnummer', 'Auftragsnummern'),
  ekorg: term('Einkaufsorganisation', 'Einkaufsorganisationen'),
  ekgrp: term('Einkäufergruppe', 'Einkäufergruppen'),
  bwart: term('Bewegungsart', 'Bewegungsarten'),
  mblnr: term('Materialbelegnummer', 'Materialbelegnummern'),
  pernr: term('Personalnummer', 'Personalnummern'),
  equnr: term('Equipmentnummer', 'Equipmentnummern'),
  qmnum: term('Meldungsnummer', 'Meldungsnummern'),
  vornr: term('Vorgangsnummer', 'Vorgangsnummern'),
  arbpl: term('Arbeitsplatz', 'Arbeitsplätze'),
  abgru: term('Absagegrund', 'Absagegründe'),
  faksk: term('Fakturasperre', 'Fakturasperren'),
  aufsd: term('Auftragssperre', 'Auftragssperren'),
  loevm: term('Löschvormerkung', 'Löschvormerkungen'),
  kwmeng: term('Auftragsmenge', 'Auftragsmengen'),
  lfimg: term('Liefermenge', 'Liefermengen'),
  vstel: term('Versandstelle', 'Versandstellen'),
  spras: term('Sprache', 'Sprachen'),
  ernam: term('Erfasser', 'Erfasser'),
  erdat: term('Anlagedatum', 'Anlagedaten'),
  aedat: term('Änderungsdatum', 'Änderungsdaten'),
  dmbtr: term('Betrag in Hauswährung', 'Beträge in Hauswährung'),
  wrbtr: term('Betrag in Belegwährung', 'Beträge in Belegwährung'),
  shkzg: term('Soll/Haben-Kennzeichen', 'Soll/Haben-Kennzeichen'),
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

  // --- SAP-Standardtabellen, je Modul die gängigen -----------------------
  //
  // Quelle: die Kurzbeschreibungen der Tabellen im ABAP Dictionary (SE11) und
  // die Tabellenübersichten der Module im SAP Help Portal, auf das fachliche
  // Wort gebracht. Aufgenommen sind je Modul die Stamm- und Belegtabellen,
  // die in fast jedem Kundencode vorkommen — keine Auswahl nach Testfällen und
  // keine kundeneigene (Z/Y) Tabelle.
  //
  // Vertrieb (SD)
  vbap: term('Auftragsposition', 'Auftragspositionen', 'Auftragsposition'),
  vbep: term('Einteilung', 'Einteilungen', 'Einteilung'),
  vbpa: term('Belegpartner', 'Belegpartner', 'Belegpartners'),
  vbfa: term('Belegfluss-Satz', 'Belegfluss-Sätze', 'Belegfluss-Satzes'),
  likp: term('Lieferung', 'Lieferungen', 'Lieferung'),
  lips: term('Lieferposition', 'Lieferpositionen', 'Lieferposition'),
  vbrk: term('Faktura', 'Fakturen', 'Faktura'),
  vbrp: term('Fakturaposition', 'Fakturapositionen', 'Fakturaposition'),
  konv: term('Konditionssatz', 'Konditionssätze', 'Konditionssatzes'),
  knvp: term('Kundenpartner', 'Kundenpartner', 'Kundenpartners'),
  // Materialwirtschaft (MM)
  mara: term('Material', 'Materialien', 'Materials'),
  makt: term('Materialkurztext', 'Materialkurztexte', 'Materialkurztexts'),
  marc: term('Werksdatensatz zum Material', 'Werksdatensätze zu Materialien', 'Werksdatensatzes zum Material'),
  mard: term('Lagerortbestand', 'Lagerortbestände', 'Lagerortbestands'),
  mbew: term('Materialbewertung', 'Materialbewertungen', 'Materialbewertung'),
  mkpf: term('Materialbeleg', 'Materialbelege', 'Materialbelegs'),
  mseg: term('Materialbelegposition', 'Materialbelegpositionen', 'Materialbelegposition'),
  mch1: term('Charge', 'Chargen', 'Charge'),
  mcha: term('Charge', 'Chargen', 'Charge'),
  ekko: term('Bestellung', 'Bestellungen', 'Bestellung'),
  ekpo: term('Bestellposition', 'Bestellpositionen', 'Bestellposition'),
  eket: term('Bestelleinteilung', 'Bestelleinteilungen', 'Bestelleinteilung'),
  eban: term('Bestellanforderung', 'Bestellanforderungen', 'Bestellanforderung'),
  lfa1: term('Lieferant', 'Lieferanten', 'Lieferanten'),
  lfb1: term('Lieferant', 'Lieferanten', 'Lieferanten'),
  t001w: term('Werk', 'Werke', 'Werks'),
  t001l: term('Lagerort', 'Lagerorte', 'Lagerorts'),
  // Finanzwesen (FI)
  bkpf: term('Buchhaltungsbeleg', 'Buchhaltungsbelege', 'Buchhaltungsbelegs'),
  bseg: term('Buchhaltungsbelegposition', 'Buchhaltungsbelegpositionen', 'Buchhaltungsbelegposition'),
  acdoca: term('Journalbuchungsposition', 'Journalbuchungspositionen', 'Journalbuchungsposition'),
  bsid: term('offener Debitorenposten', 'offene Debitorenposten', 'offenen Debitorenpostens'),
  bsad: term('ausgeglichener Debitorenposten', 'ausgeglichene Debitorenposten', 'ausgeglichenen Debitorenpostens'),
  bsik: term('offener Kreditorenposten', 'offene Kreditorenposten', 'offenen Kreditorenpostens'),
  bsak: term('ausgeglichener Kreditorenposten', 'ausgeglichene Kreditorenposten', 'ausgeglichenen Kreditorenpostens'),
  bsis: term('offener Sachkontenposten', 'offene Sachkontenposten', 'offenen Sachkontenpostens'),
  bsas: term('ausgeglichener Sachkontenposten', 'ausgeglichene Sachkontenposten', 'ausgeglichenen Sachkontenpostens'),
  ska1: term('Sachkonto', 'Sachkonten', 'Sachkontos'),
  skb1: term('Sachkonto', 'Sachkonten', 'Sachkontos'),
  t001: term('Buchungskreis', 'Buchungskreise', 'Buchungskreises'),
  tcurr: term('Wechselkurs', 'Wechselkurse', 'Wechselkurses'),
  // Controlling (CO)
  csks: term('Kostenstelle', 'Kostenstellen', 'Kostenstelle'),
  cska: term('Kostenart', 'Kostenarten', 'Kostenart'),
  cepc: term('Profitcenter', 'Profitcenter', 'Profitcenters'),
  aufk: term('Auftragsstammsatz', 'Auftragsstammsätze', 'Auftragsstammsatzes'),
  // Produktion (PP)
  afko: term('Fertigungsauftrag', 'Fertigungsaufträge', 'Fertigungsauftrags'),
  afpo: term('Fertigungsauftragsposition', 'Fertigungsauftragspositionen', 'Fertigungsauftragsposition'),
  afvc: term('Vorgang', 'Vorgänge', 'Vorgangs'),
  resb: term('Reservierungsposition', 'Reservierungspositionen', 'Reservierungsposition'),
  stko: term('Stückliste', 'Stücklisten', 'Stückliste'),
  stpo: term('Stücklistenposition', 'Stücklistenpositionen', 'Stücklistenposition'),
  plko: term('Arbeitsplan', 'Arbeitspläne', 'Arbeitsplans'),
  crhd: term('Arbeitsplatz', 'Arbeitsplätze', 'Arbeitsplatzes'),
  // Instandhaltung und Qualität (PM/QM)
  equi: term('Equipment', 'Equipments', 'Equipments'),
  iflot: term('Technischer Platz', 'Technische Plätze', 'Technischen Platzes'),
  qmel: term('Meldung', 'Meldungen', 'Meldung'),
  afih: term('Instandhaltungsauftrag', 'Instandhaltungsaufträge', 'Instandhaltungsauftrags'),
  imptt: term('Messpunkt', 'Messpunkte', 'Messpunkts'),
  imrg: term('Messbeleg', 'Messbelege', 'Messbelegs'),
  qals: term('Prüflos', 'Prüflose', 'Prüfloses'),
  // Logistik-Ausführung (LE/WM)
  vttk: term('Transport', 'Transporte', 'Transports'),
  vttp: term('Transportposition', 'Transportpositionen', 'Transportposition'),
  ltak: term('Transportauftrag', 'Transportaufträge', 'Transportauftrags'),
  ltap: term('Transportauftragsposition', 'Transportauftragspositionen', 'Transportauftragsposition'),
  lqua: term('Quant', 'Quants', 'Quants'),
  lagp: term('Lagerplatz', 'Lagerplätze', 'Lagerplatzes'),
  // Personal (HR)
  pa0000: term('Personalmaßnahme', 'Personalmaßnahmen', 'Personalmaßnahme'),
  pa0001: term('Organisatorische Zuordnung', 'Organisatorische Zuordnungen', 'Organisatorischen Zuordnung'),
  pa0002: term('Satz Personaldaten', 'Sätze Personaldaten', 'Satzes Personaldaten'),
  pa0008: term('Satz Basisbezüge', 'Sätze Basisbezüge', 'Satzes Basisbezüge'),
  // Übergreifend (Basis, Geschäftspartner, Adressen, Nachrichten, IDoc)
  but000: term('Geschäftspartner', 'Geschäftspartner', 'Geschäftspartners'),
  adrc: term('Adresse', 'Adressen', 'Adresse'),
  adr6: term('E-Mail-Adresse', 'E-Mail-Adressen', 'E-Mail-Adresse'),
  tvarvc: term('Variableneintrag', 'Variableneinträge', 'Variableneintrags'),
  t100: term('Meldungstext', 'Meldungstexte', 'Meldungstexts'),
  jest: term('Objektstatus', 'Objektstatus', 'Objektstatus'),
  nast: term('Nachricht', 'Nachrichten', 'Nachricht'),
  edidc: term('IDoc-Kontrollsatz', 'IDoc-Kontrollsätze', 'IDoc-Kontrollsatzes'),
  edid4: term('IDoc-Datensatz', 'IDoc-Datensätze', 'IDoc-Datensatzes'),
  tbtco: term('Hintergrundjob', 'Hintergrundjobs', 'Hintergrundjobs'),
});

/** Das grammatische Geschlecht der Tabellenwörter oben, für den Artikel im Genitiv. */
const TABLE_GENUS: Readonly<Record<string, Genus>> = Object.freeze({
  Kunde: 'm', Benutzer: 'm', Auftrag: 'm', Fall: 'm',
  Auftragsposition: 'f', Einteilung: 'f', Belegpartner: 'm', 'Belegfluss-Satz': 'm', Lieferung: 'f',
  Lieferposition: 'f', Faktura: 'f', Fakturaposition: 'f', Konditionssatz: 'm', Kundenpartner: 'm',
  Material: 'n', Materialkurztext: 'm', 'Werksdatensatz zum Material': 'm', Lagerortbestand: 'm',
  Materialbewertung: 'f', Materialbeleg: 'm', Materialbelegposition: 'f', Charge: 'f', Bestellung: 'f',
  Bestellposition: 'f', Bestelleinteilung: 'f', Bestellanforderung: 'f', Lieferant: 'm', Werk: 'n', Lagerort: 'm',
  Buchhaltungsbeleg: 'm', Buchhaltungsbelegposition: 'f', Journalbuchungsposition: 'f',
  'offener Debitorenposten': 'm', 'ausgeglichener Debitorenposten': 'm', 'offener Kreditorenposten': 'm',
  'ausgeglichener Kreditorenposten': 'm', 'offener Sachkontenposten': 'm', 'ausgeglichener Sachkontenposten': 'm',
  Sachkonto: 'n', Buchungskreis: 'm', Wechselkurs: 'm', Kostenstelle: 'f', Kostenart: 'f', Profitcenter: 'n',
  Auftragsstammsatz: 'm', Fertigungsauftrag: 'm', Fertigungsauftragsposition: 'f', Vorgang: 'm',
  Reservierungsposition: 'f', Stückliste: 'f', Stücklistenposition: 'f', Arbeitsplan: 'm', Arbeitsplatz: 'm',
  Equipment: 'n', 'Technischer Platz': 'm', Meldung: 'f', Instandhaltungsauftrag: 'm', Messpunkt: 'm',
  Messbeleg: 'm', Prüflos: 'n', Transport: 'm', Transportposition: 'f', Transportauftrag: 'm',
  Transportauftragsposition: 'f', Quant: 'n', Lagerplatz: 'm', Personalmaßnahme: 'f',
  'Organisatorische Zuordnung': 'f', 'Satz Personaldaten': 'm', 'Satz Basisbezüge': 'm', Geschäftspartner: 'm',
  Adresse: 'f', 'E-Mail-Adresse': 'f', Variableneintrag: 'm', Meldungstext: 'm', Objektstatus: 'm',
  Nachricht: 'f', 'IDoc-Kontrollsatz': 'm', 'IDoc-Datensatz': 'm', Hintergrundjob: 'm',
});

/** „des Kunden", „der Bestellung" — der Genitiv mit dem Artikel, den das Wort verlangt. */
export function genitivePhrase(entity: BusinessTerm): string {
  return `${TABLE_GENUS[entity.singular] === 'f' ? 'der' : 'des'} ${entity.genitive}`;
}

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
  const raw = identifier.trim().replace(/<([A-Za-z0-9_]+)>/g, '$1').replace(/^[@<]+/, '').replace(/[>]+$/, '');
  return term(raw, raw);
}

/** Die fachliche Menge hinter einem Tabellen- oder Entitätsnamen. */
export function tableTerm(name: string): BusinessTerm | null {
  return TABLE_TERMS[name.trim().toLowerCase()] ?? null;
}

/** Ob das Wörterbuch einen Bezeichner kennt — dann trägt er ein Fachwort. */
export function isKnownField(identifier: string): boolean {
  return FIELD_TERMS[stemOf(identifier)] !== undefined;
}

/**
 * Das grammatische Geschlecht der Fachwörter oben, nach dem Singular.
 *
 * Es steht hier, weil ein Satz vor einem Fachwort einen Artikel braucht und
 * „die return_code" oder „die Funktionsbaustein" kein Deutsch ist. Geraten wird
 * auch hier nichts: ein Wort ohne Eintrag bekommt keinen Artikel, sondern die
 * neutrale Form „das Feld …" (`nounPhrase`).
 */
export type Genus = 'm' | 'f' | 'n';

const GENUS: Readonly<Record<string, Genus>> = Object.freeze({
  Kundennummer: 'f',
  Name: 'm',
  Länderschlüssel: 'm',
  Buchungskreis: 'm',
  Abstimmkonto: 'n',
  Verkaufsorganisation: 'f',
  Vertriebsweg: 'm',
  Sparte: 'f',
  Mandant: 'm',
  Benutzername: 'm',
  'Kennwort-Hash': 'm',
  Sperrstatus: 'm',
  Belegnummer: 'f',
  Auftragsart: 'f',
  Nettowert: 'm',
  Sperrkennzeichen: 'n',
  Betrag: 'm',
  Route: 'f',
  Status: 'm',
  Anzahl: 'f',
  Summe: 'f',
  Mindestwert: 'm',
  Wert: 'm',
  Text: 'm',
  Schlüssel: 'm',
  Fall: 'm',
  'Review-Markierung': 'f',
  Listtitel: 'm',
  Tabelle: 'f',
  Funktionsbaustein: 'm',
  Programm: 'n',
  Unterprogramm: 'n',
  Destination: 'f',
  Feld: 'n',
  Zeile: 'f',
  Ergebnis: 'n',
  Regel: 'f',
  Benutzer: 'm',
  Typ: 'm',
  Prädikat: 'n',
  Materialnummer: 'f',
  Werk: 'n',
  Lagerort: 'm',
  Charge: 'f',
  Menge: 'f',
  Mengeneinheit: 'f',
  Währung: 'f',
  Belegwährung: 'f',
  Positionsnummer: 'f',
  Bestellnummer: 'f',
  Bestellposition: 'f',
  Bestellanforderungsnummer: 'f',
  Lieferantennummer: 'f',
  Geschäftsjahr: 'n',
  Buchungsdatum: 'n',
  Belegdatum: 'n',
  Sachkonto: 'n',
  Kostenstelle: 'f',
  Profitcenter: 'n',
  Kostenrechnungskreis: 'm',
  Auftragsnummer: 'f',
  Einkaufsorganisation: 'f',
  Einkäufergruppe: 'f',
  Bewegungsart: 'f',
  Materialbelegnummer: 'f',
  Personalnummer: 'f',
  Equipmentnummer: 'f',
  Meldungsnummer: 'f',
  Vorgangsnummer: 'f',
  Arbeitsplatz: 'm',
  Absagegrund: 'm',
  Fakturasperre: 'f',
  Auftragssperre: 'f',
  Löschvormerkung: 'f',
  Auftragsmenge: 'f',
  Liefermenge: 'f',
  Versandstelle: 'f',
  Sprache: 'f',
  Erfasser: 'm',
  Anlagedatum: 'n',
  Änderungsdatum: 'n',
  'Betrag in Hauswährung': 'm',
  'Betrag in Belegwährung': 'm',
  'Soll/Haben-Kennzeichen': 'n',
});

const ARTICLES: Readonly<Record<'nom' | 'akk' | 'dat', Readonly<Record<Genus, string>>>> = Object.freeze({
  nom: { m: 'der', f: 'die', n: 'das' },
  akk: { m: 'den', f: 'die', n: 'das' },
  dat: { m: 'dem', f: 'der', n: 'dem' },
});

/**
 * Ein Bezeichner als Nominalgruppe mit Artikel, im verlangten Fall.
 *
 * Ein Fachwort mit bekanntem Geschlecht bekommt seinen Artikel („der Betrag",
 * „die Kundennummer"); alles andere heißt „das Feld lv_x" — das ist wahr für
 * jeden Bezeichner und errät kein Geschlecht.
 */
export function nounPhrase(identifier: string, kasus: 'nom' | 'akk' | 'dat' = 'nom'): string {
  const word = termFor(identifier);
  const genus = isKnownField(identifier) ? GENUS[word.singular] : undefined;
  if (genus) return `${ARTICLES[kasus][genus]} ${word.singular}`;
  const raw = identifier.trim().replace(/<([A-Za-z0-9_]+)>/g, '$1').replace(/^[@<]+/, '').replace(/[>]+$/, '');
  return `${ARTICLES[kasus].n} Feld ${raw}`;
}
