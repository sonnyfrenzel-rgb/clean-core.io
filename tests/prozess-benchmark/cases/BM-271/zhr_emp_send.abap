REPORT zhr_emp_send.
*----------------------------------------------------------------------*
* Mitarbeiterstammdaten an externen Payroll-Dienstleister
* Outbound-Proxy ZCO_HR_EMPLOYEE_OUT (asynchron, PI -> Provider)
* P_QUEUE: nur Eintraege der Warteschlange erneut senden
*----------------------------------------------------------------------*
TABLES pa0000.

SELECT-OPTIONS s_pernr FOR pa0000-pernr.
PARAMETERS: p_keydt TYPE sy-datum DEFAULT sy-datum,
            p_queue AS CHECKBOX.

DATA: go_sender TYPE REF TO zcl_hr_emp_sender,
      gx_err    TYPE REF TO zcx_hr_send_error,
      gt_pernr  TYPE STANDARD TABLE OF pernr_d,
      gv_ok     TYPE i,
      gv_retry  TYPE i,
      gv_fail   TYPE i.

START-OF-SELECTION.
  IF p_queue = abap_true.
    SELECT pernr FROM zhr_send_queue INTO TABLE gt_pernr
      WHERE status = 'R'.
  ELSE.
    SELECT pernr FROM pa0000 INTO TABLE gt_pernr
      WHERE pernr IN s_pernr
        AND begda <= p_keydt
        AND endda >= p_keydt
        AND stat2 = '3'.                "aktiv
  ENDIF.
  IF gt_pernr IS INITIAL.
    MESSAGE s040(zhr).
    RETURN.
  ENDIF.
  SORT gt_pernr.
  DELETE ADJACENT DUPLICATES FROM gt_pernr.

  go_sender = NEW #( iv_keydate = p_keydt ).

  LOOP AT gt_pernr INTO DATA(lv_pernr).
    TRY.
        go_sender->send( lv_pernr ).
        gv_ok = gv_ok + 1.
      CATCH zcx_hr_send_error INTO gx_err.
        IF gx_err->is_retryable( ) = abap_true.
          go_sender->enqueue_retry( iv_pernr = lv_pernr
                                    ix_error = gx_err ).
          gv_retry = gv_retry + 1.
        ELSE.
          gv_fail = gv_fail + 1.
          WRITE: / lv_pernr, gx_err->get_text( ).
        ENDIF.
    ENDTRY.
  ENDLOOP.

* Proxy-Nachrichten und Warteschlange gehen erst hier raus
  COMMIT WORK.
  WRITE: / 'Gesendet:', gv_ok, 'Warteschlange:', gv_retry, 'Fehler:', gv_fail.
