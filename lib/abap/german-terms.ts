/**
 * German ABAP names in English — deterministic, no model.
 *
 * A lot of customer ABAP is written in German: `FORM daten_lesen`,
 * `PERFORM status_erledigt_setzen`, `gt_ausgabe`, `MESSAGE 'Keine Daten
 * gefunden'`. The plain-language layer (`plain-language.ts`) turned those into
 * "Daten lesen", "Any ausgabes?" — German, or worse, German words with English
 * grammar glued on. Product text is English (owner decision 01.10.2026), so
 * this module translates such a name word by word from a written-down
 * vocabulary and puts the words into English order.
 *
 * Rules that hold everywhere:
 *
 * - **Only what is listed is translated.** Every German word below is an
 *   interpretation and stands here, where it can be checked or struck out.
 * - **No pseudo-words.** A name with a German word and a word this module does
 *   not know is not half translated: the caller shows the identifier as the
 *   source writes it (`UNTRANSLATABLE`).
 * - **A name without a German word is not touched** (`null`): English names
 *   keep the wording they had before.
 * - **Pure and total.** No imports from the server, no throw; a client
 *   component reads it through `plain-language.ts`.
 *
 * German grammar handled: umlaut spellings (`ae`/`oe`/`ue`/`ss` and the real
 * letters), the verb at the end (`DATEN_LESEN` → "Read data"), a verbal noun at
 * the end (`ALV_AUSGABE` → "Output ALV list"), a state set by the verb
 * (`STATUS_ERLEDIGT_SETZEN` → "Set status to completed"), inflected adjectives
 * (`OFFENE_POSTEN` → "Open items") and compound nouns (`LIEFERDATUM` →
 * "Delivery date", `FELDKATALOG` → "Field catalog").
 */

type Pos = 'verb' | 'noun' | 'action' | 'adj' | 'prep' | 'drop' | 'aux';

interface Entry {
  pos: Pos;
  /** English: the verb for `verb`/`action`, the noun for `noun`, the word otherwise. */
  en: string;
  /** German as a reader writes it: umlauts, nouns capitalised. */
  de: string;
  /** `action` only: the English noun ("processing" for "Verarbeitung"). */
  noun?: string;
  /** What one entry of an internal table of it is called ("output line" for "Ausgabe"). */
  item?: string;
  /** An adjective with a German ending (`Markierte`): used as a noun when nothing else is one. */
  inflected?: boolean;
}

const verb = (en: string, de: string): Entry => ({ pos: 'verb', en, de });
const noun = (en: string, de: string, item?: string): Entry => ({ pos: 'noun', en, de, item });
const action = (en: string, nounForm: string, de: string, item?: string): Entry => ({ pos: 'action', en, noun: nounForm, de, item });
const adj = (en: string, de: string): Entry => ({ pos: 'adj', en, de });
const prep = (en: string, de: string): Entry => ({ pos: 'prep', en, de });
const aux = (en: string, de: string): Entry => ({ pos: 'aux', en, de });

/**
 * German words, keyed in lower case with umlauts spelled out (`ae`, `oe`,
 * `ue`, `ss`) — the way an ABAP identifier writes them. Words that are also
 * English words (`status`, `material`, `test`, `brief`, `art`, `tag` …) are not
 * here on purpose: they would make an English name look German.
 */
