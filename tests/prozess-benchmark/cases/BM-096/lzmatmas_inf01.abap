*----------------------------------------------------------------------*
***INCLUDE LZMATMAS_INF01 - Segmentauswertung
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form PARSE_SEGMENTS
*&---------------------------------------------------------------------*
*& Überträgt die Segmente eines IDocs in die BAPI-Strukturen.
*& Unbekannte Segmente werden ignoriert.
*&---------------------------------------------------------------------*
FORM parse_segments TABLES pt_data   STRUCTURE edidd
                    USING  pv_docnum TYPE edi_docnum.
  DATA: ls_edidd TYPE edidd,
        ls_makt  TYPE bapi_makt,
        ls_marc  TYPE bapi_marc,
        ls_marm  TYPE bapi_marm,
        ls_marmx TYPE bapi_marmx,
        ls_ext   TYPE bapiparex,
        ls_extx  TYPE bapiparexx,
        ls_te    TYPE bapi_te_mara,
        ls_tex   TYPE bapi_te_marax.

  CLEAR: gs_head, gs_mara, gs_marax, gt_marc, gt_makt,
         gt_marm, gt_marmx, gt_extin, gt_extinx.

  LOOP AT pt_data INTO ls_edidd WHERE docnum = pv_docnum.
    CASE ls_edidd-segnam.

      WHEN 'ZE1MARAM'.
        gs_e1maram = ls_edidd-sdata.
        CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
          EXPORTING
            input        = gs_e1maram-matnr
          IMPORTING
            output       = gs_head-material
          EXCEPTIONS
            length_error = 1
            OTHERS       = 2.
        gs_head-ind_sector = gs_e1maram-mbrsh.
        gs_head-matl_type  = gs_e1maram-mtart.
        gs_head-basic_view = 'X'.
        map_field gs_mara gs_marax matl_group.
        map_field gs_mara gs_marax base_uom.
        map_field gs_mara gs_marax old_mat_no.
        map_field gs_mara gs_marax net_weight.
        map_field gs_mara gs_marax unit_of_wt.
        map_field gs_mara gs_marax prod_hier.
*       map_field gs_mara gs_marax pur_status.  "Einkaufssperre - fachlich abgelehnt 2013

      WHEN 'ZE1MAKTM'.
        gs_e1maktm = ls_edidd-sdata.
        ls_makt-langu     = gs_e1maktm-spras.
        ls_makt-matl_desc = gs_e1maktm-maktx.
        APPEND ls_makt TO gt_makt.

      WHEN 'ZE1MARCM'.
        gs_e1marcm = ls_edidd-sdata.
        CLEAR ls_marc.
        ls_marc-plant      = gs_e1marcm-werks.
        ls_marc-mrp_type   = gs_e1marcm-dismm.
        ls_marc-mrp_ctrler = gs_e1marcm-dispo.
        ls_marc-pur_group  = gs_e1marcm-ekgrp.
        ls_marc-proc_type  = gs_e1marcm-beskz.
        ls_marc-profit_ctr = gs_e1marcm-prctr.
        APPEND ls_marc TO gt_marc.

      WHEN 'ZE1MARMM'.
        gs_e1marmm = ls_edidd-sdata.
        ls_marm-alt_unit   = gs_e1marmm-meinh.
        ls_marm-numerator  = gs_e1marmm-umrez.
        ls_marm-denominatr = gs_e1marmm-umren.
        APPEND ls_marm TO gt_marm.
        ls_marmx-alt_unit   = gs_e1marmm-meinh.
        ls_marmx-numerator  = 'X'.
        ls_marmx-denominatr = 'X'.
        APPEND ls_marmx TO gt_marmx.

      WHEN 'ZE1ZMAT'.
*       Kundenfelder MARA-ZZ* über EXTENSIONIN
        gs_e1zmat = ls_edidd-sdata.
        ls_te-material       = gs_head-material.
        ls_te-zzdesign_owner = gs_e1zmat-zzdesign_owner.
        ls_te-zzrohs         = gs_e1zmat-zzrohs.
        ls_tex-material       = gs_head-material.
        ls_tex-zzdesign_owner = 'X'.
        ls_tex-zzrohs         = 'X'.
        ls_ext-structure  = 'BAPI_TE_MARA'.
        ls_ext-valuepart1 = ls_te.
        APPEND ls_ext TO gt_extin.
        ls_extx-structure  = 'BAPI_TE_MARAX'.
        ls_extx-valuepart1 = ls_tex.
        APPEND ls_extx TO gt_extinx.

    ENDCASE.
  ENDLOOP.
ENDFORM.
