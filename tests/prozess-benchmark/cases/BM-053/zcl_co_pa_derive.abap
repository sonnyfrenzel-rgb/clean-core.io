CLASS zcl_co_pa_derive DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS derive_region
      IMPORTING iv_date     TYPE sy-datum
      CHANGING  cs_item     TYPE ce1zgo1
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    CLASS-METHODS derive_segment
      CHANGING  cs_item     TYPE ce1zgo1
      RETURNING VALUE(rv_ok) TYPE abap_bool.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_regbuf,
             kunnr TYPE kunnr,
             wwreg TYPE rkeg_wwreg,
           END OF ty_regbuf,
           BEGIN OF ty_map,
             regio TYPE regio,
             datab TYPE datab,
             wwreg TYPE rkeg_wwreg,
           END OF ty_map.
    CLASS-DATA gt_regbuf TYPE HASHED TABLE OF ty_regbuf WITH UNIQUE KEY kunnr.
ENDCLASS.

CLASS zcl_co_pa_derive IMPLEMENTATION.

  METHOD derive_region.
    DATA: ls_buf   TYPE ty_regbuf,
          lt_map   TYPE STANDARD TABLE OF ty_map,
          lv_land1 TYPE land1_gp,
          lv_regio TYPE regio,
          lv_wwreg TYPE rkeg_wwreg.

    rv_ok = abap_false.
    IF cs_item-kndnr IS INITIAL.
*     ohne Kunde (z.B. Sachkontenbuchung) keine Region - kein Fehler
      rv_ok = abap_true.
      RETURN.
    ENDIF.

    READ TABLE gt_regbuf INTO ls_buf WITH TABLE KEY kunnr = cs_item-kndnr.
    IF sy-subrc = 0.
      cs_item-wwreg = ls_buf-wwreg.
      rv_ok = abap_true.
      RETURN.
    ENDIF.

    SELECT SINGLE land1 regio FROM kna1 INTO (lv_land1, lv_regio)
      WHERE kunnr = cs_item-kndnr.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

*   Eintrag zur Region vor Landes-Eintrag '*', juengstes DATAB zuerst
    SELECT regio datab wwreg FROM zco_region_map INTO TABLE lt_map
      WHERE land1 = lv_land1
        AND ( regio = lv_regio OR regio = '*' )
        AND datab <= iv_date
      ORDER BY regio DESCENDING datab DESCENDING.
    IF sy-subrc <> 0.
      lv_wwreg = 'SONST'.
    ELSE.
      lv_wwreg = lt_map[ 1 ]-wwreg.
    ENDIF.

    cs_item-wwreg = lv_wwreg.
    INSERT VALUE #( kunnr = cs_item-kndnr wwreg = lv_wwreg ) INTO TABLE gt_regbuf.
    rv_ok = abap_true.
  ENDMETHOD.

  METHOD derive_segment.
    DATA: lv_matnr TYPE c LENGTH 18,          " Altlast: MATNR 18-stellig
          lv_spart TYPE spart,
          lv_matkl TYPE matkl,
          lv_kdgrp TYPE kdgrp.

    rv_ok = abap_true.
    lv_matnr = cs_item-artnr.
    IF lv_matnr IS NOT INITIAL.
      SELECT SINGLE spart matkl FROM mara INTO (lv_spart, lv_matkl)
        WHERE matnr = lv_matnr.
    ENDIF.
    IF lv_spart IS INITIAL.
      lv_spart = cs_item-spart.
    ENDIF.

    SELECT SINGLE kdgrp FROM knvv INTO lv_kdgrp
      WHERE kunnr = cs_item-kndnr
        AND vkorg = cs_item-vkorg
        AND vtweg = cs_item-vtweg
        AND spart = cs_item-spart.

*   1. Kundengruppe + Sparte, 2. Materialgruppe (Kundengruppe '**')
    SELECT SINGLE wwseg FROM zco_segmap INTO cs_item-wwseg
      WHERE kdgrp = lv_kdgrp
        AND spart = lv_spart.
    IF sy-subrc <> 0.
      SELECT SINGLE wwseg FROM zco_segmap INTO cs_item-wwseg
        WHERE kdgrp = '**'
          AND matkl = lv_matkl.
      IF sy-subrc <> 0.
        rv_ok = abap_false.
      ENDIF.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
