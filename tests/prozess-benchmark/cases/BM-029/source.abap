REPORT zmm_charge_verfall.
*----------------------------------------------------------------------*
* Job ZMM_VERFALL (taeglich 05:00): Chargen mit abgelaufenem bzw. bald
* ablaufendem MHD vom freien in den gesperrten Bestand umbuchen (344)
*----------------------------------------------------------------------*
TABLES mchb.
SELECT-OPTIONS: s_werks FOR mchb-werks OBLIGATORY,
                s_lgort FOR mchb-lgort.
PARAMETERS: p_tage TYPE i DEFAULT 0,
            p_post AS CHECKBOX.

TYPES: BEGIN OF ty_out,
         matnr TYPE mchb-matnr,
         werks TYPE mchb-werks,
         lgort TYPE mchb-lgort,
         charg TYPE mchb-charg,
         clabs TYPE mchb-clabs,
         vfdat TYPE mch1-vfdat,
         mblnr TYPE mblnr,
         text  TYPE char50,
       END OF ty_out.
DATA: gt_out   TYPE STANDARD TABLE OF ty_out,
      gv_datum TYPE sy-datum.

START-OF-SELECTION.
  gv_datum = sy-datum + p_tage.
  PERFORM select_chargen.
  IF gt_out IS INITIAL.
    WRITE / 'Keine Chargen mit Verfall'.
    STOP.
  ENDIF.
  IF p_post = 'X'.
    PERFORM umbuchen.
  ENDIF.
  PERFORM anzeigen.

*&---------------------------------------------------------------------*
FORM select_chargen.
  SELECT b~matnr b~werks b~lgort b~charg b~clabs h~vfdat
    INTO CORRESPONDING FIELDS OF TABLE gt_out
    FROM mchb AS b INNER JOIN mch1 AS h
      ON h~matnr = b~matnr AND h~charg = b~charg
    WHERE b~werks IN s_werks
      AND b~lgort IN s_lgort
      AND b~clabs > 0
      AND h~vfdat <> '00000000'
      AND h~vfdat <= gv_datum.
ENDFORM.

*&---------------------------------------------------------------------*
FORM umbuchen.
  DATA: ls_head   TYPE bapi2017_gm_head_01,
        ls_code   TYPE bapi2017_gm_code,
        lt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        ls_item   TYPE bapi2017_gm_item_create,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2.
  FIELD-SYMBOLS <ls_out> TYPE ty_out.

  ls_code-gm_code    = '04'.  ls_head-pstng_date = sy-datum.
  ls_head-header_txt = 'MHD-Sperre automatisch'.
  LOOP AT gt_out ASSIGNING <ls_out>.
    CLEAR: lt_item, lt_return, ls_item.
    ls_item-material  = <ls_out>-matnr.
    ls_item-plant     = <ls_out>-werks.
    ls_item-stge_loc  = <ls_out>-lgort.
    ls_item-batch     = <ls_out>-charg.
    ls_item-move_type = '344'.
    ls_item-entry_qnt = <ls_out>-clabs.
    APPEND ls_item TO lt_item.
    CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
      EXPORTING
        goodsmvt_header  = ls_head
        goodsmvt_code    = ls_code
      IMPORTING
        materialdocument = <ls_out>-mblnr
      TABLES
        goodsmvt_item    = lt_item
        return           = lt_return.
    IF <ls_out>-mblnr IS INITIAL.
      READ TABLE lt_return INTO ls_return INDEX 1.
      <ls_out>-text = ls_return-message.
      ROLLBACK WORK.
    ELSE.
      <ls_out>-text = 'in Sperrbestand umgebucht'.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
FORM anzeigen.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_structure_name = 'ZMM_S_VERFALL'
    TABLES
      t_outtab         = gt_out
    EXCEPTIONS
      OTHERS           = 1.
ENDFORM.
