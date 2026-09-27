*----------------------------------------------------------------------*
***INCLUDE LZWM_RF_INVF01.
*----------------------------------------------------------------------*
* Alte Buchung ueber Batch-Input LI11N - seit 2019 durch
* LCL_ZAEHLUNG->SPEICHERN (L_INV_COUNT_EXT) ersetzt.
* Nicht loeschen: Revision will die alte Logik nachvollziehen koennen.
*----------------------------------------------------------------------*
*FORM zaehlung_bdc USING it_zaehl TYPE tt_zaehl.
*
*  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
*        lt_msg TYPE STANDARD TABLE OF bdcmsgcoll.
*
*  PERFORM bdc_dynpro TABLES lt_bdc USING 'SAPML04I' '0110'.
*  PERFORM bdc_field  TABLES lt_bdc USING 'LINV-LGNUM' gv_lgnum.
*  PERFORM bdc_field  TABLES lt_bdc USING 'LINV-IVNUM' go_zaehl->mv_ivnum.
*  PERFORM bdc_field  TABLES lt_bdc USING 'BDC_OKCODE' '/00'.
*
*  LOOP AT it_zaehl INTO DATA(ls_z).
*    PERFORM bdc_dynpro TABLES lt_bdc USING 'SAPML04I' '0111'.
*    PERFORM bdc_field  TABLES lt_bdc USING 'LINV-MENGA(01)' ls_z-menge.
*    PERFORM bdc_field  TABLES lt_bdc USING 'BDC_OKCODE' '=BU'.
*  ENDLOOP.
*
*  CALL TRANSACTION 'LI11N' USING lt_bdc MODE 'N' UPDATE 'S'
*                           MESSAGES INTO lt_msg.
*  IF sy-subrc <> 0.
*    MESSAGE e199 WITH gv_lgpla.
*  ENDIF.
*
*ENDFORM.
