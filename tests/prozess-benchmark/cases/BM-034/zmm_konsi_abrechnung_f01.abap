*----------------------------------------------------------------------*
***INCLUDE ZMM_KONSI_ABRECHNUNG_F01
*----------------------------------------------------------------------*

FORM log_anlegen.
  DATA ls_log TYPE bal_s_log.
  ls_log-object    = 'ZMM'.
  ls_log-subobject = 'KONSI'.
  ls_log-aldate_del = sy-datum + 90.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = gv_handle
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM daten_lesen.
  SELECT * FROM zmm_konsi_lief INTO TABLE gt_konsi
    WHERE aktiv = 'X'.

  SELECT lifnr bukrs werks matnr mblnr mjahr zeile budat
         menge meins wrbtr waers
    FROM rkwa INTO TABLE gt_rkwa
    WHERE bukrs IN s_bukrs
      AND lifnr IN s_lifnr
      AND budat IN s_budat
      AND belnr = space.

* nur Lieferanten mit Abrechnungsvereinbarung
  LOOP AT gt_rkwa INTO DATA(ls_rkwa).
    READ TABLE gt_konsi TRANSPORTING NO FIELDS
      WITH TABLE KEY lifnr = ls_rkwa-lifnr.
    IF sy-subrc <> 0.
      DELETE gt_rkwa.
    ENDIF.
  ENDLOOP.
  SORT gt_rkwa BY lifnr budat mblnr zeile.
ENDFORM.

*----------------------------------------------------------------------*
FORM je_lieferant.
  DATA: lt_lief  TYPE STANDARD TABLE OF ty_rkwa,
        lv_summe TYPE rkwa-wrbtr,
        lv_anz   TYPE i,
        lv_ok    TYPE abap_bool.

  LOOP AT gt_rkwa INTO DATA(ls_rkwa)
       GROUP BY ( lifnr = ls_rkwa-lifnr bukrs = ls_rkwa-bukrs )
       INTO DATA(ls_grp).
    CLEAR: lt_lief, lv_summe.
    LOOP AT GROUP ls_grp INTO DATA(ls_mem).
      APPEND ls_mem TO lt_lief.
      lv_summe = lv_summe + ls_mem-wrbtr.
    ENDLOOP.

    READ TABLE gt_konsi INTO DATA(ls_konsi)
      WITH TABLE KEY lifnr = ls_grp-lifnr.
*   Mindestbetrag je Lieferant (Kleinstbetraege sammeln bis Folgemonat)
    IF lv_summe < ls_konsi-min_betrag.
      PERFORM log_meldung USING 'I' ls_grp-lifnr 'Unter Mindestbetrag, verschoben'.
      CONTINUE.
    ENDIF.

    PERFORM datei_schreiben USING  lt_lief ls_grp-lifnr
                            CHANGING lv_ok.
    IF lv_ok = abap_false.
      PERFORM log_meldung USING 'E' ls_grp-lifnr 'Datei nicht geschrieben'.
      CONTINUE.
    ENDIF.

    IF p_abr = 'X' AND p_test = space.
      lv_anz = lines( lt_lief ).
      PERFORM abrechnen USING ls_grp-lifnr ls_grp-bukrs lv_anz.
    ELSE.
      PERFORM log_meldung USING 'I' ls_grp-lifnr 'Nur Aufstellung erzeugt'.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM datei_schreiben USING    pt_lief  LIKE gt_rkwa
                              pv_lifnr TYPE lifnr
                     CHANGING pv_ok    TYPE abap_bool.
  DATA: lv_file TYPE string,
        lv_line TYPE string.

  pv_ok = abap_false.
  lv_file = |{ p_dir }KONSI_{ pv_lifnr }_{ sy-datum }.csv|.
  OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  LOOP AT pt_lief INTO DATA(ls_lief).
    lv_line = |{ ls_lief-budat };{ ls_lief-mblnr };{ ls_lief-matnr };| &&
              |{ ls_lief-menge };{ ls_lief-meins };{ ls_lief-wrbtr };{ ls_lief-waers }|.
    TRANSFER lv_line TO lv_file.
  ENDLOOP.
  CLOSE DATASET lv_file.
  pv_ok = abap_true.
ENDFORM.

*----------------------------------------------------------------------*
FORM abrechnen USING pv_lifnr TYPE lifnr
                     pv_bukrs TYPE bukrs
                     pv_anz   TYPE i.
  DATA: lt_par   TYPE STANDARD TABLE OF rsparams,
        lv_offen TYPE i,
        lv_text  TYPE string.

* Selektionsbild RMVKON00 (Namen gem. Release 6.0 EHP7)
  lt_par = VALUE #( ( selname = 'BUKRS' kind = 'S' sign = 'I' option = 'EQ' low = pv_bukrs )
                    ( selname = 'LIFNR' kind = 'S' sign = 'I' option = 'EQ' low = pv_lifnr )
                    ( selname = 'XABRE' kind = 'P' low = 'X' ) ).
  SUBMIT rmvkon00 WITH SELECTION-TABLE lt_par
                  EXPORTING LIST TO MEMORY
                  AND RETURN.

* Kontrolle: was ist nach dem Lauf noch offen?
  SELECT COUNT(*) FROM rkwa INTO lv_offen
    WHERE bukrs = pv_bukrs
      AND lifnr = pv_lifnr
      AND budat IN s_budat
      AND belnr = space.
  IF lv_offen = 0.
    PERFORM log_meldung USING 'S' pv_lifnr 'Abgerechnet'.
  ELSE.
    lv_text = |{ lv_offen } von { pv_anz } offen|.
    PERFORM log_meldung USING 'E' pv_lifnr lv_text.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_meldung USING pv_typ   TYPE symsgty
                       pv_lifnr TYPE lifnr
                       pv_text  TYPE csequence.
  DATA ls_msg TYPE bal_s_msg.
  ls_msg-msgty = pv_typ.
  ls_msg-msgid = 'ZMM'.
  ls_msg-msgno = '021'.
  ls_msg-msgv1 = pv_lifnr.
  ls_msg-msgv2 = pv_text.
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_handle
      i_s_msg      = ls_msg
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*----------------------------------------------------------------------*
FORM log_sichern.
  DATA lt_handle TYPE bal_t_logh.
  APPEND gv_handle TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.
ENDFORM.
