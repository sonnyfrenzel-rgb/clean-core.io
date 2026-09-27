*&---------------------------------------------------------------------*
*& Report ZFI_OP_ALTERUNG
*&---------------------------------------------------------------------*
*& Altersstruktur offener Debitorenposten je Buchungskreis
*& (Faelligkeitsraster 0-30 / 31-60 / 61-90 / >90 Tage).
*& Rechenteil seit 2022 per AMDP auf HANA (vorher LOOP ueber BSID).
*&---------------------------------------------------------------------*
REPORT zfi_op_alterung.

TABLES: t001.

SELECT-OPTIONS: s_bukrs FOR t001-bukrs OBLIGATORY.
PARAMETERS:     p_stich TYPE sy-datum DEFAULT sy-datum,
                p_min   TYPE wrbtr DEFAULT '0.00'.

DATA: gt_raster TYPE zcl_fi_aging_amdp=>tt_raster,
      go_alv    TYPE REF TO cl_salv_table,
      gx_amdp   TYPE REF TO cx_amdp_error,
      gx_salv   TYPE REF TO cx_salv_msg.

AT SELECTION-SCREEN.
  LOOP AT s_bukrs WHERE sign = 'I' AND option = 'EQ'.
    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
      ID 'BUKRS' FIELD s_bukrs-low
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      MESSAGE e800(fr) WITH s_bukrs-low.
    ENDIF.
  ENDLOOP.

START-OF-SELECTION.
  TRY.
      zcl_fi_aging_amdp=>get_raster(
        EXPORTING
          iv_mandt   = sy-mandt
          iv_stichtag = p_stich
          iv_where   = cl_shdb_seltab=>combine_seltabs(
                         it_named_seltabs = VALUE #( ( name = 'BUKRS' dref = REF #( s_bukrs[] ) ) ) )
        IMPORTING
          et_raster  = gt_raster ).
    CATCH cx_amdp_error INTO gx_amdp.
      MESSAGE gx_amdp->get_text( ) TYPE 'I' DISPLAY LIKE 'E'.
      RETURN.
  ENDTRY.

* Kleinstbetraege ausblenden
  DELETE gt_raster WHERE summe < p_min.

  IF gt_raster IS INITIAL.
    MESSAGE s004(zfi_op).
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = go_alv
        CHANGING  t_table      = gt_raster ).
      go_alv->get_functions( )->set_all( abap_true ).
      go_alv->get_columns( )->set_optimize( abap_true ).
      go_alv->display( ).
    CATCH cx_salv_msg INTO gx_salv.
      MESSAGE gx_salv TYPE 'E'.
  ENDTRY.
