CLASS zcl_sd_pick_split DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Gewichtssplit und Kommissionierung einer Auslieferung
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_item,
             posnr TYPE lips-posnr,
             matnr TYPE lips-matnr,
             werks TYPE lips-werks,
             lgort TYPE lips-lgort,
             charg TYPE lips-charg,
             lfimg TYPE lips-lfimg,
             vrkme TYPE lips-vrkme,
             brgew TYPE lips-brgew,
             gewei TYPE lips-gewei,
           END OF ty_item,
           tt_item       TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,
           tt_split_item TYPE STANDARD TABLE OF bapidlvitemspl WITH DEFAULT KEY.

    METHODS constructor
      IMPORTING iv_vbeln TYPE vbeln_vl
                iv_maxgw TYPE brgew
      RAISING   zcx_sd_pick.
    METHODS determine_split
      RETURNING VALUE(rt_split) TYPE tt_split_item.
    METHODS remove_split_items
      IMPORTING it_split TYPE tt_split_item.
    METHODS pick
      IMPORTING iv_test TYPE xfeld
      EXPORTING ev_text TYPE bapi_msg.

  PRIVATE SECTION.
    DATA: mv_vbeln TYPE vbeln_vl,
          mv_maxgw TYPE brgew,
          mt_items TYPE tt_item.
ENDCLASS.



CLASS zcl_sd_pick_split IMPLEMENTATION.

  METHOD constructor.
    FIELD-SYMBOLS <ls_item> TYPE ty_item.

    mv_vbeln = iv_vbeln.
    mv_maxgw = iv_maxgw.

    SELECT posnr matnr werks lgort charg lfimg vrkme brgew gewei
      FROM lips INTO TABLE mt_items
      WHERE vbeln = iv_vbeln
        AND lfimg > 0.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_pick
        EXPORTING textid = zcx_sd_pick=>no_items vbeln = iv_vbeln.
    ENDIF.

*   Gewichte einheitlich in kg
    LOOP AT mt_items ASSIGNING <ls_item> WHERE gewei <> 'KG'.
      CALL FUNCTION 'UNIT_CONVERSION_SIMPLE'
        EXPORTING
          input    = <ls_item>-brgew
          unit_in  = <ls_item>-gewei
          unit_out = 'KG'
        IMPORTING
          output   = <ls_item>-brgew
        EXCEPTIONS
          OTHERS   = 1.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_sd_pick
          EXPORTING textid = zcx_sd_pick=>weight_unit vbeln = iv_vbeln.
      ENDIF.
      <ls_item>-gewei = 'KG'.
    ENDLOOP.
  ENDMETHOD.


  METHOD determine_split.
    DATA lv_sum TYPE brgew.

    SORT mt_items BY posnr.
    LOOP AT mt_items INTO DATA(ls_item).
*     eine einzelne Position über dem Maximum bleibt in der Lieferung
      IF lv_sum = 0 OR lv_sum + ls_item-brgew <= mv_maxgw.
        lv_sum = lv_sum + ls_item-brgew.
      ELSE.
        APPEND VALUE #( deliv_numb = mv_vbeln
                        deliv_item = ls_item-posnr
                        dlv_qty    = ls_item-lfimg
                        sales_unit = ls_item-vrkme ) TO rt_split.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD remove_split_items.
    LOOP AT it_split INTO DATA(ls_split).
      DELETE mt_items WHERE posnr = ls_split-deliv_item.
    ENDLOOP.
  ENDMETHOD.


  METHOD pick.
    DATA: ls_vbkok  TYPE vbkok,
          lt_vbpok  TYPE STANDARD TABLE OF vbpok,
          lv_xchpf  TYPE marc-xchpf,
          lv_ohne   TYPE i,
          lv_error  TYPE xfeld.

    LOOP AT mt_items INTO DATA(ls_item).
      SELECT SINGLE xchpf FROM marc INTO lv_xchpf
        WHERE matnr = ls_item-matnr
          AND werks = ls_item-werks.
      IF lv_xchpf = abap_true AND ls_item-charg IS INITIAL.
        lv_ohne = lv_ohne + 1.            "Charge wird im Lager gefunden
        CONTINUE.
      ENDIF.
      APPEND VALUE #( vbeln_vl = mv_vbeln
                      posnr_vl = ls_item-posnr
                      vbeln    = mv_vbeln
                      posnn    = ls_item-posnr
                      matnr    = ls_item-matnr
                      charg    = ls_item-charg
                      lfimg    = ls_item-lfimg
                      pikmg    = ls_item-lfimg
                      vrkme    = ls_item-vrkme ) TO lt_vbpok.
    ENDLOOP.

    IF lt_vbpok IS INITIAL.
      ev_text = |Keine Position kommissionierbar ({ lv_ohne } ohne Charge)|.
      RETURN.
    ENDIF.

    IF iv_test = abap_true.
      ev_text = |Testlauf: { lines( lt_vbpok ) } Pos. kommissionierbar, | &&
                |{ lv_ohne } ohne Charge|.
      RETURN.
    ENDIF.

    ls_vbkok-vbeln_vl = mv_vbeln.
    ls_vbkok-komue    = abap_true.       "Kommissioniermenge übernehmen

    CALL FUNCTION 'WS_DELIVERY_UPDATE'
      EXPORTING
        vbkok_wa       = ls_vbkok
        synchron       = abap_true
        commit         = abap_true
        delivery       = mv_vbeln
        update_picking = abap_true
        nicht_sperren  = abap_true
      IMPORTING
        ef_error_any_0 = lv_error
      TABLES
        vbpok_tab      = lt_vbpok
      EXCEPTIONS
        error_message  = 1
        OTHERS         = 2.
    IF sy-subrc <> 0 OR lv_error = abap_true.
      ev_text = 'Kommissionierung fehlgeschlagen'.
    ELSE.
      ev_text = |{ lines( lt_vbpok ) } Pos. kommissioniert, | &&
                |{ lv_ohne } ohne Charge offen|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
