REPORT zewm_wt_retry.
*----------------------------------------------------------------------*
* Wiederholungsjob Fehlerqueue Lageraufgaben-Quittierung (alle 5 Minuten)
*----------------------------------------------------------------------*
PARAMETERS: p_max   TYPE i DEFAULT 500,       "max. Eintraege je Lauf
            p_purge TYPE i DEFAULT 30.        "erledigte Eintraege nach n Tagen loeschen

DATA: go_queue TYPE REF TO zcl_ewm_wt_queue,
      go_proc  TYPE REF TO zcl_ewm_wt_processor,
      gx_temp  TYPE REF TO zcx_ewm_wt_temp,
      gx_wt    TYPE REF TO zcx_ewm_wt,
      gt_due   TYPE zcl_ewm_wt_queue=>ty_t_queue,
      gs_conf  TYPE zcl_ewm_wt_processor=>ty_conf,
      gv_ok    TYPE i,
      gv_retry TYPE i,
      gv_final TYPE i,
      gv_lock  TYPE i,
      gv_purged TYPE i.

START-OF-SELECTION.
  go_queue = NEW #( ).
  go_proc  = NEW #( ).

  gv_purged = go_queue->purge( p_purge ).
  COMMIT WORK.

  gt_due = go_queue->get_due( ).
  IF gt_due IS INITIAL.
    WRITE: / 'Keine faelligen Eintraege, geloescht:', gv_purged.
    RETURN.
  ENDIF.

  LOOP AT gt_due INTO DATA(gs_due) TO p_max.
    CALL FUNCTION 'ENQUEUE_EZEWM_WTQ'
      EXPORTING
        guid           = gs_due-guid
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
*     laeuft gerade manuell im Monitor
      gv_lock = gv_lock + 1.
      CONTINUE.
    ENDIF.

    CALL TRANSFORMATION id SOURCE XML gs_due-payload
                           RESULT conf = gs_conf.
    TRY.
        go_proc->process( gs_conf ).
        go_queue->mark_done( gs_due-guid ).
        gv_ok = gv_ok + 1.
      CATCH zcx_ewm_wt_temp INTO gx_temp.
        go_queue->mark_retry( is_entry = gs_due
                              iv_text  = gx_temp->get_text( ) ).
        gv_retry = gv_retry + 1.
      CATCH zcx_ewm_wt INTO gx_wt.
        go_queue->mark_failed( iv_guid = gs_due-guid
                               iv_text = gx_wt->get_text( ) ).
        gv_final = gv_final + 1.
    ENDTRY.
    COMMIT WORK.

    CALL FUNCTION 'DEQUEUE_EZEWM_WTQ'
      EXPORTING
        guid = gs_due-guid.
  ENDLOOP.

  WRITE: / 'Quittiert:', gv_ok,
         / 'Erneut eingeplant:', gv_retry,
         / 'Endgueltig fehlerhaft:', gv_final,
         / 'Gesperrt uebersprungen:', gv_lock.
