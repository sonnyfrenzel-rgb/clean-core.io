FUNCTION z_ess_address_decide.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (Workflow-Schritt ZESSADDR, Entscheidung HR)
*"  IMPORTING
*"     VALUE(IV_REQID) TYPE  SYSUUID_C32
*"     VALUE(IV_DECISION) TYPE  CHAR1
*"  EXPORTING
*"     VALUE(EV_STATUS) TYPE  ZESS_REQ_STATUS
*"  EXCEPTIONS
*"     REQUEST_NOT_FOUND
*"     NOT_PENDING
*"     NO_AUTHORITY
*"     INVALID_DECISION
*"----------------------------------------------------------------------
  DATA: ls_req     TYPE zess_addr_req,
        lt_p0001   TYPE STANDARD TABLE OF p0001,
        ls_p0001   TYPE p0001,
        lo_service TYPE REF TO zcl_ess_addr_service.

  SELECT SINGLE * FROM zess_addr_req INTO ls_req
    WHERE reqid = iv_reqid.
  IF sy-subrc <> 0.
    RAISE request_not_found.
  ENDIF.
  IF ls_req-status <> 'GENEHMIGUNG'.
    RAISE not_pending.
  ENDIF.

* Genehmiger braucht Schreibrecht auf IT0006 fuer diesen Mitarbeiter
  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr     = ls_req-pernr
      infty     = '0001'
      begda     = ls_req-begda
      endda     = ls_req-begda
    TABLES
      infty_tab = lt_p0001
    EXCEPTIONS
      OTHERS    = 1.
  READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.
  AUTHORITY-CHECK OBJECT 'P_ORGIN'
    ID 'INFTY' FIELD '0006'
    ID 'SUBTY' FIELD '1'
    ID 'AUTHC' FIELD 'W'
    ID 'PERSA' FIELD ls_p0001-werks
    ID 'PERSG' FIELD ls_p0001-persg
    ID 'PERSK' FIELD ls_p0001-persk
    ID 'VDSK1' FIELD ls_p0001-vdsk1.
  IF sy-subrc <> 0.
    RAISE no_authority.
  ENDIF.

  CASE iv_decision.
    WHEN 'A'.
      lo_service = NEW zcl_ess_addr_service( ls_req-pernr ).
      TRY.
          lo_service->apply( ls_req ).
          ls_req-status = 'UEBERNOMMEN'.
        CATCH zcx_ess_addr.
          ls_req-status = 'FEHLER'.
      ENDTRY.
    WHEN 'R'.
      ls_req-status = 'ABGELEHNT'.
    WHEN OTHERS.
      RAISE invalid_decision.
  ENDCASE.

  CALL FUNCTION 'Z_ESS_ADDR_STATUS_UPDATE' IN UPDATE TASK
    EXPORTING
      iv_reqid  = ls_req-reqid
      iv_status = ls_req-status
      iv_uname  = sy-uname.
  COMMIT WORK.
  ev_status = ls_req-status.
ENDFUNCTION.
