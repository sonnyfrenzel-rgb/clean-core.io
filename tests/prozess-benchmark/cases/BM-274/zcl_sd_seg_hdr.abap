CLASS zcl_sd_seg_hdr DEFINITION
  PUBLIC
  INHERITING FROM zcl_sd_seg_handler
  FINAL
  CREATE PUBLIC.
* Kopfsegment Z1SHPH der Versandbestaetigung
  PROTECTED SECTION.
    METHODS validate REDEFINITION.
    METHODS apply REDEFINITION.
ENDCLASS.



CLASS zcl_sd_seg_hdr IMPLEMENTATION.

  METHOD validate.
    DATA: ls_hdr   TYPE z1shph,
          lv_wbstk TYPE wbstk.

    super->validate( is_edidd = is_edidd is_ctx = is_ctx ).

    ls_hdr = is_edidd-sdata.
    SELECT SINGLE vbeln FROM likp INTO @DATA(lv_vbeln)
      WHERE vbeln = @ls_hdr-vbeln.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>unknown_delivery.
    ENDIF.

*   Warenausgang schon gebucht? (Gesamtstatus aus VBUK)
    SELECT SINGLE wbstk FROM vbuk INTO lv_wbstk
      WHERE vbeln = ls_hdr-vbeln.
    IF lv_wbstk = 'C'.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>already_issued.
    ENDIF.
  ENDMETHOD.


  METHOD apply.
    DATA ls_hdr TYPE z1shph.

    ls_hdr = is_edidd-sdata.
    cs_ctx-vbeln       = ls_hdr-vbeln.
    cs_ctx-goods_issue = xsdbool( ls_hdr-gi_flag = 'X' ).
    cs_ctx-gi_date     = ls_hdr-gi_date.
    IF cs_ctx-gi_date IS INITIAL.
*     Dienstleister schickt Datum nicht immer mit
      cs_ctx-gi_date = sy-datum.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
