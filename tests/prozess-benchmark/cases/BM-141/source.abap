REPORT zpy_check_bank_missing.
* Vorabpruefung vor dem Abrechnungslauf: Mitarbeiter ohne Hauptbankverbindung
* 2011-05 HR-IT: Barzahler (Zahlweg C) ausgenommen
* 2016-02 HR-IT: IBAN statt Kontonummer pruefen
TABLES: pernr.
NODES: peras.
INFOTYPES: 0009.
DATA gv_count TYPE i.

GET peras.
  rp_provide_from_last p0009 '0' pn-begda pn-endda.
  CHECK p0009-zlsch <> 'C'.
  IF pnp-sw-found = '0' OR p0009-iban IS INITIAL.
    gv_count = gv_count + 1.
    WRITE: / pernr-pernr, 'keine Hauptbankverbindung mit IBAN im Zeitraum'.
*   WRITE: / pernr-pernr, p0009-bankn.       "alt, bis 2016
  ENDIF.

END-OF-SELECTION.
  WRITE: / 'Anzahl Mitarbeiter ohne Bankverbindung:', gv_count.
