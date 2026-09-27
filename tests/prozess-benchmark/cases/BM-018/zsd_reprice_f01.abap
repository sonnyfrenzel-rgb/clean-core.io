*&---------------------------------------------------------------------*
*& Include ZSD_REPRICE_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  AUFTRAEGE_LESEN
*&---------------------------------------------------------------------*
*       offene Kundenaufträge: Gesamtstatus nicht C, keine Absage
*----------------------------------------------------------------------*
FORM auftraege_lesen.
  SELECT k~vbeln k~knumv k~netwr k~waerk k~kunnr k~lifsk
    INTO TABLE gt_auftrag
    FROM vbak AS k
    INNER JOIN vbuk AS u ON u~vbeln = k~vbeln
    WHERE k~vkorg IN s_vkorg
      AND k~auart IN s_auart
      AND k~audat IN s_audat
      AND k~kunnr IN s_kunnr
      AND k~vbtyp = 'C'
      AND u~gbstk <> 'C'
      AND u~abstk <> 'C'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUFTRAG_NEU_BEWERTEN
*&---------------------------------------------------------------------*
FORM auftrag_neu_bewerten USING is_auftrag TYPE ty_auftrag.
  DATA: ls_out     TYPE ty_out,
        ls_hdrx    TYPE bapisdh1x,
        ls_logic   TYPE bapisdls,
        lt_ret     TYPE STANDARD TABLE OF bapiret2,
        ls_ret     TYPE bapiret2,
        lv_knumv   TYPE vbak-knumv,
        lv_gesperrt TYPE abap_bool.

  ls_out-vbeln     = is_auftrag-vbeln.
  ls_out-kunnr     = is_auftrag-kunnr.
  ls_out-netwr_alt = is_auftrag-netwr.
  ls_out-waerk     = is_auftrag-waerk.

* Aufträge, die schon in der Preisprüfung stehen, nicht erneut bewerten
  IF is_auftrag-lifsk = 'Z7'.
    ls_out-status = 'I'.
    ls_out-text   = 'Bereits in Preisprüfung (Z7)'(i02).
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  PERFORM konv_summe USING is_auftrag-knumv 'ZKA1'
                     CHANGING ls_out-zka1_alt.

  CALL FUNCTION 'ENQUEUE_EVVBAKE'
    EXPORTING
      vbeln          = is_auftrag-vbeln
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    ls_out-status = 'E'.
    ls_out-text   = 'Auftrag in Bearbeitung'(e01).
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  ls_hdrx-updateflag = 'U'.
  ls_logic-pricing   = p_ptype.

  CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
    EXPORTING
      salesdocument    = is_auftrag-vbeln
      order_header_inx = ls_hdrx
      simulation       = p_test
      logic_switch     = ls_logic
    TABLES
      return           = lt_ret.

  LOOP AT lt_ret INTO ls_ret WHERE type CA 'EA'.
    EXIT.
  ENDLOOP.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ls_out-status = 'E'.
    ls_out-text   = ls_ret-message.
    CALL FUNCTION 'DEQUEUE_EVVBAKE'
      EXPORTING
        vbeln = is_auftrag-vbeln.
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  IF p_test = abap_true.
*   Simulation liefert keine neuen Werte zurück
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ls_out-status = 'I'.
    ls_out-text   = 'Simulation ohne Fehler'(i01).
    CALL FUNCTION 'DEQUEUE_EVVBAKE'
      EXPORTING
        vbeln = is_auftrag-vbeln.
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.

