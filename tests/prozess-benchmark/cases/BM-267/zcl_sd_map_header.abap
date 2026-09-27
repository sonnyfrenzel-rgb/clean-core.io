CLASS zcl_sd_map_header DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_sd_seg_mapper.
ENDCLASS.



CLASS zcl_sd_map_header IMPLEMENTATION.

  METHOD zif_sd_seg_mapper~map.
    DATA: ls_k01  TYPE e1edk01,
          ls_ka1  TYPE e1edka1,
          ls_part TYPE bapiparnr.

    CASE is_edidd-segnam.
      WHEN 'E1EDK01'.
        ls_k01 = is_edidd-sdata.
*       Belegart/Vertriebsbereich aus Kunden-Bestellart
        SELECT SINGLE auart vkorg vtweg spart FROM zsd_idoc_auart
          INTO (cs_order-header-doc_type, cs_order-header-sales_org,
                cs_order-header-distr_chan, cs_order-header-division)
          WHERE bsart = ls_k01-bsart.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE zcx_sd_idoc_map
            EXPORTING
              textid = zcx_sd_idoc_map=>no_order_type
              value  = CONV #( ls_k01-bsart ).
        ENDIF.
        cs_order-header-currency   = ls_k01-curcy.
        cs_order-header-purch_no_c = ls_k01-belnr.

      WHEN 'E1EDKA1'.
        ls_ka1 = is_edidd-sdata.
        CHECK ls_ka1-parvw = 'AG' OR ls_ka1-parvw = 'WE'.
        ls_part-partn_role = ls_ka1-parvw.
        ls_part-partn_numb = |{ ls_ka1-partn ALPHA = IN }|.
        SELECT SINGLE kunnr FROM kna1 INTO @DATA(lv_kunnr)
          WHERE kunnr = @ls_part-partn_numb
            AND loevm = @space.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE zcx_sd_idoc_map
            EXPORTING
              textid = zcx_sd_idoc_map=>unknown_partner
              value  = CONV #( ls_ka1-partn ).
        ENDIF.
        APPEND ls_part TO cs_order-partners.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
