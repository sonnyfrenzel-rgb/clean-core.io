FUNCTION z_ewm_tu_notify_carrier.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LGNUM) TYPE  /SCWM/LGNUM
*"     VALUE(IV_TU_NUM) TYPE  /SCWM/DE_TU_NUM
*"     VALUE(IV_CARRIER) TYPE  BU_PARTNER
*"  EXPORTING
*"     VALUE(EV_ATTEMPTS) TYPE  I
*"  EXCEPTIONS
*"      NO_DESTINATION
*"      SEND_FAILED
*"----------------------------------------------------------------------
* Meldet die Abfahrt einer Transporteinheit an das Speditionssystem.
* Kommunikationsfehler -> Wiederholung mit wachsender Wartezeit,
* danach Eintrag in die Retry-Queue (Nachverarbeitung ZEWM_RETRY_MON).

  DATA: ls_cust    TYPE zewm_if_cust,
        lv_msg     TYPE c LENGTH 255,
        lv_wait    TYPE i,
        lv_ok      TYPE abap_bool,
        ls_retry   TYPE zewm_retryq.

  SELECT SINGLE * FROM zewm_if_cust INTO ls_cust
    WHERE lgnum   = iv_lgnum
      AND carrier = iv_carrier
      AND ifcode  = 'TU_DEP'.
  IF sy-subrc <> 0 OR ls_cust-rfcdest IS INITIAL.
    RAISE no_destination.
  ENDIF.

  lv_wait = ls_cust-wait_sec.
  IF lv_wait IS INITIAL.
    lv_wait = 5.
  ENDIF.

  DO ls_cust-max_retry TIMES.
    ev_attempts = sy-index.
    CALL FUNCTION 'Z_CARRIER_TU_DEPARTURE'
      DESTINATION ls_cust-rfcdest
      EXPORTING
        iv_tu_num             = iv_tu_num
        iv_lgnum              = iv_lgnum
        iv_timestamp          = sy-uzeit
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        OTHERS                = 3.
    CASE sy-subrc.
      WHEN 0.
        lv_ok = abap_true.
        EXIT.
      WHEN 1.
*       Netz/Gegenstelle weg: warten und nochmal
        WAIT UP TO lv_wait SECONDS.
        lv_wait = lv_wait * 2.
      WHEN OTHERS.
*       Fehler in der Gegenstelle - Wiederholung sinnlos
        EXIT.
    ENDCASE.
  ENDDO.

  IF lv_ok = abap_false.
    ls_retry-lgnum    = iv_lgnum.
    ls_retry-tu_num   = iv_tu_num.
    ls_retry-ifcode   = 'TU_DEP'.
    ls_retry-attempts = ev_attempts.
    ls_retry-errtext  = lv_msg.
    GET TIME STAMP FIELD ls_retry-created.
    INSERT zewm_retryq FROM ls_retry.
    RAISE send_failed.
  ENDIF.

ENDFUNCTION.
