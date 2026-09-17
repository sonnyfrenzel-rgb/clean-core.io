REPORT zce_own_form.
TYPES: BEGIN OF ty_head,
         auart TYPE c LENGTH 4,
         netwr TYPE p LENGTH 8 DECIMALS 2,
         lifsk TYPE c LENGTH 2,
       END OF ty_head.
DATA vbak TYPE ty_head.
START-OF-SELECTION.
  PERFORM userexit_save_document.
FORM userexit_save_document.
  IF vbak-auart = 'TA' AND vbak-netwr > 20000.
    vbak-lifsk = '01'.
  ENDIF.
ENDFORM.
