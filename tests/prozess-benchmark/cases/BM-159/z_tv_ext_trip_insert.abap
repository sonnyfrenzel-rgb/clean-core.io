FUNCTION z_tv_ext_trip_insert.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (V1, sofort starten)
*"  IMPORTING
*"     VALUE(IV_EXT_ID) TYPE  CHAR20
*"     VALUE(IV_PERNR) TYPE  PERNR_D
*"     VALUE(IV_REINR) TYPE  REINR
*"----------------------------------------------------------------------
  DATA ls_map TYPE ztv_ext_trip.

  ls_map-ext_id = iv_ext_id.
  ls_map-pernr  = iv_pernr.
  ls_map-reinr  = iv_reinr.
  ls_map-erdat  = sy-datum.
  ls_map-ernam  = sy-uname.
  INSERT ztv_ext_trip FROM ls_map.
  IF sy-subrc <> 0.
    MESSAGE a010(ztv) WITH iv_ext_id.
  ENDIF.
ENDFUNCTION.
