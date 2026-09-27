*&---------------------------------------------------------------------*
*& Include ZSD_BILLING_RUN_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  LIEFERUNGEN_LESEN
*&---------------------------------------------------------------------*
*  WA gebucht (WBSTK = C), fakturarelevant und nicht voll fakturiert,
*  keine Fakturasperre im Lieferkopf
*----------------------------------------------------------------------*
FORM lieferungen_lesen.
  SELECT l~vbeln l~vkorg l~kunag
    INTO TABLE gt_lief
    FROM likp AS l
    INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
    WHERE l~vkorg     IN s_vkorg
      AND l~vstel     IN s_vstel
      AND l~faksk     = space
      AND l~wadat_ist <= p_fkdat
      AND u~wbstk     = 'C'
      AND u~fkstk     IN ('A', 'B').

  gt_vkorg = VALUE #( FOR ls_l IN gt_lief ( ls_l-vkorg ) ).
  SORT gt_vkorg.
  DELETE ADJACENT DUPLICATES FROM gt_vkorg.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SAMMELLAUF
*&---------------------------------------------------------------------*
FORM sammellauf USING iv_vkorg TYPE vkorg.
  DATA: lt_params TYPE STANDARD TABLE OF rsparams.

  CALL FUNCTION 'ENQUEUE_EZSD_BILLRUN'
    EXPORTING
      vkorg          = iv_vkorg
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    APPEND VALUE #( msgty = 'E' msgid = 'ZSD' msgno = '401'
                    msgv1 = iv_vkorg msgv2 = sy-msgv1 ) TO gt_msg.
    RETURN.
  ENDIF.

* Selektionsnamen lt. Selektionsbild SDBILLDL (Variante ZNACHT)
  APPEND VALUE #( selname = 'S_VKORG' kind = 'S' sign = 'I' option = 'EQ'
                  low = iv_vkorg ) TO lt_params.
  LOOP AT gt_lief INTO DATA(ls_lief) WHERE vkorg = iv_vkorg.
    APPEND VALUE #( selname = 'S_VBELN' kind = 'S' sign = 'I' option = 'EQ'
                    low = ls_lief-vbeln ) TO lt_params.
  ENDLOOP.
  APPEND VALUE #( selname = 'P_FKDAT' kind = 'P' low = p_fkdat ) TO lt_params.
  APPEND VALUE #( selname = 'P_ALLEL' kind = 'P' low = 'X' ) TO lt_params.

  IF p_test = abap_false.
    SUBMIT rv60sbat WITH SELECTION-TABLE lt_params
                    AND RETURN.
    APPEND VALUE #( msgty = 'S' msgid = 'ZSD' msgno = '402'
                    msgv1 = iv_vkorg ) TO gt_msg.
  ELSE.
    APPEND VALUE #( msgty = 'I' msgid = 'ZSD' msgno = '403'
                    msgv1 = iv_vkorg msgv2 = lines( lt_params ) ) TO gt_msg.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EZSD_BILLRUN'
    EXPORTING
      vkorg = iv_vkorg.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNIS_PRUEFEN
*&---------------------------------------------------------------------*
*  Welche Lieferungen haben nach dem Lauf keine Rechnung (VBTYP M)?
*----------------------------------------------------------------------*
FORM ergebnis_pruefen.
  DATA: lt_vbfa TYPE SORTED TABLE OF vbfa WITH NON-UNIQUE KEY vbelv.

  CHECK p_test = abap_false.

  SELECT * FROM vbfa INTO TABLE lt_vbfa
    FOR ALL ENTRIES IN gt_lief
    WHERE vbelv   = gt_lief-vbeln
      AND vbtyp_n = 'M'.

  LOOP AT gt_lief INTO DATA(ls_lief).
    READ TABLE lt_vbfa TRANSPORTING NO FIELDS
         WITH TABLE KEY vbelv = ls_lief-vbeln.
    IF sy-subrc <> 0.
      gv_fehler = gv_fehler + 1.
      APPEND VALUE #( msgty = 'W' msgid = 'ZSD' msgno = '404'
                      msgv1 = ls_lief-vbeln msgv2 = ls_lief-kunag ) TO gt_msg.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_SICHERN
*&---------------------------------------------------------------------*
FORM log_sichern.
  DATA: ls_log    TYPE bal_s_log,
        lv_handle TYPE balloghndl,
        lt_handle TYPE bal_t_logh.

  ls_log-object    = 'ZSD'.
  ls_log-subobject = 'BILLRUN'.
  ls_log-extnumber = |{ sy-datum }{ sy-uzeit }|.
  ls_log-aldate_del = sy-datum + 90.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = lv_handle
    EXCEPTIONS
      OTHERS       = 1.

  LOOP AT gt_msg INTO DATA(ls_msg).
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle = lv_handle
        i_s_msg      = ls_msg
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  APPEND lv_handle TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MAIL_SENDEN
*&---------------------------------------------------------------------*
FORM mail_senden.
  DATA: lo_send TYPE REF TO cl_bcs,
        lo_doc  TYPE REF TO cl_document_bcs,
        lt_text TYPE bcsy_text,
        lx_bcs  TYPE REF TO cx_bcs.

  APPEND |Fakturalauf vom { sy-datum DATE = USER }: { gv_fehler } | &&
         |Lieferungen ohne Rechnung.| TO lt_text.
  APPEND |Details: Anwendungsprotokoll (SLG1) Objekt ZSD / BILLRUN.| TO lt_text.

  TRY.
      lo_send = cl_bcs=>create_persistent( ).
      lo_doc  = cl_document_bcs=>create_document(
                  i_type    = 'RAW'
                  i_text    = lt_text
                  i_subject = 'Fakturalauf: Lieferungen ohne Rechnung' ).
      lo_send->set_document( lo_doc ).
      lo_send->add_recipient(
        cl_cam_address_bcs=>create_internet_address( p_mail ) ).
      lo_send->send( ).
      COMMIT WORK.
    CATCH cx_bcs INTO lx_bcs.
      MESSAGE lx_bcs TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.