const WORDS: Readonly<Record<string, Entry>> = Object.freeze({
  // --- verbs (infinitive, and the imperative a routine name often uses) ---
  lesen: verb('read', 'lesen'), lese: verb('read', 'lese'),
  einlesen: verb('read', 'einlesen'), auslesen: verb('read', 'auslesen'),
  holen: verb('get', 'holen'), hole: verb('get', 'hole'), abholen: verb('get', 'abholen'),
  laden: verb('load', 'laden'), hochladen: verb('upload', 'hochladen'), herunterladen: verb('download', 'herunterladen'),
  aufbereiten: verb('prepare', 'aufbereiten'), vorbereiten: verb('prepare', 'vorbereiten'),
  aufbauen: verb('build', 'aufbauen'), erstellen: verb('create', 'erstellen'), erstelle: verb('create', 'erstelle'),
  erzeugen: verb('generate', 'erzeugen'), anlegen: verb('create', 'anlegen'), generieren: verb('generate', 'generieren'),
  ausgeben: verb('output', 'ausgeben'), anzeigen: verb('display', 'anzeigen'), zeige: verb('display', 'zeige'),
  darstellen: verb('display', 'darstellen'), drucken: verb('print', 'drucken'), drucke: verb('print', 'drucke'),
  setzen: verb('set', 'setzen'), setze: verb('set', 'setze'),
  aendern: verb('change', 'ändern'), aendere: verb('change', 'ändere'),
  pruefen: verb('check', 'prüfen'), pruefe: verb('check', 'prüfe'), ueberpruefen: verb('check', 'überprüfen'),
  validieren: verb('validate', 'validieren'), plausibilisieren: verb('validate', 'plausibilisieren'),
  speichern: verb('save', 'speichern'), speichere: verb('save', 'speichere'), sichern: verb('save', 'sichern'),
  schreiben: verb('write', 'schreiben'), schreibe: verb('write', 'schreibe'),
  loeschen: verb('delete', 'löschen'), loesche: verb('delete', 'lösche'), entfernen: verb('remove', 'entfernen'),
  buchen: verb('post', 'buchen'), buche: verb('post', 'buche'), verbuchen: verb('post', 'verbuchen'),
  umbuchen: verb('transfer', 'umbuchen'), stornieren: verb('reverse', 'stornieren'),
  senden: verb('send', 'senden'), sende: verb('send', 'sende'), versenden: verb('send', 'versenden'),
  verschicken: verb('send', 'verschicken'), schicken: verb('send', 'schicken'), empfangen: verb('receive', 'empfangen'),
  berechnen: verb('calculate', 'berechnen'), berechne: verb('calculate', 'berechne'), rechnen: verb('calculate', 'rechnen'),
  kalkulieren: verb('calculate', 'kalkulieren'), ermitteln: verb('determine', 'ermitteln'), ermittle: verb('determine', 'ermittle'),
  bestimmen: verb('determine', 'bestimmen'), initialisieren: verb('initialize', 'initialisieren'),
  verarbeiten: verb('process', 'verarbeiten'), verarbeite: verb('process', 'verarbeite'), bearbeiten: verb('process', 'bearbeiten'),
  sperren: verb('lock', 'sperren'), entsperren: verb('unlock', 'entsperren'),
  freigeben: verb('release', 'freigeben'), genehmigen: verb('approve', 'genehmigen'), ablehnen: verb('reject', 'ablehnen'),
  abbrechen: verb('cancel', 'abbrechen'), beenden: verb('finish', 'beenden'), starten: verb('start', 'starten'),
  aufrufen: verb('call', 'aufrufen'), ausfuehren: verb('run', 'ausführen'),
  uebertragen: verb('transfer', 'übertragen'), uebernehmen: verb('take over', 'übernehmen'),
  selektieren: verb('select', 'selektieren'), auswaehlen: verb('select', 'auswählen'), waehlen: verb('select', 'wählen'),
  suchen: verb('search', 'suchen'), finden: verb('find', 'finden'), sortieren: verb('sort', 'sortieren'),
  sammeln: verb('collect', 'sammeln'), zuordnen: verb('assign', 'zuordnen'), verteilen: verb('distribute', 'verteilen'),
  vergleichen: verb('compare', 'vergleichen'), zaehlen: verb('count', 'zählen'), summieren: verb('add up', 'summieren'),
  kopieren: verb('copy', 'kopieren'), mischen: verb('merge', 'mischen'), zusammenfassen: verb('summarize', 'zusammenfassen'),
  aktualisieren: verb('update', 'aktualisieren'), fuellen: verb('fill', 'füllen'), befuellen: verb('fill', 'befüllen'),
  leeren: verb('clear', 'leeren'), zuruecksetzen: verb('reset', 'zurücksetzen'), pflegen: verb('maintain', 'pflegen'),
  erfassen: verb('record', 'erfassen'), eingeben: verb('enter', 'eingeben'), informieren: verb('notify', 'informieren'),
  benachrichtigen: verb('notify', 'benachrichtigen'), archivieren: verb('archive', 'archivieren'),
  protokollieren: verb('log', 'protokollieren'), melden: verb('report', 'melden'), rueckmelden: verb('confirm', 'rückmelden'),
  quittieren: verb('acknowledge', 'quittieren'), schliessen: verb('close', 'schließen'), oeffnen: verb('open', 'öffnen'),
  konvertieren: verb('convert', 'konvertieren'), umsetzen: verb('convert', 'umsetzen'), umrechnen: verb('convert', 'umrechnen'),
  umschluesseln: verb('re-map', 'umschlüsseln'), formatieren: verb('format', 'formatieren'), aufteilen: verb('split', 'aufteilen'),
  einplanen: verb('schedule', 'einplanen'), planen: verb('plan', 'planen'), anfordern: verb('request', 'anfordern'),
  bestellen: verb('order', 'bestellen'), liefern: verb('deliver', 'liefern'), fakturieren: verb('bill', 'fakturieren'),
  abrechnen: verb('settle', 'abrechnen'), mahnen: verb('dun', 'mahnen'), zahlen: verb('pay', 'zahlen'),
  bewerten: verb('valuate', 'bewerten'), reservieren: verb('reserve', 'reservieren'), vormerken: verb('earmark', 'vormerken'),
  entscheiden: verb('decide', 'entscheiden'), klassifizieren: verb('classify', 'klassifizieren'),
  markieren: verb('mark', 'markieren'), kennzeichnen: verb('mark', 'kennzeichnen'), ergaenzen: verb('add', 'ergänzen'),
  anreichern: verb('enrich', 'anreichern'), hinzufuegen: verb('add', 'hinzufügen'), einfuegen: verb('insert', 'einfügen'),
  anhaengen: verb('append', 'anhängen'), verknuepfen: verb('link', 'verknüpfen'), ersetzen: verb('replace', 'ersetzen'),
  wiederholen: verb('repeat', 'wiederholen'), ueberspringen: verb('skip', 'überspringen'), warten: verb('wait', 'warten'),
  zuruecknehmen: verb('withdraw', 'zurücknehmen'), verlaengern: verb('extend', 'verlängern'),

  // --- verbal nouns: a verb when they stand alone, a noun next to a verb ---
  ausgabe: action('output', 'output', 'Ausgabe', 'output line'),
  eingabe: action('enter', 'input', 'Eingabe', 'input line'),
  anzeige: action('display', 'display', 'Anzeige'),
  pruefung: action('check', 'check', 'Prüfung'),
  vorpruefung: action('pre-check', 'pre-check', 'Vorprüfung'),
  verarbeitung: action('process', 'processing', 'Verarbeitung'),
  aufbereitung: action('prepare', 'preparation', 'Aufbereitung'),
  aenderung: action('change', 'change', 'Änderung'),
  ermittlung: action('determine', 'determination', 'Ermittlung'),
  berechnung: action('calculate', 'calculation', 'Berechnung'),
  selektion: action('select', 'selection', 'Selektion'),
  initialisierung: action('initialize', 'initialization', 'Initialisierung'),
  freigabe: action('release', 'release', 'Freigabe'),
  buchung: action('post', 'posting', 'Buchung'),
  umbuchung: action('transfer', 'transfer posting', 'Umbuchung'),
  sperre: action('lock', 'lock', 'Sperre'),
  sperrung: action('lock', 'lock', 'Sperrung'),
  speicherung: action('save', 'saving', 'Speicherung'),
  loeschung: action('delete', 'deletion', 'Löschung'),
  druck: action('print', 'print', 'Druck'),
  zaehlung: action('count', 'count', 'Zählung'),
  bewertung: action('valuate', 'valuation', 'Bewertung'),
  genehmigung: action('approve', 'approval', 'Genehmigung'),
  ablehnung: action('reject', 'rejection', 'Ablehnung'),
  zuordnung: action('assign', 'assignment', 'Zuordnung'),
  abrechnung: action('settle', 'settlement', 'Abrechnung'),
  rueckmeldung: action('confirm', 'confirmation', 'Rückmeldung'),
  zusammenfassung: action('summarize', 'summary', 'Zusammenfassung'),
  aktualisierung: action('update', 'update', 'Aktualisierung'),
  uebertragung: action('transfer', 'transfer', 'Übertragung'),
  archivierung: action('archive', 'archiving', 'Archivierung'),
  stornierung: action('reverse', 'reversal', 'Stornierung'),

  // --- nouns ---
  daten: noun('data', 'Daten', 'data record'),
  stammdaten: noun('master data', 'Stammdaten', 'master record'),
  feldkatalog: noun('field catalog', 'Feldkatalog', 'field catalog entry'),
  katalog: noun('catalog', 'Katalog'),
  feld: noun('field', 'Feld'), felder: noun('fields', 'Felder'),
  liste: noun('list', 'Liste', 'list entry'),
  tabelle: noun('table', 'Tabelle', 'table row'), tabellen: noun('tables', 'Tabellen'),
  zeile: noun('line', 'Zeile'), zeilen: noun('lines', 'Zeilen'), spalte: noun('column', 'Spalte'),
  datum: noun('date', 'Datum'),
  lieferung: noun('delivery', 'Lieferung'), lieferungen: noun('deliveries', 'Lieferungen'),
  lieferant: noun('supplier', 'Lieferant'), lieferanten: noun('suppliers', 'Lieferanten'),
  kreditor: noun('supplier', 'Kreditor'), kreditoren: noun('suppliers', 'Kreditoren'),
  debitor: noun('customer', 'Debitor'), debitoren: noun('customers', 'Debitoren'),
  kunde: noun('customer', 'Kunde'), kunden: noun('customers', 'Kunden'),
  auftrag: noun('order', 'Auftrag'), auftraege: noun('orders', 'Aufträge'),
  bestellung: noun('purchase order', 'Bestellung'), bestellungen: noun('purchase orders', 'Bestellungen'),
  anfrage: noun('inquiry', 'Anfrage'), angebot: noun('quotation', 'Angebot'),
  rechnung: noun('invoice', 'Rechnung'), rechnungen: noun('invoices', 'Rechnungen'),
  gutschrift: noun('credit memo', 'Gutschrift'),
  beleg: noun('document', 'Beleg'), belege: noun('documents', 'Belege'),
  positionen: noun('items', 'Positionen'), posten: noun('items', 'Posten'),
  menge: noun('quantity', 'Menge'), mengen: noun('quantities', 'Mengen'),
  preis: noun('price', 'Preis'), preise: noun('prices', 'Preise'),
  betrag: noun('amount', 'Betrag'), betraege: noun('amounts', 'Beträge'),
  summe: noun('total', 'Summe'), summen: noun('totals', 'Summen'),
  wert: noun('value', 'Wert'), werte: noun('values', 'Werte'),
  waehrung: noun('currency', 'Währung'), konto: noun('account', 'Konto'), konten: noun('accounts', 'Konten'),
  buchungskreis: noun('company code', 'Buchungskreis'), kostenstelle: noun('cost center', 'Kostenstelle'),
  werk: noun('plant', 'Werk'), werke: noun('plants', 'Werke'),
  lager: noun('warehouse', 'Lager'), lagerort: noun('storage location', 'Lagerort'),
  artikel: noun('article', 'Artikel'), materialien: noun('materials', 'Materialien'),
  chargen: noun('batches', 'Chargen'),
  fehler: noun('error', 'Fehler'), meldung: noun('message', 'Meldung'), meldungen: noun('messages', 'Meldungen'),
  nachricht: noun('message', 'Nachricht'), nachrichten: noun('messages', 'Nachrichten'),
  protokoll: noun('log', 'Protokoll', 'log entry'), hinweis: noun('note', 'Hinweis'), warnung: noun('warning', 'Warnung'),
  datei: noun('file', 'Datei'), dateien: noun('files', 'Dateien'), pfad: noun('path', 'Pfad'),
  verzeichnis: noun('directory', 'Verzeichnis'),
  ergebnis: noun('result', 'Ergebnis'), ergebnisse: noun('results', 'Ergebnisse'),
  anzahl: noun('number', 'Anzahl'), zaehler: noun('counter', 'Zähler'), schalter: noun('switch', 'Schalter'),
  kennzeichen: noun('indicator', 'Kennzeichen'), merkmal: noun('characteristic', 'Merkmal'),
  klasse: noun('class', 'Klasse'), typ: noun('type', 'Typ'), grund: noun('reason', 'Grund'),
  kurztext: noun('short text', 'Kurztext'), langtext: noun('long text', 'Langtext'), bezeichnung: noun('description', 'Bezeichnung'),
  adresse: noun('address', 'Adresse'), benutzer: noun('user', 'Benutzer'), mitarbeiter: noun('employee', 'Mitarbeiter'),
  abteilung: noun('department', 'Abteilung'), kosten: noun('costs', 'Kosten'),
  vertrag: noun('contract', 'Vertrag'), vertraege: noun('contracts', 'Verträge'),
  projekt: noun('project', 'Projekt'), projekte: noun('projects', 'Projekte'),
  empfaenger: noun('recipient', 'Empfänger'), absender: noun('sender', 'Absender'),
  berechtigung: noun('authorization', 'Berechtigung'), zahlung: noun('payment', 'Zahlung'), zahlungen: noun('payments', 'Zahlungen'),
  mahnung: noun('dunning notice', 'Mahnung'), bankverbindung: noun('bank details', 'Bankverbindung'),
  steuer: noun('tax', 'Steuer'), steuern: noun('taxes', 'Steuern'),
  zeitraum: noun('period', 'Zeitraum'), periode: noun('period', 'Periode'), monat: noun('month', 'Monat'),
  jahr: noun('year', 'Jahr'), tage: noun('days', 'Tage'), stunden: noun('hours', 'Stunden'),
  termin: noun('date', 'Termin'), frist: noun('deadline', 'Frist'), uhrzeit: noun('time', 'Uhrzeit'), zeit: noun('time', 'Zeit'),
  versand: noun('shipping', 'Versand'), lieferschein: noun('delivery note', 'Lieferschein'),
  wareneingang: noun('goods receipt', 'Wareneingang'), warenausgang: noun('goods issue', 'Warenausgang'),
  bestand: noun('stock', 'Bestand'), bestaende: noun('stocks', 'Bestände'), verbrauch: noun('consumption', 'Verbrauch'),
  inventur: noun('physical inventory', 'Inventur'), vorgang: noun('process', 'Vorgang'),
  schritt: noun('step', 'Schritt'), schritte: noun('steps', 'Schritte'), stufe: noun('level', 'Stufe'), ebene: noun('level', 'Ebene'),
  regel: noun('rule', 'Regel'), regeln: noun('rules', 'Regeln'), vorlage: noun('template', 'Vorlage'),
  formular: noun('form', 'Formular'), nachschub: noun('replenishment', 'Nachschub'),
  reservierung: noun('reservation', 'Reservierung'), retoure: noun('return', 'Retoure'), ruecksendung: noun('return', 'Rücksendung'),
  reklamation: noun('complaint', 'Reklamation'), qualitaet: noun('quality', 'Qualität'), prueflos: noun('inspection lot', 'Prüflos'),
  kopf: noun('header', 'Kopf'), saldo: noun('balance', 'Saldo'), salden: noun('balances', 'Salden'),
  umsatz: noun('revenue', 'Umsatz'), gewicht: noun('weight', 'Gewicht'), einheit: noun('unit', 'Einheit'),
  sprache: noun('language', 'Sprache'), strasse: noun('street', 'Straße'), ansprechpartner: noun('contact person', 'Ansprechpartner'),
  gruppe: noun('group', 'Gruppe'), einkauf: noun('purchasing', 'Einkauf'), verkauf: noun('sales', 'Verkauf'),
  vertrieb: noun('sales', 'Vertrieb'), fertigung: noun('production', 'Fertigung'), nummer: noun('number', 'Nummer'),
  satz: noun('record', 'Satz'), saetze: noun('records', 'Sätze'), eintrag: noun('entry', 'Eintrag'), eintraege: noun('entries', 'Einträge'),
  objekt: noun('object', 'Objekt'), objekte: noun('objects', 'Objekte'), stueckliste: noun('bill of material', 'Stückliste'),
  arbeitsplatz: noun('work center', 'Arbeitsplatz'), puffer: noun('buffer', 'Puffer'),
  erfolg: noun('success', 'Erfolg'), abbruch: noun('cancellation', 'Abbruch'), ende: noun('end', 'Ende'), anfang: noun('start', 'Anfang'),
  teilnehmer: noun('participant', 'Teilnehmer'), antrag: noun('request', 'Antrag'), vorschlag: noun('proposal', 'Vorschlag'),
  entscheidung: noun('decision', 'Entscheidung'), kommentar: noun('comment', 'Kommentar'), lauf: noun('run', 'Lauf'),
  testlauf: noun('test run', 'Testlauf'), dokument: noun('document', 'Dokument'), auswahl: noun('selection', 'Auswahl'),
  bild: noun('screen', 'Bild'), bildschirm: noun('screen', 'Bildschirm'), drucker: noun('printer', 'Drucker'),
  ausnahme: noun('exception', 'Ausnahme'), kopfzeile: noun('header line', 'Kopfzeile'), ueberschrift: noun('heading', 'Überschrift'),
  sachkonto: noun('G/L account', 'Sachkonto'), anlagen: noun('assets', 'Anlagen'), lieferdatum: noun('delivery date', 'Lieferdatum'),
  liefertermin: noun('delivery date', 'Liefertermin'), auftragsart: noun('order type', 'Auftragsart'),
  belegart: noun('document type', 'Belegart'), verfuegbarkeit: noun('availability', 'Verfügbarkeit'),
  geschaeftsfehler: noun('business error', 'Geschäftsfehler'), offeneposten: noun('open items', 'Offene Posten'),

  rueckstand: noun('backlog', 'Rückstand'), segment: noun('segment', 'Segment'), segmente: noun('segments', 'Segmente'),
  auftraggeber: noun('ordering party', 'Auftraggeber'), faktura: noun('billing document', 'Faktura'),
  aenderungen: noun('changes', 'Änderungen'), paket: noun('package', 'Paket'), pakete: noun('packages', 'Pakete'),
  wareneingaenge: noun('goods receipts', 'Wareneingänge'), dublette: noun('duplicate', 'Dublette'),
  historie: noun('history', 'Historie'), banf: noun('purchase requisition', 'BANF'), banfen: noun('purchase requisitions', 'BANFen'),
  bedarf: noun('requirement', 'Bedarf'), kennzahl: noun('key figure', 'Kennzahl'), kennzahlen: noun('key figures', 'Kennzahlen'),
  zahllast: noun('tax payable', 'Zahllast'), komponente: noun('component', 'Komponente'), komponenten: noun('components', 'Komponenten'),
  qmeldung: noun('quality notification', 'Q-Meldung'), ausschuss: noun('scrap', 'Ausschuss'),
  etikett: noun('label', 'Etikett'), etiketten: noun('labels', 'Etiketten'), prueflose: noun('inspection lots', 'Prüflose'),
  los: noun('lot', 'Los'), lose: noun('lots', 'Lose'), nummern: noun('numbers', 'Nummern'), rueckruf: noun('recall', 'Rückruf'),
  kanal: noun('channel', 'Kanal'), briefe: noun('letters', 'Briefe'), plausi: noun('plausibility check', 'Plausi'),
  anpassung: action('adjust', 'adjustment', 'Anpassung'), geschaefte: noun('transactions', 'Geschäfte'),
  punkt: noun('point', 'Punkt'), punkte: noun('points', 'Punkte'), behaelter: noun('container', 'Behälter'),
  absprachen: noun('agreements', 'Absprachen'), ablesung: noun('meter reading', 'Ablesung'), listung: noun('listing', 'Listung'),
  transporte: noun('transports', 'Transporte'), gewichte: noun('weights', 'Gewichte'), fracht: noun('freight', 'Fracht'),
  gefahrgut: noun('dangerous goods', 'Gefahrgut'), kontingent: noun('quota', 'Kontingent'),
  jubilaeum: noun('anniversary', 'Jubiläum'), abgrenzung: noun('accrual', 'Abgrenzung'), abgrenzungen: noun('accruals', 'Abgrenzungen'),
  abweichung: noun('deviation', 'Abweichung'), abweichungen: noun('deviations', 'Abweichungen'),
  kalkulation: noun('costing', 'Kalkulation'), kalkulationen: noun('costings', 'Kalkulationen'),
  differenz: noun('difference', 'Differenz'), abschluss: noun('closing', 'Abschluss'), maengel: noun('defects', 'Mängel'),
  anzahlung: noun('down payment', 'Anzahlung'), quittung: noun('receipt', 'Quittung'), trommel: noun('drum', 'Trommel'),
  rueckgabe: noun('return', 'Rückgabe'), mengeneinheit: noun('unit of measure', 'Mengeneinheit'),
  gutmenge: noun('yield', 'Gutmenge'), referenzrechnung: noun('reference invoice', 'Referenzrechnung'),
  mailen: verb('mail', 'mailen'), abstimmen: verb('reconcile', 'abstimmen'), runden: verb('round', 'runden'),
  korrigieren: verb('correct', 'korrigieren'), lade: verb('load', 'lade'),
  hat: aux('has', 'hat'), fehlt: aux('is missing', 'fehlt'), fehlen: aux('are missing', 'fehlen'),

  // --- adjectives and participles (a state) ---
  erledigt: adj('completed', 'erledigt'), offen: adj('open', 'offen'), geschlossen: adj('closed', 'geschlossen'),
  neu: adj('new', 'neu'), aktiv: adj('active', 'aktiv'), inaktiv: adj('inactive', 'inaktiv'),
  gueltig: adj('valid', 'gültig'), ungueltig: adj('invalid', 'ungültig'), gesperrt: adj('blocked', 'gesperrt'),
  entsperrt: adj('unblocked', 'entsperrt'), freigegeben: adj('released', 'freigegeben'), genehmigt: adj('approved', 'genehmigt'),
  abgelehnt: adj('rejected', 'abgelehnt'), storniert: adj('reversed', 'storniert'), geloescht: adj('deleted', 'gelöscht'),
  geaendert: adj('changed', 'geändert'), gebucht: adj('posted', 'gebucht'), gedruckt: adj('printed', 'gedruckt'),
  gesendet: adj('sent', 'gesendet'), verschickt: adj('sent', 'verschickt'), geprueft: adj('checked', 'geprüft'),
  vorhanden: adj('available', 'vorhanden'), leer: adj('empty', 'leer'), fehlerhaft: adj('faulty', 'fehlerhaft'),
  korrekt: adj('correct', 'korrekt'), falsch: adj('wrong', 'falsch'), vollstaendig: adj('complete', 'vollständig'),
  unvollstaendig: adj('incomplete', 'unvollständig'), markiert: adj('marked', 'markiert'), ausgewaehlt: adj('selected', 'ausgewählt'),
  selektiert: adj('selected', 'selektiert'), gefunden: adj('found', 'gefunden'), letzt: adj('last', 'letzt'),
  erst: adj('first', 'erst'), naechst: adj('next', 'nächst'), alle: adj('all', 'alle'), alles: adj('all', 'alles'), manuell: adj('manual', 'manuell'),
  automatisch: adj('automatic', 'automatisch'), eilig: adj('urgent', 'eilig'), dringend: adj('urgent', 'dringend'),
  lokal: adj('local', 'lokal'), extern: adj('external', 'extern'), intern: adj('internal', 'intern'),
  verfuegbar: adj('available', 'verfügbar'), ueberfaellig: adj('overdue', 'überfällig'), faellig: adj('due', 'fällig'),
  gesetzt: adj('set', 'gesetzt'), angelegt: adj('created', 'angelegt'), verarbeitet: adj('processed', 'verarbeitet'),
  abgeschlossen: adj('completed', 'abgeschlossen'), zurueckgemeldet: adj('confirmed', 'zurückgemeldet'),
  gespeichert: adj('saved', 'gespeichert'), erfolgreich: adj('successful', 'erfolgreich'), gelesen: adj('read', 'gelesen'),
  geaenderte: adj('changed', 'geänderte'), gueltige: adj('valid', 'gültige'), doppelt: adj('duplicate', 'doppelt'),
  einzeln: adj('single', 'einzeln'), gesamt: adj('total', 'gesamt'), alt: adj('old', 'alt'),
  rund: adj('rounded', 'rund'), berechtigt: adj('authorized', 'berechtigt'), reserviert: adj('reserved', 'reserviert'),
  geliefert: adj('delivered', 'geliefert'), eigen: adj('own', 'eigen'), soll: adj('planned', 'soll'),

  // --- small words ---
  fuer: prep('for', 'für'), von: prep('of', 'von'), mit: prep('with', 'mit'), ohne: prep('without', 'ohne'),
  nach: prep('by', 'nach'), aus: prep('from', 'aus'), zu: prep('to', 'zu'), zum: prep('to', 'zum'), zur: prep('to', 'zur'),
  auf: prep('on', 'auf'), bei: prep('for', 'bei'), beim: prep('when', 'beim'), im: prep('in', 'im'), ueber: prep('over', 'über'), bis: prep('to', 'bis'), ab: prep('from', 'ab'),
  und: prep('and', 'und'), oder: prep('or', 'oder'), je: prep('per', 'je'),
  nicht: prep('not', 'nicht'), kein: prep('no', 'kein'), keine: prep('no', 'keine'), keinen: prep('no', 'keinen'),
  der: { pos: 'drop', en: '', de: 'der' }, den: { pos: 'drop', en: '', de: 'den' }, dem: { pos: 'drop', en: '', de: 'dem' },
  des: { pos: 'drop', en: '', de: 'des' }, das: { pos: 'drop', en: '', de: 'das' },
  ein: { pos: 'drop', en: '', de: 'ein' }, eine: { pos: 'drop', en: '', de: 'eine' }, einen: { pos: 'drop', en: '', de: 'einen' },
  ist: aux('is', 'ist'), sind: aux('are', 'sind'), wurde: aux('was', 'wurde'), wurden: aux('were', 'wurden'),
  wird: aux('is', 'wird'), werden: aux('are', 'werden'), konnte: aux('could', 'konnte'), kann: aux('can', 'kann'),
  bitte: aux('please', 'bitte'), nur: aux('only', 'nur'), noch: aux('still', 'noch'), bereits: aux('already', 'bereits'),
});

