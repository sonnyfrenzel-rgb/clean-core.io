CLASS zcl_sd_atp_check DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Verfügbarkeitsprüfung je Kundenauftrag für das Innendienst-Cockpit
* 2018-11 PKR  (ersetzt Z_SD_ATP_POPUP)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_short,
             posnr   TYPE vbap-posnr,
             matnr   TYPE vbap-matnr,
             werks   TYPE vbap-werks,
             bedarf  TYPE vbap-kwmeng,
             verfueg TYPE vbap-kwmeng,
             fehl    TYPE vbap-kwmeng,
           END OF ty_short,
           tt_short TYPE STANDARD TABLE OF ty_short WITH DEFAULT KEY.

    METHODS check_order
      IMPORTING iv_vbeln        TYPE vbeln_va
      RETURNING VALUE(rt_short) TYPE tt_short
      RAISING   zcx_sd_atp.
  PRIVATE SECTION.
    CONSTANTS c_checkrule TYPE prreg VALUE 'A'.
ENDCLASS.

CLASS zcl_sd_atp_check IMPLEMENTATION.
  METHOD check_order.
    DATA: lt_wmdvsx TYPE STANDARD TABLE OF bapiwmdvs,
          lt_wmdvex TYPE STANDARD TABLE OF bapiwmdve,
          ls_wmdve  TYPE bapiwmdve,
          ls_return TYPE bapireturn,
          lv_avail  TYPE vbap-kwmeng,
          ls_short  TYPE ty_short.

    SELECT p~posnr, p~matnr, p~werks, p~kwmeng, p~meins, u~lfsta
      FROM vbap AS p
      INNER JOIN vbup AS u ON u~vbeln = p~vbeln AND u~posnr = p~posnr
      WHERE p~vbeln = @iv_vbeln
        AND p~abgru = @space
      INTO TABLE @DATA(lt_items).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_atp EXPORTING textid = zcx_sd_atp=>no_items.
    ENDIF.

    LOOP AT lt_items INTO DATA(ls_item).
      IF ls_item-lfsta = 'C'.
        CONTINUE.                       "voll beliefert
      ENDIF.
      CLEAR: lt_wmdvsx, lt_wmdvex, lv_avail.
      CALL FUNCTION 'BAPI_MATERIAL_AVAILABILITY'
        EXPORTING
          plant      = ls_item-werks
          material   = ls_item-matnr
          unit       = ls_item-meins
          check_rule = c_checkrule
        IMPORTING
          return     = ls_return
        TABLES
          wmdvsx     = lt_wmdvsx
          wmdvex     = lt_wmdvex.
      IF ls_return-type = 'E'.
        RAISE EXCEPTION TYPE zcx_sd_atp
          EXPORTING textid = zcx_sd_atp=>bapi_error
                    matnr  = ls_item-matnr.
      ENDIF.
*     nur heute schon bestätigte Mengen zählen
      LOOP AT lt_wmdvex INTO ls_wmdve WHERE com_date <= sy-datum.
        lv_avail = lv_avail + ls_wmdve-com_qty.
      ENDLOOP.
      IF lv_avail < ls_item-kwmeng.
        ls_short = VALUE #( posnr   = ls_item-posnr
                            matnr   = ls_item-matnr
                            werks   = ls_item-werks
                            bedarf  = ls_item-kwmeng
                            verfueg = lv_avail
                            fehl    = ls_item-kwmeng - lv_avail ).
        APPEND ls_short TO rt_short.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
