FUNCTION z_ess_address_request.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC, gerufen von der Fiori-App "Meine Adresse")
*"  IMPORTING
*"     VALUE(IV_PERNR) TYPE  PERNR_D OPTIONAL
*"     VALUE(IS_ADDRESS) TYPE  ZESS_S_ADDRESS
*"     VALUE(IV_BEGDA) TYPE  BEGDA
*"  EXPORTING
*"     VALUE(EV_REQID) TYPE  SYSUUID_C32
*"     VALUE(EV_STATUS) TYPE  ZESS_REQ_STATUS
*"  EXCEPTIONS
*"     NO_EMPLOYEE
*"     NOT_OWN_RECORD
*"     INVALID_ADDRESS
*"     OPEN_REQUEST
*"----------------------------------------------------------------------
* ESS: Mitarbeiter meldet neue Hauptanschrift (IT0006 Subtyp 1).
* Inlandsumzug ohne Rueckwirkung -> sofort uebernehmen,
* sonst Genehmigung durch die Personalabteilung (Workflow ZESSADDR).
* 2018-05 HR-IT  Anlage (Ersatz Standard-Service Adresse)
* 2021-02 HR-IT  Rueckwirkende Umzuege nur mit Genehmigung
  DATA: lv_own     TYPE pernr_d,
        lo_service TYPE REF TO zcl_ess_addr_service,
        lx_addr    TYPE REF TO zcx_ess_addr,
        ls_req     TYPE zess_addr_req,
        lv_objkey  TYPE swo_typeid.

* eigener Mitarbeiter zum angemeldeten Benutzer
  SELECT SINGLE pernr FROM pa0105 INTO lv_own
    WHERE usrty = '0001'
      AND usrid = sy-uname
      AND begda <= sy-datum
      AND endda >= sy-datum.
  IF sy-subrc <> 0.
    RAISE no_employee.
  ENDIF.
  IF iv_pernr IS NOT INITIAL AND iv_pernr <> lv_own.
*   ESS: nur die eigenen Daten
    RAISE not_own_record.
  ENDIF.

* hoechstens ein offener Antrag je Mitarbeiter
  SELECT SINGLE reqid FROM zess_addr_req INTO @DATA(lv_open)
    WHERE pernr = @lv_own
      AND status IN ('NEU', 'GENEHMIGUNG').
  IF sy-subrc = 0.
    MESSAGE e030(zess) WITH lv_open RAISING open_request.
  ENDIF.

  lo_service = NEW zcl_ess_addr_service( lv_own ).

  TRY.
      lo_service->validate( is_address = is_address
                            iv_begda   = iv_begda ).
    CATCH zcx_ess_addr INTO lx_addr.
      MESSAGE lx_addr TYPE 'E' RAISING invalid_address.
  ENDTRY.

  ls_req-reqid   = cl_system_uuid=>create_uuid_c32_static( ).
  ls_req-pernr   = lv_own.
  ls_req-begda   = iv_begda.
  ls_req-stras   = is_address-stras.
  ls_req-pstlz   = is_address-pstlz.
  ls_req-ort01   = is_address-ort01.
  ls_req-land1   = is_address-land1.
  ls_req-erdat   = sy-datum.
  ls_req-status  = 'NEU'.
  INSERT zess_addr_req FROM ls_req.

  IF lo_service->needs_approval( is_address = is_address
                                 iv_begda   = iv_begda ) = abap_true.
    ls_req-status = 'GENEHMIGUNG'.
    lv_objkey = ls_req-reqid.
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'ZESSADDR'
        objkey            = lv_objkey
        event             = 'CREATED'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
    IF sy-subrc <> 0.
      ls_req-status = 'FEHLER'.
    ENDIF.
  ELSE.
    TRY.
        lo_service->apply( ls_req ).
        ls_req-status = 'UEBERNOMMEN'.
      CATCH zcx_ess_addr.
        ls_req-status = 'FEHLER'.
    ENDTRY.
  ENDIF.

  CALL FUNCTION 'Z_ESS_ADDR_STATUS_UPDATE' IN UPDATE TASK
    EXPORTING
      iv_reqid  = ls_req-reqid
      iv_status = ls_req-status
      iv_uname  = sy-uname.
  COMMIT WORK.

  ev_reqid  = ls_req-reqid.
  ev_status = ls_req-status.
ENDFUNCTION.