/**
 * First parts of a compound noun that are not words of their own here
 * (`Liefer|datum`, `Bestell|nummer`). A noun of `WORDS` may also stand first;
 * then its singular English is used.
 */
const MODIFIERS: Readonly<Record<string, Entry>> = Object.freeze({
  liefer: noun('delivery', 'Liefer'), bestell: noun('purchase order', 'Bestell'), auftrags: noun('order', 'Auftrags'),
  kunden: noun('customer', 'Kunden'), rechnungs: noun('invoice', 'Rechnungs'), buchungs: noun('posting', 'Buchungs'),
  zahlungs: noun('payment', 'Zahlungs'), waren: noun('goods', 'Waren'), lager: noun('storage', 'Lager'),
  positions: noun('item', 'Positions'), feld: noun('field', 'Feld'), fehler: noun('error', 'Fehler'),
  status: noun('status', 'Status'), material: noun('material', 'Material'), preis: noun('price', 'Preis'),
  mengen: noun('quantity', 'Mengen'), loesch: noun('deletion', 'Lösch'), sperr: noun('block', 'Sperr'),
  pruef: noun('inspection', 'Prüf'), tages: noun('daily', 'Tages'), monats: noun('monthly', 'Monats'),
  jahres: noun('annual', 'Jahres'), einkaufs: noun('purchasing', 'Einkaufs'), verkaufs: noun('sales', 'Verkaufs'),
  such: noun('search', 'Such'), beleg: noun('document', 'Beleg'), belegs: noun('document', 'Belegs'),
  kosten: noun('cost', 'Kosten'), steuer: noun('tax', 'Steuer'), haupt: noun('main', 'Haupt'),
  kurz: noun('short', 'Kurz'), lang: noun('long', 'Lang'), gesamt: noun('total', 'Gesamt'),
  einzel: noun('single', 'Einzel'), sammel: noun('collective', 'Sammel'), vertrags: noun('contract', 'Vertrags'),
  werks: noun('plant', 'Werks'), benutzer: noun('user', 'Benutzer'), vorgangs: noun('process', 'Vorgangs'),
  text: noun('text', 'Text'), test: noun('test', 'Test'), daten: noun('data', 'Daten'), kopf: noun('header', 'Kopf'),
  ausgabe: noun('output', 'Ausgabe'), eingabe: noun('input', 'Eingabe'), ergebnis: noun('result', 'Ergebnis'),
  versand: noun('shipping', 'Versand'), bank: noun('bank', 'Bank'),
  markt: noun('market', 'Markt'), doppel: noun('duplicate', 'Doppel'), plan: noun('planned', 'Plan'),
  serien: noun('serial', 'Serien'), park: noun('parked', 'Park'), referenz: noun('reference', 'Referenz'),
});

