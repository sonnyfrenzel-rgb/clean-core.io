FUNCTION z_hr_ovt_limit_delete.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_PERSA) TYPE  PERSA
*"     VALUE(IV_FROM) TYPE  BEGDA
*"  EXPORTING
*"     VALUE(EV_COUNT) TYPE  I
*"  EXCEPTIONS
*"      NO_AUTHORITY
*"      NOT_FOUND
*"----------------------------------------------------------------------
  CLEAR ev_count.
  AUTHORITY-CHECK OBJECT 'Z_HR_OVT'
    ID 'ACTVT' FIELD '06'
    ID 'PERSA' FIELD iv_persa.
  IF sy-subrc <> 0.
    RAISE no_authority.
  ENDIF.

  DELETE FROM zhr_ovt_limit
    WHERE persa = iv_persa
      AND begda >= iv_from.
  IF sy-subrc <> 0.
    RAISE not_found.
  ENDIF.
  ev_count = sy-dbcnt.
* kein COMMIT - der Aufrufer steuert die LUW
ENDFUNCTION.
