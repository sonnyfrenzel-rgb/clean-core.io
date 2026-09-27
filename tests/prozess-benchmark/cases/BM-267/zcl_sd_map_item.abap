CLASS zcl_sd_map_item DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_sd_seg_mapper.
ENDCLASS.



CLASS zcl_sd_map_item IMPLEMENTATION.

  METHOD zif_sd_seg_mapper~map.
    DATA: ls_p01   TYPE e1edp01,
          ls_p19   TYPE e1edp19,
          ls_item  TYPE bapisditm,
          ls_sched TYPE bapischdl,
          lv_matnr TYPE matnr.

    CASE is_edidd-segnam.
      WHEN 'E1EDP01'.
        ls_p01 = is_edidd-sdata.
        IF ls_p01-menge IS INITIAL OR ls_p01-menge CO ' 0.'.
          RAISE EXCEPTION TYPE zcx_sd_idoc_map
            EXPORTING
              textid = zcx_sd_idoc_map=>no_quantity
              value  = CONV #( ls_p01-posex ).
        ENDIF.
        ls_item-itm_number = ls_p01-posex.
        ls_item-target_qty = ls_p01-menge.
        ls_item-target_qu  = ls_p01-menee.
        APPEND ls_item TO cs_order-items.
        ls_sched-itm_number = ls_p01-posex.
        ls_sched-req_qty    = ls_p01-menge.
        APPEND ls_sched TO cs_order-schedules.

      WHEN 'E1EDP19'.
        ls_p19 = is_edidd-sdata.
        CHECK ls_p19-qualf = '001'.          "001 = Kundenmaterial
        READ TABLE cs_order-partners INTO DATA(ls_ag) WITH KEY partn_role = 'AG'.
        SELECT SINGLE matnr FROM knmt INTO lv_matnr
          WHERE vkorg = cs_order-header-sales_org
            AND vtweg = cs_order-header-distr_chan
            AND kunnr = ls_ag-partn_numb
            AND kdmat = ls_p19-idtnr.
        IF sy-subrc <> 0.
*         Altlast 2009: manche Kunden schicken unsere Materialnummer als "Kundenmaterial"
          lv_matnr = ls_p19-idtnr.
          SELECT SINGLE matnr FROM mara INTO lv_matnr
            WHERE matnr = lv_matnr.
          IF sy-subrc <> 0.
            RAISE EXCEPTION TYPE zcx_sd_idoc_map
              EXPORTING
                textid = zcx_sd_idoc_map=>unknown_material
                value  = CONV #( ls_p19-idtnr ).
          ENDIF.
        ENDIF.
        cs_order-items[ lines( cs_order-items ) ]-material = lv_matnr.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
