FUNCTION z_fi_zahllauf_zurueckweisen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LAUFD) TYPE  LAUFD
*"     VALUE(IV_LAUFI) TYPE  LAUFI
*"     VALUE(IV_KOMMENTAR) TYPE  CHAR255
*"  EXCEPTIONS
*"      KEINE_BERECHTIGUNG
*"      NICHT_GEPRUEFT
*"      BEREITS_FREIGEGEBEN
*"      KOMMENTAR_FEHLT
*"----------------------------------------------------------------------
* Zurueckweisung durch den Freigeber - Vorschlag muss neu erstellt
* werden (F110 Vorschlag loeschen macht die Kreditorenbuchhaltung)
*----------------------------------------------------------------------
  DATA: ls_pruef  TYPE zfi_zf_pruef,
        lv_objkey TYPE swo_typeid.

  AUTHORITY-CHECK OBJECT 'Z_ZAHLFRG'
    ID 'ACTVT' FIELD '43'.
  IF sy-subrc <> 0.
    RAISE keine_berechtigung.
  ENDIF.

  IF iv_kommentar IS INITIAL.
    MESSAGE e016 RAISING kommentar_fehlt.
  ENDIF.

  SELECT SINGLE * FROM zfi_zf_pruef INTO ls_pruef
    WHERE laufd = iv_laufd
      AND laufi = iv_laufi.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH iv_laufd iv_laufi RAISING nicht_geprueft.
  ENDIF.

  IF ls_pruef-status = gc_freigabe.
    MESSAGE e017 WITH ls_pruef-freigeber RAISING bereits_freigegeben.
  ENDIF.

* keine Sperre: Zurueckweisen ist unkritisch (Entscheidung FB 2017)
  CALL FUNCTION 'Z_FI_ZF_STATUS_UPD' IN UPDATE TASK
    EXPORTING
      iv_laufd     = iv_laufd
      iv_laufi     = iv_laufi
      iv_status    = 'Z'
      iv_freigeber = sy-uname
      iv_kommentar = iv_kommentar.

  CONCATENATE iv_laufd iv_laufi INTO lv_objkey.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype = 'ZFIZAHLL'
      objkey  = lv_objkey
      event   = 'REJECTED'
    EXCEPTIONS
      OTHERS  = 1.

  COMMIT WORK.
ENDFUNCTION.
