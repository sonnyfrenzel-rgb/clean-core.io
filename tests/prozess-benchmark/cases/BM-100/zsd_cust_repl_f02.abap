*&---------------------------------------------------------------------*
*& Include ZSD_CUST_REPL_F02 - Übertragung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form SEND_PARALLEL - Pakete in der RFC-Servergruppe verteilen
*&---------------------------------------------------------------------*
FORM send_parallel.
  DATA: lv_task TYPE c LENGTH 8,
        lv_max  TYPE i,
        lv_free TYPE i.

  CALL FUNCTION 'SPBT_INITIALIZE'
    EXPORTING
      group_name                     = p_group
    IMPORTING
      max_pbt_wps                    = lv_max
      free_pbt_wps                   = lv_free
    EXCEPTIONS
      invalid_group_name             = 1
      internal_error                 = 2
      pbt_env_already_initialized    = 3
      currently_no_resources_avail   = 4
      no_pbt_resources_found         = 5
      cant_init_different_pbt_groups = 6
      OTHERS                         = 7.
  IF sy-subrc <> 0 AND sy-subrc <> 3.
    PERFORM log_add USING 'W' 'Servergruppe nicht verfügbar, seriell'.
    PERFORM send_serial.
    RETURN.
  ENDIF.

  LOOP AT gt_pack INTO gs_pack.
    lv_task = |CRM{ gs_pack-no WIDTH = 5 ALIGN = RIGHT PAD = '0' }|.
    DO.
      CALL FUNCTION 'Z_CRM_CUSTOMER_UPSERT'
        STARTING NEW TASK lv_task
        DESTINATION IN GROUP p_group
        PERFORMING receive_result ON END OF TASK
        EXPORTING
          it_customers          = gs_pack-recs
        EXCEPTIONS
          communication_failure = 1 MESSAGE gv_msg
          system_failure        = 2 MESSAGE gv_msg
          resource_failure      = 3.
      CASE sy-subrc.
        WHEN 0.
          gv_sent = gv_sent + 1.
          EXIT.
        WHEN 3.
*         keine freien Prozesse: auf Rückmeldungen warten, dann erneut
          WAIT UNTIL gv_recv >= gv_sent UP TO 5 SECONDS.
        WHEN OTHERS.
          PERFORM log_add USING 'E' gv_msg.
          EXIT.
      ENDCASE.
    ENDDO.
  ENDLOOP.

  WAIT UNTIL gv_recv >= gv_sent UP TO p_wait SECONDS.
  IF gv_recv < gv_sent.
    PERFORM log_add USING 'W' 'Nicht alle Pakete zurückgemeldet'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form RECEIVE_RESULT - Rückmeldung eines Pakets (ON END OF TASK)
*&---------------------------------------------------------------------*
FORM receive_result USING pv_task TYPE clike.
  DATA: lt_result TYPE zcrm_t_result,
        ls_result TYPE zcrm_s_result,
        lv_msg    TYPE c LENGTH 200.

  RECEIVE RESULTS FROM FUNCTION 'Z_CRM_CUSTOMER_UPSERT'
    IMPORTING
      et_result             = lt_result
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg.
  gv_recv = gv_recv + 1.
  IF sy-subrc <> 0.
    PERFORM log_add USING 'E' lv_msg.
    RETURN.
  ENDIF.

  LOOP AT lt_result INTO ls_result.
    IF ls_result-rc = 0.
      INSERT ls_result-kunnr INTO TABLE gt_done.
    ELSE.
      PERFORM log_add USING 'W' ls_result-message.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SEND_SERIAL - Pakete nacheinander übertragen
*&---------------------------------------------------------------------*
FORM send_serial.
  DATA: lt_result TYPE zcrm_t_result,
        ls_result TYPE zcrm_s_result.

  LOOP AT gt_pack INTO gs_pack.
    CLEAR lt_result.
    CALL FUNCTION 'Z_CRM_CUSTOMER_UPSERT'
      EXPORTING
        it_customers = gs_pack-recs
      IMPORTING
        et_result    = lt_result
      EXCEPTIONS
        OTHERS       = 1.
    IF sy-subrc <> 0.
      PERFORM log_add USING 'E' 'Paketübertragung fehlgeschlagen'.
      CONTINUE.
    ENDIF.
    LOOP AT lt_result INTO ls_result WHERE rc = 0.
      INSERT ls_result-kunnr INTO TABLE gt_done.
    ENDLOOP.
  ENDLOOP.
ENDFORM.
