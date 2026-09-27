CLASS zcx_hr_send_error DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  CREATE PUBLIC.
* Fachlicher Sendefehler (Stammdaten unvollstaendig) - Wiederholung zwecklos.
* Technische Fehler: Unterklasse ZCX_HR_SEND_TEMPORARY.

  PUBLIC SECTION.
    METHODS is_retryable
      RETURNING VALUE(rv_retry) TYPE abap_bool.
ENDCLASS.



CLASS zcx_hr_send_error IMPLEMENTATION.

  METHOD is_retryable.
    rv_retry = abap_false.
  ENDMETHOD.

ENDCLASS.
