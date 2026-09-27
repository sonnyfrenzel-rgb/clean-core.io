FUNCTION z_ess_addr_status_update.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (V1)
*"  IMPORTING
*"     VALUE(IV_REQID) TYPE  SYSUUID_C32
*"     VALUE(IV_STATUS) TYPE  ZESS_REQ_STATUS
*"     VALUE(IV_UNAME) TYPE  SYUNAME
*"----------------------------------------------------------------------
  UPDATE zess_addr_req
     SET status = iv_status
         aenam  = iv_uname
         aedat  = sy-datum
   WHERE reqid = iv_reqid.
  IF sy-subrc <> 0.
    MESSAGE a020(zess) WITH iv_reqid.
  ENDIF.
ENDFUNCTION.
