*&---------------------------------------------------------------------*
*& Include ZPS_NETZ_RESCHED_F01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form PROJEKTE_LESEN - nur freigegebene Projekte (Systemstatus FREI)
*&---------------------------------------------------------------------*
FORM projekte_lesen.
  DATA lt_jest TYPE SORTED TABLE OF jest WITH UNIQUE KEY objnr stat.

  SELECT pspnr pspid objnr post1 FROM proj
    INTO TABLE gt_proj
    WHERE pspid IN s_pspid.
  CHECK gt_proj IS NOT INITIAL.

* I0002 = FREI (freigegeben)
  SELECT * FROM jest INTO TABLE lt_jest
    FOR ALL ENTRIES IN gt_proj
    WHERE objnr = gt_proj-objnr
      AND stat  = 'I0002'
      AND inact = space.

  LOOP AT gt_proj INTO gs_proj.
    READ TABLE lt_jest WITH TABLE KEY objnr = gs_proj-objnr
                                      stat  = 'I0002'
                       TRANSPORTING NO FIELDS.
    IF sy-subrc <> 0.
      DELETE gt_proj.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PARALLEL_STARTEN - je Projekt eine aRFC-Aufgabe
*&---------------------------------------------------------------------*
FORM parallel_starten.
  LOOP AT gt_proj INTO gs_proj.
*   nicht mehr als p_maxt Aufgaben gleichzeitig
    WAIT UNTIL gv_active < p_maxt.
    gv_task = |RESCHED{ sy-tabix }|.

    CALL FUNCTION 'Z_PS_RESCHED_PROJECT'
      STARTING NEW TASK gv_task
      DESTINATION IN GROUP p_group
      PERFORMING ergebnis_empfangen ON END OF TASK
      EXPORTING
        iv_pspnr              = gs_proj-pspnr
        iv_test               = p_test
      EXCEPTIONS
        communication_failure = 1 MESSAGE gv_msg
        system_failure        = 2 MESSAGE gv_msg
        resource_failure      = 3.

    CASE sy-subrc.
      WHEN 0.
        gv_sent   = gv_sent + 1.
        gv_active = gv_active + 1.
      WHEN 3.
*       keine freien Dialog-Workprozesse: im eigenen Prozess verarbeiten
        PERFORM lokal_verarbeiten USING gs_proj.
      WHEN OTHERS.
        APPEND VALUE #( pspid = gs_proj-pspid status = 'F'
                        meldung = gv_msg ) TO gt_erg.
    ENDCASE.
  ENDLOOP.

* auf alle Rückmeldungen warten, höchstens 30 Minuten
  WAIT UNTIL gv_recv >= gv_sent UP TO 1800 SECONDS.
  IF sy-subrc <> 0.
    MESSAGE i103 WITH gv_sent gv_recv.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ERGEBNIS_EMPFANGEN - Rückruf bei Ende einer aRFC-Aufgabe
*&---------------------------------------------------------------------*
FORM ergebnis_empfangen USING p_task TYPE clike.
  DATA lt_res TYPE ty_t_erg.

  RECEIVE RESULTS FROM FUNCTION 'Z_PS_RESCHED_PROJECT'
    TABLES
      et_result             = lt_res
    EXCEPTIONS
      communication_failure = 1 MESSAGE gv_msg
      system_failure        = 2 MESSAGE gv_msg.
  gv_recv   = gv_recv + 1.
  gv_active = gv_active - 1.
  IF sy-subrc <> 0.
    APPEND VALUE #( pspid = p_task status = 'F' meldung = gv_msg ) TO gt_erg.
    RETURN.
  ENDIF.
  APPEND LINES OF lt_res TO gt_erg.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOKAL_VERARBEITEN - synchroner Aufruf ohne Parallelisierung
*&---------------------------------------------------------------------*
FORM lokal_verarbeiten USING is_proj TYPE ty_proj.
  DATA lt_res TYPE ty_t_erg.

  CALL FUNCTION 'Z_PS_RESCHED_PROJECT'
    EXPORTING
      iv_pspnr  = is_proj-pspnr
      iv_test   = p_test
    TABLES
      et_result = lt_res.
  APPEND LINES OF lt_res TO gt_erg.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form MEILENSTEINE_BEWERTEN - Ampel nach Verzugstagen
*&---------------------------------------------------------------------*
FORM meilensteine_bewerten.
  FIELD-SYMBOLS <ls_erg> TYPE zps_s_resched_res.

  LOOP AT gt_erg ASSIGNING <ls_erg> WHERE status = 'O'.
    <ls_erg>-ampel = COND #( WHEN <ls_erg>-verzug_tage > 10 THEN '1'
                             WHEN <ls_erg>-verzug_tage > 0  THEN '2'
                             ELSE '3' ).
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ALV_ANZEIGEN - Ergebnisliste mit Doppelklick-Absprung
*&---------------------------------------------------------------------*
FORM alv_anzeigen.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_erg ).
    CATCH cx_salv_msg INTO DATA(lx_salv).
      MESSAGE lx_salv TYPE 'I' DISPLAY LIKE 'E'.
      RETURN.
  ENDTRY.

  go_alv->get_columns( )->set_exception_column( 'AMPEL' ).
  go_alv->get_functions( )->set_all( abap_true ).

  CREATE OBJECT go_handler.
  SET HANDLER go_handler->on_double_click FOR go_alv->get_event( ).

  go_alv->display( ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROTOKOLL_SICHERN - Fehler und übersprungene Netze ins
*&                          Anwendungslog (SLG1, Objekt ZPS/RESCHED)
*&---------------------------------------------------------------------*
FORM protokoll_sichern.
  DATA: ls_log    TYPE bal_s_log,
        ls_msg    TYPE bal_s_msg,
        lv_handle TYPE balloghndl,
        lt_handle TYPE bal_t_logh.

  IF NOT line_exists( gt_erg[ status = 'F' ] )
     AND NOT line_exists( gt_erg[ status = 'S' ] ).
    RETURN.
  ENDIF.

  ls_log-object     = 'ZPS'.
  ls_log-subobject  = 'RESCHED'.
  ls_log-extnumber  = |Neuterminierung { sy-datum DATE = USER }|.
  ls_log-aldate_del = sy-datum + 90.
  ls_log-del_before = abap_true.

  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = lv_handle
    EXCEPTIONS
      OTHERS       = 1.

  LOOP AT gt_erg INTO DATA(ls_erg) WHERE status = 'F' OR status = 'S'.
    ls_msg = VALUE #( msgty = COND #( WHEN ls_erg-status = 'F' THEN 'E' ELSE 'W' )
                      msgid = 'ZPS'
                      msgno = '110'
                      msgv1 = ls_erg-pspid
                      msgv2 = ls_erg-aufnr
                      msgv3 = ls_erg-meldung(50) ).
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle = lv_handle
        i_s_msg      = ls_msg
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  INSERT lv_handle INTO TABLE lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.
ENDFORM.
