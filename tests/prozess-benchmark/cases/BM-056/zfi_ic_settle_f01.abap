*&---------------------------------------------------------------------*
*&  Include  ZFI_IC_SETTLE_F01
*&---------------------------------------------------------------------*
*&  Ablaufsteuerung: Log, Selektion, Verarbeitung je Partner, Protokoll
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  LOG_INIT
*&---------------------------------------------------------------------*
*       Application Log ZFI_IC / SETTLE anlegen
*----------------------------------------------------------------------*
FORM log_init.
  DATA: ls_log TYPE bal_s_log.

  ls_log-object     = gc_log_object.
  ls_log-subobject  = gc_log_subobj.
  ls_log-extnumber  = |{ p_bukrs }/{ p_gjahr }/{ p_monat }|.
  ls_log-aluser     = sy-uname.
  ls_log-alprog     = sy-repid.
  ls_log-aldate_del = sy-datum + 180.          " Aufbewahrung 180 Tage
  ls_log-del_before = abap_true.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log                 = ls_log
    IMPORTING
      e_log_handle            = gv_log_handle
    EXCEPTIONS
      log_header_inconsistent = 1
      OTHERS                  = 2.
  IF sy-subrc <> 0.
*   Ohne Protokoll keine Abrechnung (Vorgabe Revision 2016)
    MESSAGE a012.
  ENDIF.
ENDFORM.                    "log_init

*&---------------------------------------------------------------------*
*&      Form  READ_SERVICES
*&---------------------------------------------------------------------*
*       offene und fehlerhafte IC-Leistungen der Periode lesen
*----------------------------------------------------------------------*
FORM read_services.

  SELECT * FROM zfi_ic_serv INTO TABLE gt_serv
    WHERE bukrs  =  p_bukrs
      AND pbukrs IN s_pbukrs
      AND gjahr  =  p_gjahr
      AND monat  =  p_monat
      AND ( status = gc_stat_open OR status = gc_stat_error ).

* alt bis 2013: offene Posten der IC-Debitoren direkt aus BSID
*  SELECT * FROM bsid INTO TABLE gt_bsid
*    WHERE bukrs = p_bukrs
*      AND kunnr IN r_ic_kunnr
*      AND budat <= p_budat.

* Hauswaehrung des leistenden Buchungskreises
  SELECT SINGLE waers FROM t001 INTO gv_waers_l
    WHERE bukrs = p_bukrs.

  SORT gt_serv BY pbukrs servid.
  gt_partner = CORRESPONDING #( gt_serv ).
  SORT gt_partner BY bukrs pbukrs.
  DELETE ADJACENT DUPLICATES FROM gt_partner COMPARING bukrs pbukrs.
ENDFORM.                    "read_services

*&---------------------------------------------------------------------*
*&      Form  PROCESS_PARTNER
*&---------------------------------------------------------------------*
*       Sperren, Customizing lesen, Leistungen eines Partners abrechnen
*----------------------------------------------------------------------*
FORM process_partner USING is_partner TYPE ty_partner.
  DATA: lv_amount_f TYPE wrbtr,
        lv_amount_l TYPE wrbtr,
        lv_belnr_l  TYPE belnr_d,
        lv_belnr_p  TYPE belnr_d,
        lv_status   TYPE zfi_ic_status,
        lv_ok       TYPE abap_bool,
        lv_text     TYPE char80.

* Sperre je Partnergesellschaft - zwei Jobs duerfen denselben
* Partner nicht gleichzeitig abrechnen (Doppelbuchung 11/2019)
  CALL FUNCTION 'ENQUEUE_EZFI_IC_PART'
    EXPORTING
      mode_zfi_ic_dest = 'E'
      bukrs            = is_partner-bukrs
      pbukrs           = is_partner-pbukrs
    EXCEPTIONS
      foreign_lock     = 1
      system_failure   = 2
      OTHERS           = 3.
  IF sy-subrc <> 0.
    APPEND VALUE #( msgty = 'W' msgid = 'ZFI_IC' msgno = '020'
                    msgv1 = is_partner-pbukrs msgv2 = sy-msgv1 ) TO gt_msg.
  ELSE.

*   RFC-Destination und Verrechnungskonditionen aus Customizing
    SELECT SINGLE * FROM zfi_ic_dest INTO gs_dest
      WHERE bukrs  = is_partner-bukrs
        AND pbukrs = is_partner-pbukrs.
    IF sy-subrc <> 0 OR gs_dest-rfcdest IS INITIAL.
      APPEND VALUE #( msgty = 'E' msgid = 'ZFI_IC' msgno = '021'
                      msgv1 = is_partner-pbukrs ) TO gt_msg.
    ELSE.

      LOOP AT gt_serv INTO gs_serv WHERE pbukrs = is_partner-pbukrs.
        CLEAR: lv_belnr_p, lv_text, lv_amount_l.
        lv_status  = gc_stat_error.
        lv_belnr_l = gs_serv-belnr_l.
        lv_ok      = abap_true.

*       Verrechnungspreis = Leistungswert zzgl. Aufschlag lt. ZFI_IC_DEST
        lv_amount_f = gs_serv-wrbtr * ( 100 + gs_dest-aufschlag ) / 100.
