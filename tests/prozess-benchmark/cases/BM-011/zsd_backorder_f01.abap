*&---------------------------------------------------------------------*
*& Include ZSD_BACKORDER_F01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  RUECKSTAND_LESEN
*&---------------------------------------------------------------------*
*       Nicht voll belieferte Positionen mit unbestätigter Restmenge
*----------------------------------------------------------------------*
FORM rueckstand_lesen.
  DATA: lt_vbep TYPE STANDARD TABLE OF vbep,
        ls_vbep TYPE vbep.

  SELECT p~matnr p~werks p~lprio k~vdatu AS edatu p~vbeln p~posnr
         p~kwmeng p~vrkme
    INTO CORRESPONDING FIELDS OF TABLE gt_rueck
    FROM vbap AS p
    INNER JOIN vbak AS k ON k~vbeln = p~vbeln
    INNER JOIN vbup AS u ON u~vbeln = p~vbeln
                        AND u~posnr = p~posnr
    WHERE k~vkorg IN s_vkorg
      AND k~vbtyp = 'C'
      AND p~werks IN s_werks
      AND p~matnr IN s_matnr
      AND p~abgru = space
      AND u~lfsta <> 'C'.
  CHECK gt_rueck IS NOT INITIAL.

  SELECT * FROM vbep INTO TABLE lt_vbep
    FOR ALL ENTRIES IN gt_rueck
    WHERE vbeln = gt_rueck-vbeln
      AND posnr = gt_rueck-posnr.

  LOOP AT gt_rueck INTO gs_rueck.
    CLEAR gs_rueck-bmeng.
    LOOP AT lt_vbep INTO ls_vbep WHERE vbeln = gs_rueck-vbeln
                                   AND posnr = gs_rueck-posnr.
      gs_rueck-bmeng = gs_rueck-bmeng + ls_vbep-bmeng.
    ENDLOOP.
    gs_rueck-offen = gs_rueck-kwmeng - gs_rueck-bmeng.
*   nur fällige Rückstände: Wunschtermin bis Stichtag
    IF gs_rueck-offen <= 0 OR gs_rueck-edatu > p_datum.
      DELETE gt_rueck.
      CONTINUE.
    ENDIF.
    MODIFY gt_rueck FROM gs_rueck.
  ENDLOOP.

* Lieferpriorität vor Wunschtermin (Vorgabe Vertriebsleitung 2014)
  SORT gt_rueck BY matnr werks lprio edatu vbeln posnr.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  VERTEILEN
*&---------------------------------------------------------------------*
*       Freien Bestand je Material/Werk der Reihe nach zuteilen
*----------------------------------------------------------------------*
FORM verteilen.
  DATA: lv_frei   TYPE vbap-kwmeng,
        lv_zuteil TYPE vbap-kwmeng.

  LOOP AT gt_rueck INTO gs_rueck.
    AT NEW werks.
*     frei verwendbarer Bestand aller Lagerorte des Werks
      SELECT SUM( labst ) FROM mard INTO lv_frei
        WHERE matnr = gs_rueck-matnr
          AND werks = gs_rueck-werks.
    ENDAT.

    IF lv_frei <= 0.
      APPEND VALUE #( vbeln = gs_rueck-vbeln posnr = gs_rueck-posnr
                      matnr = gs_rueck-matnr status = 'W'
                      text  = 'Kein freier Bestand'(p01) ) TO gt_prot.
      CONTINUE.
    ENDIF.

    lv_zuteil = nmin( val1 = gs_rueck-offen val2 = lv_frei ).
    lv_frei   = lv_frei - lv_zuteil.

    IF p_test = abap_true.
      APPEND VALUE #( vbeln = gs_rueck-vbeln posnr = gs_rueck-posnr
                      matnr = gs_rueck-matnr menge = lv_zuteil status = 'I'
                      text  = 'Testlauf: würde neu eingeplant'(p02) ) TO gt_prot.
      CONTINUE.
    ENDIF.

    PERFORM auftrag_neu_einplanen USING lv_zuteil.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUFTRAG_NEU_EINPLANEN
*&---------------------------------------------------------------------*
*       Einteilung 0001 auf Stichtag setzen -> Standard-ATP bestätigt neu
*----------------------------------------------------------------------*
FORM auftrag_neu_einplanen USING iv_menge TYPE vbap-kwmeng.
  DATA: ls_hdrx  TYPE bapisdh1x,
        lt_item  TYPE STANDARD TABLE OF bapisditm,
        lt_itemx TYPE STANDARD TABLE OF bapisditmx,
        lt_schd  TYPE STANDARD TABLE OF bapischdl,
        lt_schdx TYPE STANDARD TABLE OF bapischdlx,
        lt_ret   TYPE STANDARD TABLE OF bapiret2.

  CALL FUNCTION 'ENQUEUE_EVVBAKE'
    EXPORTING
      vbeln          = gs_rueck-vbeln
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    APPEND VALUE #( vbeln = gs_rueck-vbeln posnr = gs_rueck-posnr
                    matnr = gs_rueck-matnr status = 'E'
                    text  = 'Auftrag in Bearbeitung'(p03) ) TO gt_prot.
    RETURN.
  ENDIF.

  ls_hdrx-updateflag = 'U'.
  APPEND VALUE #( itm_number = gs_rueck-posnr ) TO lt_item.
  APPEND VALUE #( itm_number = gs_rueck-posnr updateflag = 'U' ) TO lt_itemx.
  APPEND VALUE #( itm_number = gs_rueck-posnr sched_line = '0001'
                  req_date   = p_datum        req_qty    = gs_rueck-kwmeng )
         TO lt_schd.
  APPEND VALUE #( itm_number = gs_rueck-posnr sched_line = '0001'
                  updateflag = 'U' req_date = abap_true req_qty = abap_true )
         TO lt_schdx.

  CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
    EXPORTING
      salesdocument    = gs_rueck-vbeln
      order_header_inx = ls_hdrx
    TABLES
      return           = lt_ret
      order_item_in    = lt_item
      order_item_inx   = lt_itemx
      schedule_lines   = lt_schd
      schedule_linesx  = lt_schdx.

  READ TABLE lt_ret WITH KEY type = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    APPEND VALUE #( vbeln = gs_rueck-vbeln posnr = gs_rueck-posnr
                    matnr = gs_rueck-matnr status = 'E'
                    text  = 'Änderung abgelehnt'(p04) ) TO gt_prot.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    APPEND VALUE #( vbeln = gs_rueck-vbeln posnr = gs_rueck-posnr
                    matnr = gs_rueck-matnr menge = iv_menge status = 'S'
                    text  = 'Neu eingeplant'(p05) ) TO gt_prot.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EVVBAKE'
    EXPORTING
      vbeln = gs_rueck-vbeln.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_ANZEIGEN
*&---------------------------------------------------------------------*
FORM protokoll_anzeigen.
  gt_fcat = VALUE #( ( fieldname = 'VBELN'  ref_tabname = 'VBAP' )
                     ( fieldname = 'POSNR'  ref_tabname = 'VBAP' )
                     ( fieldname = 'MATNR'  ref_tabname = 'VBAP' )
                     ( fieldname = 'MENGE'  seltext_m = 'Zuteilung' )
                     ( fieldname = 'STATUS' seltext_m = 'Status' )
                     ( fieldname = 'TEXT'   seltext_m = 'Meldung' outputlen = 40 ) ).
  gs_layo-colwidth_optimize = abap_true.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      is_layout          = gs_layo
      it_fieldcat        = gt_fcat
    TABLES
      t_outtab           = gt_prot
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.