/**
 * Words that are the same in both languages (or SAP words used in both).
 * They never make a name German, and they translate to themselves.
 */
const SHARED: Readonly<Record<string, Entry>> = Object.freeze({
  status: noun('status', 'Status'), material: noun('material', 'Material'), test: noun('test', 'Test'),
  text: noun('text', 'Text'), name: noun('name', 'Name'), system: noun('system', 'System'),
  partner: noun('partner', 'Partner'), bank: noun('bank', 'Bank'), info: noun('info', 'Info'),
  position: noun('item', 'Position'), start: noun('start', 'Start'), mail: noun('mail', 'Mail'),
  email: noun('e-mail', 'E-Mail'), transport: noun('transport', 'Transport'), popup: noun('popup', 'Popup'),
  in: prep('in', 'in'), fieldcat: noun('field catalog', 'Feldkatalog'), fcat: noun('field catalog', 'Feldkatalog'),
  relevant: adj('relevant', 'relevant'), parallel: adj('parallel', 'parallel'), detail: noun('detail', 'Detail'),
  details: noun('details', 'Details'), equipment: noun('equipment', 'Equipment'), equipments: noun('equipment', 'Equipments'),
  mapping: noun('mapping', 'Mapping'), export: noun('export', 'Export'), import: noun('import', 'Import'),
  job: noun('job', 'Job'), jobs: noun('jobs', 'Jobs'), dispute: noun('dispute', 'Dispute'), global: adj('global', 'global'),
  quant: noun('quant', 'Quant'), code: noun('code', 'Code'), codes: noun('codes', 'Codes'),
});

