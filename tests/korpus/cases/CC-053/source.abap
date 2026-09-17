FORM userexit_save_document.
  DATA lv_block TYPE c LENGTH 2.
  CLEAR lv_block.
  IF vbak-auart = 'TA' AND vbak-netwr > 20000.
    lv_block = '01'.
  ENDIF.
  IF lv_block IS NOT INITIAL.
    vbak-lifsk = lv_block.
  ENDIF.
ENDFORM.
