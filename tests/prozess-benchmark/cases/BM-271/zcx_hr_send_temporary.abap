CLASS zcx_hr_send_temporary DEFINITION
  PUBLIC
  INHERITING FROM zcx_hr_send_error
  FINAL
  CREATE PUBLIC.
* Technischer Fehler beim Senden (PI nicht erreichbar, Queue gesperrt ...)

  PUBLIC SECTION.
    METHODS is_retryable REDEFINITION.
ENDCLASS.



CLASS zcx_hr_send_temporary IMPLEMENTATION.

  METHOD is_retryable.
*   nur technische Fehler lohnen einen neuen Versuch
    rv_retry = abap_true.
  ENDMETHOD.

ENDCLASS.