*       lv_amount_f = gs_serv-wrbtr * '1.05'.          "bis 2013 fix 5 %

        IF gs_serv-belnr_l IS INITIAL.
          IF gs_serv-waers <> gv_waers_l.
            CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
              EXPORTING
                date             = p_budat
                foreign_amount   = lv_amount_f
                foreign_currency = gs_serv-waers
                local_currency   = gv_waers_l
                type_of_rate     = 'M'
              IMPORTING
                local_amount     = lv_amount_l
              EXCEPTIONS
                no_rate_found    = 1
                overflow         = 2
                no_factors_found = 3
                no_spread_found  = 4
                derived_2_times  = 5
                OTHERS           = 6.
            IF sy-subrc <> 0.
*             kein Kurs zum Buchungsdatum -> Leistung bleibt auf Fehler
              lv_ok   = abap_false.
              lv_text = 'Kein Umrechnungskurs (Kurstyp M)'(t01).
              APPEND VALUE #( msgty = 'E' msgid = 'ZFI_IC' msgno = '022'
                              msgv1 = gs_serv-servid msgv2 = gs_serv-waers
                              msgv3 = gv_waers_l     msgv4 = p_budat ) TO gt_msg.
            ENDIF.
          ELSE.
            lv_amount_l = lv_amount_f.
          ENDIF.

          IF lv_ok = abap_true.
            PERFORM post_local USING    gs_serv gs_dest lv_amount_f lv_amount_l
                               CHANGING lv_belnr_l lv_ok lv_text.
          ENDIF.
        ELSE.
*         Wiederholungslauf: lokaler Beleg existiert, nur Partnerseite
          APPEND VALUE #( msgty = 'I' msgid = 'ZFI_IC' msgno = '027'
                          msgv1 = gs_serv-servid msgv2 = gs_serv-belnr_l ) TO gt_msg.
        ENDIF.

*       Gegenbuchung beim Partner (synchroner RFC)
        IF lv_ok = abap_true.
          PERFORM post_partner USING    gs_serv gs_dest lv_amount_f lv_belnr_l
                               CHANGING lv_belnr_p lv_ok lv_text.
          IF lv_ok = abap_true.
            lv_status = gc_stat_posted.
            ADD 1 TO gv_cnt_ok.
          ENDIF.
        ENDIF.

*       lokaler Beleg bleibt auch bei Fehler der Partnerseite stehen (Status E)
        PERFORM update_status USING gs_serv lv_status lv_belnr_l lv_belnr_p.

        APPEND VALUE #( bukrs   = gs_serv-bukrs   pbukrs  = gs_serv-pbukrs
                        servid  = gs_serv-servid  status  = lv_status
                        belnr_l = lv_belnr_l      belnr_p = lv_belnr_p
                        text    = lv_text ) TO gt_prot.
      ENDLOOP.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EZFI_IC_PART'
      EXPORTING
        mode_zfi_ic_dest = 'E'
        bukrs            = is_partner-bukrs
        pbukrs           = is_partner-pbukrs.
  ENDIF.
ENDFORM.                    "process_partner

*&---------------------------------------------------------------------*
*&      Form  LOG_SAVE
*&---------------------------------------------------------------------*
*       gesammelte Meldungen ins Application Log, Log sichern
*----------------------------------------------------------------------*
FORM log_save.
  DATA: lt_handle TYPE bal_t_logh.

  LOOP AT gt_msg INTO gs_msg.
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle     = gv_log_handle
        i_s_msg          = gs_msg
      EXCEPTIONS
        log_not_found    = 1
        msg_inconsistent = 2
        log_is_full      = 3
        OTHERS           = 4.
*   IF sy-subrc <> 0.  -> bewusst ignoriert, Log ist best effort
  ENDLOOP.

  APPEND gv_log_handle TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle   = lt_handle
    EXCEPTIONS
      log_not_found    = 1
      save_not_allowed = 2
      numbering_error  = 3
      OTHERS           = 4.
  IF sy-subrc <> 0.
    MESSAGE w013.
  ENDIF.
ENDFORM.                    "log_save

*&---------------------------------------------------------------------*
*&      Form  WRITE_PROTOCOL
*&---------------------------------------------------------------------*
*       Spool-Liste fuer Jobprotokoll
*----------------------------------------------------------------------*
FORM write_protocol.
  gv_cnt_err = lines( gt_prot ) - gv_cnt_ok.

  WRITE: / 'Intercompany-Abrechnung'(h01), p_bukrs, p_gjahr, p_monat,
         / 'Testlauf:'(h02), p_test.
  ULINE.
  LOOP AT gt_prot INTO gs_prot.
    WRITE: / gs_prot-pbukrs, gs_prot-servid, gs_prot-status,
             gs_prot-belnr_l, gs_prot-belnr_p, gs_prot-text.
  ENDLOOP.
  ULINE.
  WRITE: / 'Beidseitig gebucht:'(h03), gv_cnt_ok,
         / 'Nicht abgeschlossen:'(h04), gv_cnt_err.
ENDFORM.                    "write_protocol
