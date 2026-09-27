*&---------------------------------------------------------------------*
*& Include ZRT_KATALOG_IMPORT_F02 - Ausgabe, Altlasten
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_AUSGEBEN
*&---------------------------------------------------------------------*
FORM protokoll_ausgeben.
  DATA: lo_alv   TYPE REF TO cl_salv_table,
        lv_fehler TYPE i.

  lv_fehler = REDUCE i( INIT n = 0
                        FOR p IN gt_prot WHERE ( typ = 'E' )
                        NEXT n = n + 1 ).
  IF lv_fehler > 0.
    MESSAGE s010 WITH lv_fehler DISPLAY LIKE 'W'.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_prot ).
      lo_alv->get_columns( )->set_optimize( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      LOOP AT gt_prot INTO DATA(ls_prot).
        WRITE: / ls_prot-lief_artnr, ls_prot-matnr, ls_prot-typ, ls_prot-text.
      ENDLOOP.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PREISE_PFLEGEN
*&---------------------------------------------------------------------*
*       2014: EK/VK-Preis aus Katalog als Konditionen (Batch-Input VK11)
*       Nach Einfuehrung der Kalkulation (2016) nicht mehr aufgerufen.
*----------------------------------------------------------------------*
FORM preise_pflegen USING us_kat   TYPE ty_kat
                          uv_matnr TYPE matnr.
  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata.

  IF 1 = 2.
    MESSAGE e020.                     "Verwendungsnachweis
  ENDIF.

  APPEND VALUE #( program = 'SAPMV13A' dynpro = '0100' dynbegin = 'X' ) TO lt_bdc.
  APPEND VALUE #( fnam = 'RV13A-KSCHL' fval = 'VKP0' ) TO lt_bdc.
  APPEND VALUE #( fnam = 'BDC_OKCODE'  fval = '/00' ) TO lt_bdc.
  APPEND VALUE #( program = 'SAPMV13A' dynpro = '1004' dynbegin = 'X' ) TO lt_bdc.
  APPEND VALUE #( fnam = 'KOMG-VKORG'   fval = p_vkorg ) TO lt_bdc.
  APPEND VALUE #( fnam = 'KOMG-VTWEG'   fval = p_vtweg ) TO lt_bdc.
  APPEND VALUE #( fnam = 'KOMG-MATNR(01)' fval = uv_matnr ) TO lt_bdc.
  APPEND VALUE #( fnam = 'KONP-KBETR(01)' fval = us_kat-vk_preis ) TO lt_bdc.
  APPEND VALUE #( fnam = 'BDC_OKCODE'  fval = '=SICH' ) TO lt_bdc.

  CALL TRANSACTION 'VK11' USING lt_bdc MODE 'N' UPDATE 'S'.
ENDFORM.