/**
 * English words a German name may be mixed with (`GET_DATEN`, `LOG_MELDUNG`).
 * A name made of these and German words is translated; its original is then
 * shown as the identifier itself, since it is neither German nor English.
 */
const ENGLISH_VERBS = new Set([
  'get', 'set', 'read', 'check', 'create', 'update', 'delete', 'display', 'show', 'build', 'init', 'initialize',
  'fill', 'select', 'save', 'send', 'print', 'process', 'handle', 'call', 'add', 'append', 'modify', 'change',
  'write', 'prepare', 'convert', 'calculate', 'determine', 'validate', 'load', 'fetch', 'store', 'find',
  'sort', 'collect', 'insert', 'lock', 'unlock', 'post', 'release', 'approve', 'reject', 'finish', 'close',
  'open', 'log', 'upload', 'download', 'clear', 'reset', 'refresh', 'map', 'merge', 'split', 'copy', 'move',
]);
const ENGLISH_WORDS = new Set([
  ...ENGLISH_VERBS, 'data', 'list', 'field', 'catalog', 'header', 'item', 'items', 'line', 'lines', 'table',
  'value', 'values', 'user', 'command', 'top', 'page', 'grid', 'error', 'errors', 'message', 'messages', 'screen',
  'file', 'date', 'key', 'main', 'sub', 'output', 'input', 'new', 'old', 'all', 'result', 'results', 'entry',
  'entries', 'count', 'total', 'sum', 'order', 'orders', 'customer', 'supplier', 'vendor', 'document', 'documents',
]);
const ENGLISH_PREPS: Readonly<Record<string, string>> = Object.freeze({
  for: 'for', of: 'of', to: 'to', from: 'from', with: 'with', and: 'and', or: 'or', by: 'by', on: 'on',
});

