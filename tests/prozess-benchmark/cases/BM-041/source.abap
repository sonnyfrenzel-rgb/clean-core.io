REPORT zfi_op_kunde.
* Offene Posten Debitor - Ueberfaelligkeit zum Stichtag
* 2009-03 MKR  angelegt fuer Debitorenbuchhaltung
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_kunnr TYPE kunnr OBLIGATORY,
            p_stich TYPE sy-datum DEFAULT sy-datum.

DATA: lt_bsid   TYPE STANDARD TABLE OF bsid,
      ls_bsid   TYPE bsid,
      lv_faell  TYPE sy-datum,
      lv_betrag TYPE dmbtr,
      lv_summe  TYPE dmbtr.

START-OF-SELECTION.
  SELECT * FROM bsid INTO TABLE lt_bsid
    WHERE bukrs = p_bukrs
      AND kunnr = p_kunnr.

  LOOP AT lt_bsid INTO ls_bsid.
*   Nettofaelligkeit = Basisdatum + Tage Zahlungsziel 1
    lv_faell = ls_bsid-zfbdt + ls_bsid-zbd1t.
    IF lv_faell < p_stich.
      lv_betrag = COND #( WHEN ls_bsid-shkzg = 'H' THEN - ls_bsid-dmbtr
                          ELSE ls_bsid-dmbtr ).
      lv_summe = lv_summe + lv_betrag.
      WRITE: / ls_bsid-belnr, ls_bsid-gjahr, lv_faell, lv_betrag.
    ENDIF.
  ENDLOOP.

* WRITE: / 'Anzahl:', lines( lt_bsid ).
  WRITE: / 'Summe ueberfaellig:', lv_summe.
