CLASS zcl_hr_idoc_builder DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Baut die Segmente eines ZHRMD-IDocs fuer eine Personalnummer.
* Mapper je Infotyp aus Customizing ZHR_IDOC_MAP (Reihenfolge SEQNR).
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_keydate TYPE sy-datum.
    METHODS build
      IMPORTING iv_pernr       TYPE pernr_d
      RETURNING VALUE(rt_data) TYPE edidd_tt
      RAISING   zcx_hr_idoc_map.

  PRIVATE SECTION.
    DATA: mv_keydate TYPE sy-datum,
          mt_mappers TYPE STANDARD TABLE OF REF TO zif_hr_it_mapper WITH EMPTY KEY.
ENDCLASS.



CLASS zcl_hr_idoc_builder IMPLEMENTATION.

  METHOD constructor.
    DATA lo_mapper TYPE REF TO zif_hr_it_mapper.

    mv_keydate = iv_keydate.
    SELECT infty, clsname FROM zhr_idoc_map
      WHERE mestyp = 'ZHRMD'
        AND active = @abap_true
      ORDER BY seqnr
      INTO TABLE @DATA(lt_map).

    LOOP AT lt_map INTO DATA(ls_map).
      TRY.
          CREATE OBJECT lo_mapper TYPE (ls_map-clsname).
          APPEND lo_mapper TO mt_mappers.
        CATCH cx_sy_create_object_error.
*         falsch gepflegt: Infotyp fehlt dann in allen IDocs dieses Laufs
          MESSAGE i403(zhr) WITH ls_map-infty ls_map-clsname.
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.


  METHOD build.
    DATA: ls_hdr  TYPE z1hrhdr,
          lv_stat TYPE stat2.

    ls_hdr-pernr = iv_pernr.

*   Ausgetretene: nur Kopf mit Loeschkennzeichen, Zutritt wird entzogen
    SELECT SINGLE stat2 FROM pa0000 INTO lv_stat
      WHERE pernr = iv_pernr
        AND begda <= mv_keydate
        AND endda >= mv_keydate.
    IF sy-subrc = 0 AND lv_stat = '0'.
      ls_hdr-action = 'D'.
      APPEND VALUE #( segnam = 'Z1HRHDR' sdata = ls_hdr ) TO rt_data.
      RETURN.
    ENDIF.

    ls_hdr-action = 'U'.
    APPEND VALUE #( segnam = 'Z1HRHDR' sdata = ls_hdr ) TO rt_data.

    LOOP AT mt_mappers INTO DATA(lo_mapper).
      APPEND LINES OF lo_mapper->map( iv_pernr   = iv_pernr
                                      iv_keydate = mv_keydate ) TO rt_data.
    ENDLOOP.

    IF lines( rt_data ) = 1.
*     nur Kopf - nichts zu senden
      RAISE EXCEPTION TYPE zcx_hr_idoc_map
        EXPORTING
          textid = zcx_hr_idoc_map=>nothing_to_send.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
