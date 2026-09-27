REPORT zsd_idoc_err_count.
* Zaehlt fehlerhafte Auftrags-IDocs (Status 51) je Partner - Morgenroutine Innendienst
* 2011-03 MK: Anlage
TABLES edidc.
SELECT-OPTIONS s_credat FOR edidc-credat DEFAULT sy-datum.
PARAMETERS p_mestyp TYPE edidc-mestyp DEFAULT 'ORDERS'.

DATA: lt_edidc TYPE STANDARD TABLE OF edidc,
      ls_edidc TYPE edidc,
      lv_cnt   TYPE i.

START-OF-SELECTION.
  SELECT * FROM edidc INTO TABLE lt_edidc
    WHERE direct = '2'
      AND mestyp = p_mestyp
      AND status = '51'
      AND credat IN s_credat.
  IF sy-subrc <> 0.
    MESSAGE 'Keine fehlerhaften IDocs gefunden'(001) TYPE 'S'.
    RETURN.
  ENDIF.
  SORT lt_edidc BY sndprn docnum.
  LOOP AT lt_edidc INTO ls_edidc.
    lv_cnt = lv_cnt + 1.
    WRITE: / ls_edidc-sndprn, ls_edidc-docnum, ls_edidc-credat.
  ENDLOOP.
*  ULINE.  "alt
  WRITE: / 'Summe fehlerhafte IDocs:'(002), lv_cnt.
