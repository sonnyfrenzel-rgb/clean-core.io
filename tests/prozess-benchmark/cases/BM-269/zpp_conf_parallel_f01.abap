*&---------------------------------------------------------------------*
*&  Include  ZPP_CONF_PARALLEL_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&  Form DISPATCH_PACKAGE - ein Paket per aRFC starten
*&---------------------------------------------------------------------*
FORM dispatch_package.
  DATA: lv_ok  TYPE i,
        lv_err TYPE i.

  DO.
    gv_taskno = gv_taskno + 1.
    gv_task   = |ZPPCONF_{ gv_taskno }|.
    CALL FUNCTION 'Z_PP_CONF_PACKAGE'
      STARTING NEW TASK gv_task
      DESTINATION IN GROUP p_group
      PERFORMING receive_result ON END OF TASK
      EXPORTING
        it_conf               = gt_package
      EXCEPTIONS
        resource_failure      = 1
        communication_failure = 2
        system_failure        = 3
        OTHERS                = 4.
    CASE sy-subrc.
      WHEN 0.
        gv_sent = gv_sent + 1.
        EXIT.
      WHEN 1.
*       keine freien Workprozesse: warten bis ein Task zurueck ist
        WAIT UNTIL gv_recv >= gv_sent UP TO 5 SECONDS.
      WHEN OTHERS.
*       Gruppe gestoert -> Paket lokal (synchron) buchen
        CALL FUNCTION 'Z_PP_CONF_PACKAGE'
          EXPORTING
            it_conf = gt_package
          IMPORTING
            ev_ok   = lv_ok
            ev_err  = lv_err.
        gv_ok  = gv_ok + lv_ok.
        gv_err = gv_err + lv_err.
        EXIT.
    ENDCASE.
  ENDDO.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form RECEIVE_RESULT - Callback ON END OF TASK
*&---------------------------------------------------------------------*
FORM receive_result USING pv_task TYPE clike.
  DATA: lv_ok  TYPE i,
        lv_err TYPE i,
        lv_msg TYPE c LENGTH 255.

  RECEIVE RESULTS FROM FUNCTION 'Z_PP_CONF_PACKAGE'
    IMPORTING
      ev_ok                 = lv_ok
      ev_err                = lv_err
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      OTHERS                = 3.
  gv_recv = gv_recv + 1.
  IF sy-subrc <> 0.
*   Status der Saetze bleibt 'N' -> naechster Lauf nimmt sie wieder
    gv_pkg_err = gv_pkg_err + 1.
    MESSAGE i021(zpp) WITH pv_task lv_msg.
    RETURN.
  ENDIF.
  gv_ok  = gv_ok + lv_ok.
  gv_err = gv_err + lv_err.
ENDFORM.
