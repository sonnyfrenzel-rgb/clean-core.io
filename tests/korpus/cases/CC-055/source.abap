REPORT zcc_ref_055.
PARAMETERS p_kunnr TYPE c LENGTH 10.
PARAMETERS p_name TYPE c LENGTH 35 LOWER CASE.
DATA gt_bdc TYPE STANDARD TABLE OF bdcdata.
DATA gt_msg TYPE STANDARD TABLE OF bdcmsgcoll.
START-OF-SELECTION.
  gt_bdc = VALUE #(
    ( program = 'SAPMF02D' dynpro = '0100' dynbegin = 'X' )
    ( fnam = 'RF02D-KUNNR' fval = p_kunnr )
    ( fnam = 'BDC_OKCODE'  fval = '/00' )
    ( program = 'SAPMF02D' dynpro = '0110' dynbegin = 'X' )
    ( fnam = 'KNA1-NAME1'  fval = p_name )
    ( fnam = 'BDC_OKCODE'  fval = '=UPDA' ) ).
  CALL TRANSACTION 'XD01' USING gt_bdc
    MODE 'N' UPDATE 'S'
    MESSAGES INTO gt_msg.
  READ TABLE gt_msg WITH KEY msgtyp = 'E' TRANSPORTING NO FIELDS.
  IF sy-subrc = 0.
    WRITE / 'BDC_ERROR'.
  ELSE.
    WRITE / 'BDC_DONE'.
  ENDIF.
