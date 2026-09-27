CLASS zcl_sd_seg_itm DEFINITION
  PUBLIC
  INHERITING FROM zcl_sd_seg_handler
  FINAL
  CREATE PUBLIC.
* Positionssegment Z1SHPI der Versandbestaetigung
  PROTECTED SECTION.
    METHODS validate REDEFINITION.
    METHODS apply REDEFINITION.
  PRIVATE SECTION.
    DATA: mv_lfimg TYPE lfimg,
          mv_werks TYPE werks_d.
ENDCLASS.



CLASS zcl_sd_seg_itm IMPLEMENTATION.

  METHOD validate.
    DATA: ls_itm TYPE z1shpi,
          lv_tol TYPE p LENGTH 5 DECIMALS 2.

    super->validate( is_edidd = is_edidd is_ctx = is_ctx ).

    ls_itm = is_edidd-sdata.
*   Kopf muss vor den Positionen kommen
    IF is_ctx-vbeln IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>item_without_header.
    ENDIF.

    SELECT SINGLE lfimg werks FROM lips INTO (mv_lfimg, mv_werks)
      WHERE vbeln = is_ctx-vbeln
        AND posnr = ls_itm-posnr.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>unknown_item.
    ENDIF.

*   Ueberpicktoleranz je Werk, Standard 0 %
    SELECT SINGLE tolpct FROM zsd_shp_tol INTO lv_tol
      WHERE werks = mv_werks.
    IF sy-subrc <> 0.
      lv_tol = 0.
    ENDIF.
    IF ls_itm-pikmg > mv_lfimg * ( 100 + lv_tol ) / 100.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>overpick.
    ENDIF.
  ENDMETHOD.


  METHOD apply.
    DATA: ls_itm   TYPE z1shpi,
          ls_vbpok TYPE vbpok.

    ls_itm = is_edidd-sdata.
    ls_vbpok-vbeln_vl = cs_ctx-vbeln.
    ls_vbpok-posnr_vl = ls_itm-posnr.
    ls_vbpok-vbeln    = cs_ctx-vbeln.
    ls_vbpok-posnn    = ls_itm-posnr.
    ls_vbpok-pikmg    = ls_itm-pikmg.

    IF ls_itm-charg IS NOT INITIAL.
      SELECT SINGLE charg FROM mch1 INTO @DATA(lv_charg)
        WHERE matnr = @ls_itm-matnr
          AND charg = @ls_itm-charg.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_sd_shpconf
          EXPORTING
            textid = zcx_sd_shpconf=>unknown_batch.
      ENDIF.
      ls_vbpok-charg = ls_itm-charg.
    ENDIF.

*   Nullmenge = Position nicht geliefert, trotzdem melden (Pickmenge 0)
    APPEND ls_vbpok TO cs_ctx-items.
  ENDMETHOD.

ENDCLASS.
