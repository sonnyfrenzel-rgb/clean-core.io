FUNCTION z_gts_export_pruefung.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_LIKP) TYPE  LIKP
*"  EXPORTING
*"     VALUE(EV_ERGEBNIS) TYPE  ZGTS_ERGEBNIS
*"     VALUE(EV_TEXT) TYPE  CHAR80
*"  TABLES
*"      IT_LIPS STRUCTURE  LIPSVB
*"----------------------------------------------------------------------
* Ergebnis: O = ok/freigegeben, S = gesperrt, F = technischer Fehler
*----------------------------------------------------------------------
  DATA: lv_dest  TYPE rfcdest,
        lv_land  TYPE kna1-land1,
        lv_msg   TYPE char80,
        lt_items TYPE STANDARD TABLE OF zgts_s_pos.

  ev_ergebnis = 'O'.
  CLEAR ev_text.

  PERFORM schalter_lesen CHANGING lv_dest.
  IF lv_dest IS INITIAL.
    RETURN.
  ENDIF.

* Test ohne GTS-Anbindung (Entwicklung / Schulung)
  IF sy-uname = 'GTS_TEST' OR sy-sysid = 'DEV'.
    RETURN.
  ENDIF.

  SELECT SINGLE land1 FROM kna1 INTO lv_land
    WHERE kunnr = is_likp-kunnr.
  IF lv_land = 'DE'.
    RETURN.
  ENDIF.

  PERFORM positionen_aufbauen TABLES it_lips lt_items.
  IF lt_items IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'Z_GTS_CHECK_DELIVERY' DESTINATION lv_dest
    EXPORTING
      iv_vbeln              = is_likp-vbeln
      iv_kunnr              = is_likp-kunnr
      iv_land               = lv_land
    IMPORTING
      ev_status             = ev_ergebnis
      ev_text               = ev_text
    TABLES
      it_items              = lt_items
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc <> 0.
    ev_ergebnis = 'F'.
    ev_text     = lv_msg.
  ENDIF.

  PERFORM protokoll USING is_likp-vbeln ev_ergebnis ev_text.

ENDFUNCTION.
