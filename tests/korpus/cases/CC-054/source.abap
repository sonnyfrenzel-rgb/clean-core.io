REPORT zcc_ref_054.
" ENHANCEMENT: logic copied from MV45AFZZ FORM userexit_save_document in 2019
TYPES: BEGIN OF ty_row,
         kunnr TYPE c LENGTH 10,
         name1 TYPE c LENGTH 35,
       END OF ty_row.
DATA gt_rows TYPE STANDARD TABLE OF ty_row.
DATA gt_fcat TYPE slis_t_fieldcat_alv.
START-OF-SELECTION.
  gt_rows = VALUE #( ( kunnr = '0000001000' name1 = 'ALPHA' )
                     ( kunnr = '0000002000' name1 = 'BETA' ) ).
  gt_fcat = VALUE #( ( fieldname = 'KUNNR' seltext_m = 'Kunde' )
                     ( fieldname = 'NAME1' seltext_m = 'Name' ) ).
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USER_COMMAND'
      it_fieldcat             = gt_fcat
    TABLES
      t_outtab                = gt_rows.
FORM user_command USING iv_ucomm LIKE sy-ucomm
                        is_selfield TYPE slis_selfield.
  IF iv_ucomm = '&IC1'.
    MESSAGE is_selfield-value TYPE 'I'.
  ENDIF.
ENDFORM.
