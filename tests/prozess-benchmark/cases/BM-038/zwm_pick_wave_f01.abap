*----------------------------------------------------------------------*
* Include ZWM_PICK_WAVE_F01
*----------------------------------------------------------------------*

FORM lieferungen_lesen.
* offene WM-Lieferungen: Kommissionierstatus A, WM-Status A
  SELECT k~vbeln k~route k~lprio k~wadat
    FROM likp AS k INNER JOIN vbuk AS s ON s~vbeln = k~vbeln
    INTO CORRESPONDING FIELDS OF TABLE gt_lief
    WHERE k~vstel = p_vstel
      AND k~lgnum = p_lgnum
      AND k~route IN s_route
      AND k~wadat IN s_wadat
      AND s~kostk = 'A'
      AND s~lvstk = 'A'
      AND s~spstg = space.
ENDFORM.

*----------------------------------------------------------------------*
FORM welle_bilden.
  DATA lv_anz TYPE i.
* dringende zuerst (LPRIO 01 = hoch), dann Route, dann WA-Datum
  SORT gt_lief BY lprio route wadat vbeln.
  lv_anz = lines( gt_lief ).
  IF lv_anz > p_max.
    DELETE gt_lief FROM p_max + 1.
    go_log->add( iv_type = 'I'
                 iv_text = |Welle auf { p_max } von { lv_anz } Lieferungen begrenzt| ).
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM ta_erzeugen CHANGING ps_lief TYPE ty_lief.
  DATA: lt_ltap  TYPE STANDARD TABLE OF ltap_vb,
        lv_tanum TYPE ltak-tanum,
        lv_fix   TYPE abap_bool.

  CALL FUNCTION 'ENQUEUE_EVVBLKE'
    EXPORTING
      vbeln          = ps_lief-vbeln
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    ps_lief-status = 'L'.
    go_log->add( iv_type = 'W' iv_text = |Lieferung { ps_lief-vbeln } gesperrt ({ sy-msgv1 })| ).
    RETURN.
  ENDIF.

  CALL FUNCTION 'L_TO_CREATE_DN'
    EXPORTING
      i_lgnum                    = p_lgnum
      i_vbeln                    = ps_lief-vbeln
      i_commit_work              = abap_true
      i_bname                    = sy-uname
    IMPORTING
      e_tanum                    = lv_tanum
    TABLES
      t_ltap_vb                  = lt_ltap
    EXCEPTIONS
      foreign_lock               = 1
      dn_completed               = 2
      partial_delivery_forbidden = 3
      xfeld_wrong                = 4
      ldest_wrong                = 5
      drukz_wrong                = 6
      dn_wrong                   = 7
      squit_forbidden            = 8
      no_to_created              = 9
      teilk_wrong                = 10
      update_without_commit      = 11
      no_authority               = 12
      no_picking_allowed         = 13
      dn_hu_not_choosable        = 14
      input_error                = 15
      OTHERS                     = 16.
  IF sy-subrc <> 0.
    ps_lief-status = 'E'.
    go_log->add_sy( ).
    PERFORM entsperren USING ps_lief-vbeln.
    RETURN.
  ENDIF.

  ps_lief-tanum  = lv_tanum.
  ps_lief-status = 'S'.
  go_log->add( iv_type = 'S' iv_text = |TA { lv_tanum } zu Lieferung { ps_lief-vbeln }| ).