/** What a name or a word list becomes. */
export interface GermanTranslation {
  /** The English wording, sentence case. */
  english: string;
  /**
   * The German original as a reader writes it ("Lieferdatum ändern"), or
   * `null` when the name mixes German and English words — then the caller
   * notes the identifier as the source writes it.
   */
  original: string | null;
}

/** German words found, but not all of them known: show the identifier, never a half translation. */
export const UNTRANSLATABLE = Object.freeze({ untranslatable: true as const });
export type GermanResult = GermanTranslation | typeof UNTRANSLATABLE | null;

export function isUntranslatable(result: GermanResult): result is typeof UNTRANSLATABLE {
  return result === UNTRANSLATABLE;
}

/** Spells umlauts and ß the way an ABAP identifier does. */
export function asciiGerman(word: string): string {
  return word.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

type Kind = 'de' | 'shared' | 'en' | 'abbr';

interface Token {
  kind: Kind;
  entry: Entry;
  /** English in its case: acronyms and abbreviations stay upper case. */
  upper?: boolean;
}

export interface WordSources {
  /** Abbreviations of the caller's own (`alv` → "ALV list"). */
  abbreviations?: Readonly<Record<string, string>>;
  /** Words written in capitals (`alv`, `sap`). */
  acronyms?: ReadonlySet<string>;
  /** SAP field names and other words the caller already knows (`kunnr` → "customer number"). */
  known?: (word: string) => string | null;
}

/** A key of one of the tables — never an inherited one (`constructor`, `toString`). */
function own<T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function lookup(word: string): Entry | null {
  const hit = own(WORDS, word);
  if (hit) return hit;
  // An inflected adjective: offene, offenen, offener, letzte, erledigten …
  for (const ending of ['en', 'er', 'es', 'em', 'e']) {
    if (word.length > ending.length + 2 && word.endsWith(ending)) {
      const stem = own(WORDS, word.slice(0, -ending.length));
      if (stem?.pos === 'adj') return { ...stem, de: stem.de + ending, inflected: true };
    }
  }
  return null;
}

/** `lieferdatum` → Liefer|datum; `buchungskreis` → listed; `feldkatalog` → Feld|katalog. */
function compound(word: string, depth = 0): Entry | null {
  if (depth > 2 || word.length < 6) return null;
  for (let cut = word.length - 3; cut >= 3; cut--) {
    const head = word.slice(cut);
    const headEntry = depth === 0 ? (own(WORDS, head) ?? compound(head, depth + 1)) : own(WORDS, head) ?? null;
    if (!headEntry || (headEntry.pos !== 'noun' && headEntry.pos !== 'action')) continue;
    for (const first of [word.slice(0, cut), word.slice(0, cut).replace(/s$/, '')]) {
      const linkS = first.length < cut;
      const listed = own(WORDS, first);
      const mod = own(MODIFIERS, first) ?? (listed?.pos === 'noun' ? listed : null);
      if (!mod || first.length < 3) continue;
      const modEn = mod === listed ? singularEnglish(mod.en) : mod.en;
      const headNoun = headEntry.pos === 'action' ? headEntry.noun ?? headEntry.en : headEntry.en;
      return {
        pos: 'noun',
        en: `${modEn} ${headNoun}`,
        de: `${mod.de}${linkS ? 's' : ''}${headEntry.de.toLowerCase()}`,
        item: headEntry.item ? `${modEn} ${headEntry.item}` : undefined,
      };
    }
  }
  return null;
}

function singularEnglish(word: string): string {
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/[^s]s$/.test(word) && !/data$/.test(word)) return word.slice(0, -1);
  return word;
}

