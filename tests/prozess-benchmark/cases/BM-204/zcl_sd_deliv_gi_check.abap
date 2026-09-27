CLASS zcl_sd_deliv_gi_check DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES tt_lips TYPE STANDARD TABLE OF lipsvb WITH DEFAULT KEY.

    CLASS-METHODS check
      IMPORTING is_likp TYPE likp
                it_lips TYPE tt_lips
      RAISING   zcx_sd_deliv_check.
ENDCLASS.



CLASS zcl_sd_deliv_gi_check IMPLEMENTATION.

  METHOD check.
    DATA: ls_vbup TYPE vbup,
          lv_land TYPE land1.

*   Warenausgang schon gebucht -> keine Pruefung mehr
    IF is_likp-wadat_ist IS NOT INITIAL.
      RETURN.
    ENDIF.

    LOOP AT it_lips INTO DATA(ls_lips) WHERE updkz <> 'D'.
*     Kommissionierstatus der Position (VBUP)
      SELECT SINGLE * FROM vbup INTO ls_vbup
        WHERE vbeln = ls_lips-vbeln
          AND posnr = ls_lips-posnr.
      IF sy-subrc = 0 AND ls_vbup-kosta = 'A'.
        RAISE EXCEPTION TYPE zcx_sd_deliv_check
          EXPORTING
            textid = zcx_sd_deliv_check=>not_picked
            posnr  = ls_lips-posnr.
      ENDIF.
*     chargenpflichtiges Material ohne Charge
      IF ls_lips-xchpf = abap_true AND ls_lips-charg IS INITIAL.
        RAISE EXCEPTION TYPE zcx_sd_deliv_check
          EXPORTING
            textid = zcx_sd_deliv_check=>batch_missing
            posnr  = ls_lips-posnr.
      ENDIF.
    ENDLOOP.

*   Exportlieferung: Route ist Pflicht
    SELECT SINGLE land1 FROM kna1 INTO lv_land
      WHERE kunnr = is_likp-kunnr.
    IF lv_land <> 'DE' AND is_likp-route IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_deliv_check
        EXPORTING
          textid = zcx_sd_deliv_check=>route_missing.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
