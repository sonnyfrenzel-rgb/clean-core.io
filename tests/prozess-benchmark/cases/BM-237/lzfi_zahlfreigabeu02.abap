FUNCTION z_fi_zahllauf_freigeben.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LAUFD) TYPE  LAUFD
*"     VALUE(IV_LAUFI) TYPE  LAUFI
*"     VALUE(IV_KOMMENTAR) TYPE  CHAR255 OPTIONAL
*"  EXCEPTIONS
*"      KEINE_BERECHTIGUNG
*"      NICHT_GEPRUEFT
*"      VIER_AUGEN
*"      STATUS_ROT
*"      KOMMENTAR_FEHLT
*"      GESPERRT
*"----------------------------------------------------------------------
  DATA: ls_pruef  TYPE zfi_zf_pruef,
        lv_objkey TYPE swo_typeid.

* eigenes Berechtigungsobjekt (Revision 2017)
  AUTHORITY-CHECK OBJECT 'Z_ZAHLFRG'
    ID 'ACTVT' FIELD '43'.
  IF sy-subrc <> 0.
    RAISE keine_berechtigung.
  ENDIF.

  SELECT SINGLE * FROM zfi_zf_pruef INTO ls_pruef
    WHERE laufd = iv_laufd
      AND laufi = iv_laufi.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH iv_laufd iv_laufi RAISING nicht_geprueft.
  ENDIF.

* Vier Augen: Pruefer darf nicht freigeben
  IF ls_pruef-ersteller = sy-uname.
    MESSAGE e011 RAISING vier_augen.
  ENDIF.

  CASE ls_pruef-status.
    WHEN gc_rot.
      MESSAGE e012 RAISING status_rot.
    WHEN gc_gelb.
*     gelb nur mit Begruendung
      IF iv_kommentar IS INITIAL.
        MESSAGE e013 RAISING kommentar_fehlt.
      ENDIF.
    WHEN gc_freigabe.
      MESSAGE s014 WITH ls_pruef-freigeber.
      RETURN.
  ENDCASE.

  CALL FUNCTION 'ENQUEUE_EZFI_ZF_PRUEF'
    EXPORTING
      laufd          = iv_laufd
      laufi          = iv_laufi
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    RAISE gesperrt.
  ENDIF.

  CALL FUNCTION 'Z_FI_ZF_STATUS_UPD' IN UPDATE TASK
    EXPORTING
      iv_laufd     = iv_laufd
      iv_laufi     = iv_laufi
      iv_status    = gc_freigabe
      iv_freigeber = sy-uname
      iv_kommentar = iv_kommentar.

* Workflow plant den Zahlungslauf ein
  CONCATENATE iv_laufd iv_laufi INTO lv_objkey.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype           = 'ZFIZAHLL'
      objkey            = lv_objkey
      event             = 'RELEASED'
    EXCEPTIONS
      objtype_not_found = 1
      OTHERS            = 2.
  IF sy-subrc <> 0.
    MESSAGE i015 WITH lv_objkey.
  ENDIF.

  COMMIT WORK.

  CALL FUNCTION 'DEQUEUE_EZFI_ZF_PRUEF'
    EXPORTING
      laufd = iv_laufd
      laufi = iv_laufi.
ENDFUNCTION.
