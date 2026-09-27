*&---------------------------------------------------------------------*
*& Include ZMM_STO_REPLENISH_F01
*&---------------------------------------------------------------------*
*----------------------------------------------------------------------*
* Rueckmeldung eines aRFC-Tasks (laeuft waehrend WAIT im Hauptprogramm)
*----------------------------------------------------------------------*
FORM on_sto_done USING p_task TYPE clike.
  DATA: lv_ebeln TYPE ebeln,
        lt_ret   TYPE bapiret2_t,
        lv_msg   TYPE c LENGTH 200.

  RECEIVE RESULTS FROM FUNCTION 'Z_MM_STO_CREATE_RFC'
    IMPORTING
      ev_ebeln              = lv_ebeln
      et_return             = lt_ret
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg.

  go_tasks->mv_done = go_tasks->mv_done + 1.

  IF sy-subrc <> 0 OR lv_ebeln IS INITIAL.
    WRITE: / p_task, 'UB nicht angelegt'(e01), lv_msg COLOR COL_NEGATIVE.
  ELSE.
*   Taskname STO_<Werk> - Werk aus dem Tasknamen
    APPEND VALUE #( ebeln = lv_ebeln
                    werks = substring( val = p_task off = 4 len = 4 ) )
      TO go_tasks->mt_created.
  ENDIF.
ENDFORM.

FORM write_summary.
  DATA(lv_sto) = lines( go_tasks->mt_created ).
  SKIP.
  WRITE: / 'Umlagerungsbestellungen:'(s01), lv_sto,
         / 'Auslieferungen         :'(s02), gv_deliv,
         / 'davon EWM-Wiederholung :'(s03), gv_retry.
ENDFORM.
