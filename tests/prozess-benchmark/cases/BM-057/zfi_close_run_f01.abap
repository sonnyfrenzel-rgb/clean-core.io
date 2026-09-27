*&---------------------------------------------------------------------*
*&  Include           ZFI_CLOSE_RUN_F01
*&---------------------------------------------------------------------*
* Rahmen: Periodenpruefung, Laufabschluss, Mail
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  CHECK_PERIODS
*&---------------------------------------------------------------------*
*  Liest je Buchungskreis die Buchungsperiodenvariante und prueft in
*  T001B, ob die Abschlussperiode im Intervall 1 offen ist.
*----------------------------------------------------------------------*
FORM check_periods.

  DATA: lt_t001  TYPE STANDARD TABLE OF ty_t001,
        ls_t001  TYPE ty_t001,
        ls_t001b TYPE t001b,
        lv_akt   TYPE n LENGTH 7,
        lv_von   TYPE n LENGTH 7,
        lv_bis   TYPE n LENGTH 7.

  CLEAR gt_bukrs.
  lv_akt = |{ p_gjahr }{ p_monat }|.

  SELECT bukrs opvar FROM t001 INTO TABLE lt_t001
    WHERE bukrs IN s_bukrs.

  LOOP AT lt_t001 INTO ls_t001.
*   Kontoart '+' = gueltig fuer alle Kontoarten
    SELECT SINGLE * FROM t001b INTO ls_t001b
      WHERE rrcty = '0'
        AND bukrs = ls_t001-opvar
        AND mkoar = '+'.
    IF sy-subrc <> 0.
*     keine Variante gepflegt -> Buchungskreis laeuft nicht mit
      CONTINUE.
    ENDIF.
    lv_von = |{ ls_t001b-frye1 }{ ls_t001b-frpe1 }|.
    lv_bis = |{ ls_t001b-toye1 }{ ls_t001b-tope1 }|.
*   Intervall 2 (Sonderperioden / Berechtigungsgruppe) hier egal
    IF lv_akt BETWEEN lv_von AND lv_bis.
      APPEND ls_t001-bukrs TO gt_bukrs.
    ELSE.
      mac_log 'W' '011' ls_t001-bukrs lv_akt.
    ENDIF.
  ENDLOOP.

* IF gt_bukrs IS INITIAL. MESSAGE e002. ENDIF.   "raus, sonst Jobabbruch

ENDFORM.                    "check_periods

*&---------------------------------------------------------------------*
*&      Form  FINISH_RUN
*&---------------------------------------------------------------------*
*  Laufkopf schreiben, Protokoll sichern, Sperre loesen, Mail
*----------------------------------------------------------------------*
FORM finish_run.

  DATA: lt_handle TYPE bal_t_logh.

  gs_run-runid  = p_runid.
  gs_run-gjahr  = p_gjahr.
  gs_run-monat  = p_monat.
  gs_run-uname  = sy-uname.
  gs_run-enddat = sy-datum.
  gs_run-endtim = sy-uzeit.
* A = abgebrochen (kritischer Schritt), E = keine offene Periode, S = ok
  gs_run-status = COND #( WHEN gv_abort = abap_true THEN 'A'
                          WHEN gt_bukrs IS INITIAL  THEN 'E'
                          ELSE 'S' ).
  MODIFY zfi_close_run FROM gs_run.

  APPEND gv_log TO lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle   = lt_handle
    EXCEPTIONS
      log_not_found    = 1
      save_not_allowed = 2
      numbering_error  = 3
      OTHERS           = 4.
  COMMIT WORK.

  CALL FUNCTION 'DEQUEUE_EZFI_CLOSE_RUN'
    EXPORTING
      mode_zfi_close_run = 'E'
      mandt              = sy-mandt
      runid              = p_runid
      gjahr              = p_gjahr
      monat              = p_monat.

  PERFORM send_mail.

ENDFORM.                    "finish_run

*&---------------------------------------------------------------------*
*&      Form  SEND_MAIL
*&---------------------------------------------------------------------*
FORM send_mail.

  DATA: lo_send TYPE REF TO cl_bcs,
        lo_doc  TYPE REF TO cl_document_bcs,
        lo_rcpt TYPE REF TO if_recipient_bcs,
        lx_bcs  TYPE REF TO cx_bcs,
        lt_text TYPE soli_tab,
        lv_text TYPE string,
        lv_subj TYPE so_obj_des.

  CHECK p_mail IS NOT INITIAL.

  lv_subj = |Monatsabschluss { p_runid } { p_gjahr }/{ p_monat }: { gs_run-status }|.
  APPEND VALUE #( line = |Lauf { p_runid } beendet mit Status { gs_run-status }.| ) TO lt_text.
  APPEND VALUE #( line = |Buchungskreise mit offener Periode: { lines( gt_bukrs ) }| ) TO lt_text.
  APPEND VALUE #( line = |Details: SLG1, Objekt ZFI/CLOSE, ext. Nummer { p_runid }| ) TO lt_text.

  TRY.
      lo_send = cl_bcs=>create_persistent( ).
      lo_doc  = cl_document_bcs=>create_document( i_type    = 'RAW'
                                                  i_text    = lt_text
                                                  i_subject = lv_subj ).
      lo_send->set_document( lo_doc ).
      lo_rcpt = cl_cam_address_bcs=>create_internet_address( p_mail ).
      lo_send->add_recipient( lo_rcpt ).
      lo_send->set_send_immediately( abap_true ).
      lo_send->send( ).
      COMMIT WORK.
    CATCH cx_bcs INTO lx_bcs.
      lv_text = lx_bcs->get_text( ).
      MESSAGE lv_text TYPE 'I'.
  ENDTRY.

ENDFORM.                    "send_mail
