REPORT zce_auth_guard.
START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'S_TCODE' ID 'TCD' FIELD 'SE38'.
  DATA(lv_auth_result) = sy-subrc.
  DATA(lv_caption) = `Guarded output`.
  IF lv_auth_result <> 0.
    RETURN.
  ENDIF.
  WRITE / lv_caption.