function classify(raw: string, sources: WordSources): Token | null {
  const word = asciiGerman(raw);
  if (!word) return null;
  if (/^\d+$/.test(word)) return { kind: 'abbr', entry: noun(word, word), upper: true };
  const german = lookup(word);
  if (german) return { kind: 'de', entry: german };
  const shared = own(SHARED, word);
  if (shared) return { kind: 'shared', entry: shared };
  const englishPrep = own(ENGLISH_PREPS, word);
  if (englishPrep) return { kind: 'en', entry: prep(englishPrep, word) };
  if (ENGLISH_VERBS.has(word)) return { kind: 'en', entry: verb(word, word) };
  if (ENGLISH_WORDS.has(word)) return { kind: 'en', entry: noun(word, word) };
  const abbreviation = own(sources.abbreviations, word);
  if (abbreviation) {
    const upper = sources.acronyms?.has(word) === true || abbreviation === abbreviation.toUpperCase();
    return { kind: 'abbr', entry: noun(abbreviation, word.toUpperCase()), upper };
  }
  if (sources.acronyms?.has(word)) return { kind: 'abbr', entry: noun(word.toUpperCase(), word.toUpperCase()), upper: true };
  const known = sources.known?.(word);
  if (known) return { kind: 'abbr', entry: noun(known, word.toUpperCase()), upper: true };
  const parts = compound(word);
  if (parts) return { kind: 'de', entry: parts };
  // A short token is an abbreviation (`FI`, `IC`, `VE`), written as it stands.
  if (word.length <= 3 && /^[a-z0-9]+$/.test(word)) return { kind: 'abbr', entry: noun(word.toUpperCase(), word.toUpperCase()), upper: true };
  return null;
}

function nounOf(token: Token, asItem: boolean): string {
  const e = token.entry;
  if (asItem && e.item) return e.item;
  if (e.pos === 'action') return e.noun ?? e.en;
  return e.en;
}

function sentenceCase(text: string): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const PREDICATIVE_VERBS = new Set(['set', 'mark']);

/** A small word at the end of a variable name, and how it reads there. */
const TRAILING: Readonly<Record<string, string>> = Object.freeze({
  von: 'from', bis: 'to', nach: 'to', ab: 'from', über: 'over', für: 'for', alt: 'old', neu: 'new',
});

/** A variable named by a small word alone (`von`, `bis`). */
const ALONE: Readonly<Record<string, string>> = Object.freeze({
  von: 'From', bis: 'To', ab: 'From', ueber: 'Over', fuer: 'For', nach: 'To',
});

/** English words in English order. */
function englishOf(tokens: Token[], mode: 'routine' | 'field' | 'item'): string {
  const words = tokens.filter((t) => t.entry.pos !== 'drop');
  let verbAt = -1;
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].kind === 'de' && words[i].entry.pos === 'verb') { verbAt = i; break; }
  }
  if (verbAt < 0 && words.length > 1) {
    if (words[0].entry.pos === 'verb') verbAt = 0;
    else if (words[words.length - 1].entry.pos === 'verb') verbAt = words.length - 1;
    else if (mode === 'routine' && words[words.length - 1].entry.pos === 'action') verbAt = words.length - 1;
    else if (mode === 'routine' && words[0].entry.pos === 'action') verbAt = 0;
  }
  if (verbAt < 0 && words.length === 1 && words[0].entry.pos === 'verb') verbAt = 0;
  const verbWord = verbAt >= 0 ? words[verbAt].entry.en : '';
  let rest = words.filter((_, i) => i !== verbAt);
  // "Auftrag neu einplanen": `neu` right before the verb is "again", not "new".
  const again = verbAt > 0 && words[verbAt - 1].entry.de === 'neu';
  if (again) rest = rest.filter((t) => t !== words[verbAt - 1]);
  const close = again ? ' again' : '';
  // In a variable name a small word at the end reads as a direction:
  // `lgort_von` "storage location from", `gesetzt_von` "set by".
  if (mode !== 'routine' && rest.length > 1) {
    const last = rest[rest.length - 1];
    const trailing = own(TRAILING, last.entry.de.toLowerCase());
    if (last.entry.pos === 'prep' && trailing) {
      const word = rest[rest.length - 2].entry.pos === 'adj' && trailing === 'from' ? 'by' : trailing;
      rest = [...rest.slice(0, -1), { ...last, entry: { ...last.entry, en: word } }];
    }
  }
  // In a variable name `ist` before a noun is "actual" (`wadat_ist`), before a state "is".
  if (mode !== 'routine') {
    rest = rest.map((t, i) => {
      if (t.entry.de !== 'ist') return t;
      const next = rest[i + 1];
      return next && next.entry.pos === 'adj' ? t : { ...t, entry: noun('actual', 'ist') };
    });
  }

  const lastNounAt = (() => {
    for (let i = rest.length - 1; i >= 0; i--) if (rest[i].entry.pos === 'noun' || rest[i].entry.pos === 'action') return i;
    return -1;
  })();
  const phrase = (list: Token[]) => {
    const text = list.map((t, i) => {
      if (t.entry.pos === 'noun' || t.entry.pos === 'action') return nounOf(t, mode === 'item' && i === lastNounAt);
      return t.entry.en;
    }).filter(Boolean).join(' ');
    // "Markierte freigeben": an adjective used as a noun means the entries it describes.
    const noNoun = !list.some((t) => t.entry.pos === 'noun' || t.entry.pos === 'action');
    return noNoun && verbWord && mode === 'routine' && list.length && list[list.length - 1].entry.inflected ? `${text} entries` : text;
  };

  // "Status erledigt setzen": the state the verb sets comes after its object.
  if (PREDICATIVE_VERBS.has(verbWord) && rest.length > 1 && rest[rest.length - 1].entry.pos === 'adj') {
    let split = rest.length;
    while (split > 0 && rest[split - 1].entry.pos === 'adj') split--;
    if (split > 0) {
      return sentenceCase(`${verbWord} ${phrase(rest.slice(0, split))} to ${rest.slice(split).map((t) => t.entry.en).join(' ')}${close}`);
    }
  }
  return sentenceCase([verbWord, phrase(rest)].filter(Boolean).join(' ') + close);
}