* Werte nach Neubewertung
* 2016-01 KWE: früher Vergleich über KONV-Gesamtsumme, ersetzt durch
*              VBAK-NETWR (Kopfnettowert inkl. aller Positionen)
*  SELECT SUM( kwert ) FROM konv INTO ls_out-netwr_neu
*    WHERE knumv = is_auftrag-knumv
*      AND kposn <> '000000'
*      AND koaid = 'B'.
  SELECT SINGLE netwr knumv FROM vbak INTO (ls_out-netwr_neu, lv_knumv)
    WHERE vbeln = is_auftrag-vbeln.
  PERFORM konv_summe USING lv_knumv 'ZKA1'
                     CHANGING ls_out-zka1_neu.

  IF ls_out-netwr_alt <> 0.
    ls_out-abw_proz = ( ls_out-netwr_neu - ls_out-netwr_alt ) * 100
                      / ls_out-netwr_alt.
  ENDIF.

  IF abs( ls_out-abw_proz ) > p_maxd.
    PERFORM preissperre_setzen USING is_auftrag-vbeln
                               CHANGING lv_gesperrt.
    IF lv_gesperrt = abap_true.
      ls_out-status = 'W'.
      ls_out-text   = 'Neu bewertet, Liefersperre Z7 gesetzt'(w01).
    ELSE.
      ls_out-status = 'E'.
      ls_out-text   = 'Neu bewertet, Liefersperre nicht gesetzt'(e02).
    ENDIF.
  ELSE.
    ls_out-status = 'S'.
    ls_out-text   = 'Neu bewertet'(s01).
  ENDIF.

  IF ls_out-netwr_neu <> ls_out-netwr_alt.
    APPEND VALUE #( vbeln     = ls_out-vbeln
                    datum     = sy-datum
                    uzeit     = sy-uzeit
                    netwr_alt = ls_out-netwr_alt
                    netwr_neu = ls_out-netwr_neu
                    waerk     = ls_out-waerk
                    knprs     = p_ptype
                    ernam     = sy-uname ) TO gt_log.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EVVBAKE'
    EXPORTING
      vbeln = is_auftrag-vbeln.
  APPEND ls_out TO gt_out.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  KONV_SUMME - Summe einer Konditionsart im Beleg
*&---------------------------------------------------------------------*
*       nur aktive Konditionen (KINAK initial); Wert in Belegwährung
*----------------------------------------------------------------------*
FORM konv_summe USING    iv_knumv TYPE knumv
                         iv_kschl TYPE kschl
                CHANGING cv_summe TYPE kwert.
  CLEAR cv_summe.
  SELECT SUM( kwert ) FROM konv INTO cv_summe
    WHERE knumv = iv_knumv
      AND kschl = iv_kschl
      AND kinak = space.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PREISSPERRE_SETZEN - Liefersperre Z7 per BAPI
*&---------------------------------------------------------------------*
FORM preissperre_setzen USING    iv_vbeln    TYPE vbeln_va
                        CHANGING cv_gesperrt TYPE abap_bool.
  DATA: ls_hdr  TYPE bapisdh1,
        ls_hdrx TYPE bapisdh1x,
        lt_ret  TYPE STANDARD TABLE OF bapiret2.

* Z7 = "Preisprüfung" (OVLS), Freigabe durch Vertriebscontrolling
* über Transaktion ZSD_PREISFREIGABE
  cv_gesperrt     = abap_false.
  ls_hdr-dlv_block = 'Z7'.
  ls_hdrx-updateflag = 'U'.
  ls_hdrx-dlv_block  = abap_true.

  CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
    EXPORTING
      salesdocument    = iv_vbeln
      order_header_in  = ls_hdr
      order_header_inx = ls_hdrx
    TABLES
      return           = lt_ret.

  READ TABLE lt_ret TRANSPORTING NO FIELDS WITH KEY type = 'E'.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    cv_gesperrt = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lx_alv TYPE REF TO cx_salv_msg.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_out ).
    CATCH cx_salv_msg INTO lx_alv.
      MESSAGE lx_alv TYPE 'E'.
  ENDTRY.

  lo_alv->get_functions( )->set_all( abap_true ).
  lo_alv->get_display_settings( )->set_list_header(
    |Neubewertung Preisfindungsart { p_ptype }, | &&
    |Grenze { p_maxd } %{ COND #( WHEN p_test = abap_true THEN ' (Test)' ) }| ).
  lo_alv->display( ).
ENDFORM.
