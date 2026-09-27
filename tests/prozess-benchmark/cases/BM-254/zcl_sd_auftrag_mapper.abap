CLASS zcl_sd_auftrag_mapper DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: tt_item     TYPE STANDARD TABLE OF bapisditm WITH EMPTY KEY,
           tt_itemx    TYPE STANDARD TABLE OF bapisditmx WITH EMPTY KEY,
           tt_schedule TYPE STANDARD TABLE OF bapischdl WITH EMPTY KEY,
           tt_partner  TYPE STANDARD TABLE OF bapiparnr WITH EMPTY KEY.

    METHODS map_kopf
      IMPORTING is_deep        TYPE zcl_zsd_auftrag_mpc_ext=>ts_deep_auftrag
      RETURNING VALUE(rs_kopf) TYPE bapisdhd1.

    METHODS map_positionen
      IMPORTING is_deep     TYPE zcl_zsd_auftrag_mpc_ext=>ts_deep_auftrag
      EXPORTING et_item     TYPE tt_item
                et_itemx    TYPE tt_itemx
                et_schedule TYPE tt_schedule
      RAISING   zcx_sd_auftrag.

    METHODS map_partner
      IMPORTING is_deep           TYPE zcl_zsd_auftrag_mpc_ext=>ts_deep_auftrag
      RETURNING VALUE(rt_partner) TYPE tt_partner.
ENDCLASS.



CLASS zcl_sd_auftrag_mapper IMPLEMENTATION.

  METHOD map_kopf.
    rs_kopf-doc_type   = COND #( WHEN is_deep-auart IS INITIAL THEN 'ZOR' ELSE is_deep-auart ).
    rs_kopf-sales_org  = is_deep-vkorg.
    rs_kopf-distr_chan = is_deep-vtweg.
    rs_kopf-division   = is_deep-spart.
    rs_kopf-purch_no_c = is_deep-bestellnr_kunde.
    rs_kopf-purch_date = sy-datum.
    rs_kopf-req_date_h = is_deep-wunschdatum.

*   Eilauftrag aus dem Webshop: Versandbedingung Express
    IF is_deep-eilig = abap_true.
      rs_kopf-ship_cond = '10'.
    ENDIF.
  ENDMETHOD.


  METHOD map_positionen.
    DATA: lv_posnr TYPE posnr_va,
          lv_matnr TYPE matnr,
          lv_meins TYPE meins.

    CLEAR: et_item, et_itemx, et_schedule.

    LOOP AT is_deep-toitems INTO DATA(ls_pos).
      lv_posnr = sy-tabix * 10.

      IF ls_pos-menge <= 0.
        RAISE EXCEPTION TYPE zcx_sd_auftrag
          EXPORTING
            textid    = VALUE #( msgid = zcx_sd_auftrag=>gc_msgid msgno = '030' attr1 = 'MV_OBJEKT' )
            mv_objekt = CONV #( ls_pos-matnr ).
      ENDIF.

      CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
        EXPORTING
          input        = ls_pos-matnr
        IMPORTING
          output       = lv_matnr
        EXCEPTIONS
          length_error = 1
          OTHERS       = 2.
      IF sy-subrc <> 0.
        lv_matnr = ls_pos-matnr.
      ENDIF.

      CALL FUNCTION 'CONVERSION_EXIT_CUNIT_INPUT'
        EXPORTING
          input          = ls_pos-meins
          language       = sy-langu
        IMPORTING
          output         = lv_meins
        EXCEPTIONS
          unit_not_found = 1
          OTHERS         = 2.
      IF sy-subrc <> 0.
        CLEAR lv_meins.            "Basismengeneinheit aus Materialstamm
      ENDIF.

      APPEND VALUE #( itm_number = lv_posnr
                      material_long = lv_matnr
                      target_qty = ls_pos-menge
                      target_qu  = lv_meins
                      plant      = ls_pos-werk ) TO et_item.
      APPEND VALUE #( itm_number = lv_posnr
                      updateflag = 'I'
                      material_long = abap_true
                      target_qty = abap_true
                      target_qu  = xsdbool( lv_meins IS NOT INITIAL )
                      plant      = xsdbool( ls_pos-werk IS NOT INITIAL ) ) TO et_itemx.
      APPEND VALUE #( itm_number = lv_posnr
                      sched_line = '0001'
                      req_date   = COND #( WHEN ls_pos-wunschdatum IS INITIAL
                                           THEN is_deep-wunschdatum
                                           ELSE ls_pos-wunschdatum )
                      req_qty    = ls_pos-menge ) TO et_schedule.
    ENDLOOP.
  ENDMETHOD.


  METHOD map_partner.
    rt_partner = VALUE #( ( partn_role = 'AG' partn_numb = is_deep-kunnr ) ).

*   abweichender Warenempfaenger nur, wenn im Shop gepflegt
    IF is_deep-warenempf IS NOT INITIAL AND is_deep-warenempf <> is_deep-kunnr.
      APPEND VALUE #( partn_role = 'WE' partn_numb = is_deep-warenempf ) TO rt_partner.
    ELSE.
      APPEND VALUE #( partn_role = 'WE' partn_numb = is_deep-kunnr ) TO rt_partner.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