* Fixplatz-Kommissionierung: alle Positionen aus Lagertyp 005 -> sofort quittieren
  IF p_conf = abap_true.
    lv_fix = abap_true.
    LOOP AT lt_ltap INTO DATA(ls_ltap).
      IF ls_ltap-vltyp <> gc_fixplatz.
        lv_fix = abap_false.
        EXIT.
      ENDIF.
    ENDLOOP.
    IF lv_fix = abap_true.
      CALL FUNCTION 'L_TO_CONFIRM'
        EXPORTING
          i_lgnum        = p_lgnum
          i_tanum        = lv_tanum
          i_squit        = abap_true
          i_commit_work  = abap_true
        EXCEPTIONS
          to_confirmed   = 1
          to_doesnt_exist = 2
          foreign_lock   = 3
          OTHERS         = 99.
      IF sy-subrc = 0.
        ps_lief-status = 'Q'.
      ELSE.
        go_log->add_sy( ).
      ENDIF.
    ENDIF.
  ENDIF.

  PERFORM entsperren USING ps_lief-vbeln.
ENDFORM.

*----------------------------------------------------------------------*
FORM entsperren USING pv_vbeln TYPE vbeln_vl.
  CALL FUNCTION 'DEQUEUE_EVVBLKE'
    EXPORTING
      vbeln = pv_vbeln.
ENDFORM.

*----------------------------------------------------------------------*
FORM ta_drucken.
  DATA: lv_task TYPE char32,
        lv_msg  TYPE char255.

  LOOP AT gt_lief INTO DATA(ls_lief) WHERE status = 'S'.
*   max. 5 parallele Druckauftraege
    WAIT UNTIL gv_open < gc_max_par UP TO 30 SECONDS.
    gv_tasks = gv_tasks + 1.
    lv_task  = |ZWMPRT{ gv_tasks }|.
    CALL FUNCTION 'Z_WM_PRINT_TO'
      STARTING NEW TASK lv_task
      DESTINATION IN GROUP DEFAULT
      PERFORMING druck_fertig ON END OF TASK
      EXPORTING
        iv_lgnum = p_lgnum
        iv_tanum = ls_lief-tanum
        iv_ldest = p_ldest
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        resource_failure      = 3.
    IF sy-subrc = 0.
      gv_open = gv_open + 1.
    ELSE.
      go_log->add( iv_type = 'E' iv_text = |Druck TA { ls_lief-tanum } nicht gestartet: { lv_msg }| ).
    ENDIF.
  ENDLOOP.
  WAIT UNTIL gv_open = 0 UP TO 120 SECONDS.
ENDFORM.

*----------------------------------------------------------------------*
FORM druck_fertig USING pv_task TYPE clike.
  DATA: lv_spool TYPE rspoid,
        lv_msg   TYPE char255.

  RECEIVE RESULTS FROM FUNCTION 'Z_WM_PRINT_TO'
    IMPORTING
      ev_spool = lv_spool
    EXCEPTIONS
      print_error           = 1
      communication_failure = 2 MESSAGE lv_msg
      system_failure        = 3 MESSAGE lv_msg.
  gv_open = gv_open - 1.
  IF sy-subrc = 0.
    APPEND lv_spool TO gt_spool.
  ELSE.
    go_log->add( iv_type = 'E' iv_text = |Druckauftrag { pv_task } fehlgeschlagen { lv_msg }| ).
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM zusammenfassung.
  DATA: lv_s TYPE i, lv_q TYPE i, lv_e TYPE i, lv_l TYPE i.
  LOOP AT gt_lief INTO DATA(ls_lief).
    CASE ls_lief-status.
      WHEN 'S'. lv_s = lv_s + 1.
      WHEN 'Q'. lv_q = lv_q + 1.
      WHEN 'E'. lv_e = lv_e + 1.
      WHEN 'L'. lv_l = lv_l + 1.
    ENDCASE.
  ENDLOOP.
  WRITE: / 'Lagernummer', p_lgnum, 'Versandstelle', p_vstel.
  WRITE: / 'TA erzeugt           :', lv_s.
  WRITE: / 'TA sofort quittiert  :', lv_q.
  WRITE: / 'Fehler               :', lv_e.
  WRITE: / 'Lieferung gesperrt   :', lv_l.
  WRITE: / 'Druckauftraege       :', lines( gt_spool ).
ENDFORM.
