REPORT zcc_ref_016.
DATA lv_text TYPE string.
START-OF-SELECTION.
* CALL 'C_SAPGPARAM' ID 'NAME' FIELD 'rdisp/myname'.
  " SELECT * FROM kna1 INTO TABLE @DATA(lt_fake).
  lv_text = `CALL 'C_SAPGPARAM'; UPDATE KNA1;`.
  lv_text = |{ lv_text } CALL FUNCTION BAPI_PO_CREATE1|.
  WRITE / lv_text.