/** The German as a reader writes it: "Status erledigt setzen", "ALV-Ausgabe". */
function germanOf(tokens: Token[]): string {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const text = t.entry.de;
    const prev = tokens[i - 1];
    const joinsPrev = prev && prev.kind === 'abbr' && prev.upper && !/^\d+$/.test(prev.entry.de)
      && (t.entry.pos === 'noun' || t.entry.pos === 'action') && t.kind !== 'abbr';
    if (joinsPrev && out.length) out[out.length - 1] = `${out[out.length - 1]}-${text}`;
    else out.push(text);
  }
  const s = out.join(' ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The words of an identifier (already split on `_`, prefix removed) in English.
 *
 * - `null` — no German word: the caller keeps its own wording.
 * - `UNTRANSLATABLE` — a German word next to a word that is not known: the
 *   caller shows the identifier as written.
 * - otherwise the English and the German original.
 *
 * `mode`: `routine` for a step name, `field` for a variable, `item` for what
 * one row of an internal table is called ("output line" for `gt_ausgabe`).
 */
export function translateGermanWords(
  words: readonly string[],
  mode: 'routine' | 'field' | 'item' = 'routine',
  sources: WordSources = {},
): GermanResult {
  try {
    const clean = words.map((w) => String(w ?? '').trim()).filter(Boolean);
    if (!clean.length) return null;
    const tokens = clean.map((w) => classify(w, sources));
    const anyGerman = tokens.some((t) => t?.kind === 'de');
    if (!anyGerman) return null;
    if (tokens.some((t) => t === null)) return UNTRANSLATABLE;
    const known = tokens as Token[];
    // Only small words, no content: a variable `von`/`bis` reads "From"/"To";
    // anything else is left to the caller.
    if (!known.some((t) => t.entry.pos !== 'prep' && t.entry.pos !== 'drop' && t.entry.pos !== 'aux')) {
      const alone = clean.length === 1 ? own(ALONE, asciiGerman(clean[0])) : undefined;
      return alone ? { english: alone, original: germanOf(known) } : null;
    }
    const english = englishOf(known, mode);
    if (!english) return UNTRANSLATABLE;
    const original = known.some((t) => t.kind === 'en') ? null : germanOf(known);
    return { english, original };
  } catch {
    return null;
  }
}

/** `read` → "reading", `write` → "writing", `get` → "getting". */
function gerund(verbWord: string): string {
  const [head, ...tail] = verbWord.split(' ');
  let ing: string;
  if (/[^e]e$/.test(head)) ing = `${head.slice(0, -1)}ing`;
  else if (/^(get|set|put|run|stop|plan)$/.test(head)) ing = `${head}${head.slice(-1)}ing`;
  else ing = `${head}ing`;
  return [ing, ...tail].join(' ');
}

/**
 * A short German text (a `MESSAGE` literal) in English, word by word: "Keine
 * Daten gefunden" → "No data found", "Bitte Werk eingeben" → "Please enter
 * plant". `null` unless every word is known and at least one is German — a
 * text this cannot read is shown as the source writes it.
 */
export function translateGermanText(text: string, sources: WordSources = {}): GermanTranslation | null {
  try {
    const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!raw || raw.length > 120) return null;
    const words = raw.replace(/[.!?:;,]+$/, '').split(' ');
    const tokens: Token[] = [];
    for (const w of words) {
      const bare = w.replace(/^[("']+|[)"',.;:!?]+$/g, '');
      if (!bare) continue;
      if (/^&\d?$/.test(bare)) {
        tokens.push({ kind: 'abbr', entry: noun(bare, bare), upper: true });
        continue;
      }
      const token = classify(bare, sources);
      if (!token || token.kind === 'en') return null;
      tokens.push(token);
    }
    if (!tokens.some((t) => t.kind === 'de')) return null;
    const list = tokens.filter((t) => t.entry.pos !== 'drop');
    // The infinitive at the end goes to the front, after "please".
    const last = list[list.length - 1];
    if (list.length > 1 && last.entry.pos === 'verb') {
      list.pop();
      const at = list[0]?.entry.en === 'please' ? 1 : 0;
      list.splice(at, 0, last);
    }
    for (let i = 1; i < list.length; i++) {
      if (list[i].entry.de === 'werden' && list[i - 1].entry.pos === 'adj') {
        const [participle] = list.splice(i - 1, 1);
        list.splice(i - 1, 1, { kind: 'de', entry: aux('be', 'werden') }, participle);
      }
    }
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const prev = list[i - 1];
      if (t.entry.pos === 'verb' && prev?.entry.en === 'when') out.push(gerund(t.entry.en));
      else if (t.entry.pos === 'action') out.push(t.entry.noun ?? t.entry.en);
      else out.push(t.entry.en);
    }
    const english = sentenceCase(out.filter(Boolean).join(' '));
    return english ? { english, original: raw } : null;
  } catch {
    return null;
  }
}
