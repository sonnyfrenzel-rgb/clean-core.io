*&---------------------------------------------------------------------*
*& Include ZFT_PRAEFERENZ_C01 - Ursprungskalkulation
*&---------------------------------------------------------------------*

CLASS lcx_zyklus DEFINITION INHERITING FROM cx_no_check.
ENDCLASS.

CLASS lcx_zyklus IMPLEMENTATION.
ENDCLASS.

*----------------------------------------------------------------------*
* Bewertung eines Materials: Wert (Standardpreis) und Wert des
* Vormaterials ohne Ursprung; rekursiv ueber einstufige Aufloesung
*----------------------------------------------------------------------*
CLASS lcl_kalkulation DEFINITION.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_bew,
             matnr    TYPE matnr,
             ursprung TYPE abap_bool,
             wert     TYPE p LENGTH 15 DECIMALS 2,
             nu_wert  TYPE p LENGTH 15 DECIMALS 2,
             grund    TYPE char60,
           END OF ty_bew.
    METHODS constructor
      IMPORTING iv_werks    TYPE werks_d
                iv_stichtag TYPE sy-datum.
    METHODS bewerten
      IMPORTING iv_matnr      TYPE matnr
                iv_ebene      TYPE i DEFAULT 0
      RETURNING VALUE(rs_bew) TYPE ty_bew.
  PRIVATE SECTION.
    DATA: mv_werks    TYPE werks_d,
          mv_stichtag TYPE sy-datum,
          mt_cache    TYPE HASHED TABLE OF ty_bew WITH UNIQUE KEY matnr,
          mt_pfad     TYPE STANDARD TABLE OF matnr WITH DEFAULT KEY.
    METHODS zukaufteil
      IMPORTING iv_matnr      TYPE matnr
      RETURNING VALUE(rs_bew) TYPE ty_bew.
    METHODS preis
      IMPORTING iv_matnr        TYPE matnr
      RETURNING VALUE(rv_preis) TYPE p.
ENDCLASS.


CLASS lcl_kalkulation IMPLEMENTATION.

  METHOD constructor.
    mv_werks    = iv_werks.
    mv_stichtag = iv_stichtag.
  ENDMETHOD.

  METHOD bewerten.
    DATA lt_stb TYPE STANDARD TABLE OF stpox.

*   bereits bewertete Baugruppe?
    READ TABLE mt_cache INTO rs_bew WITH TABLE KEY matnr = iv_matnr.
    IF sy-subrc = 0.
      RETURN.
    ENDIF.

*   Zyklenschutz (Material bereits im Aufloesungspfad) / Tiefe
    IF line_exists( mt_pfad[ table_line = iv_matnr ] ) OR iv_ebene > 20.
      RAISE EXCEPTION TYPE lcx_zyklus.
    ENDIF.
    APPEND iv_matnr TO mt_pfad.
    rs_bew-matnr = iv_matnr.

    SELECT SINGLE beskz FROM marc INTO @DATA(lv_beskz)
      WHERE matnr = @iv_matnr
        AND werks = @mv_werks.

    IF lv_beskz = 'F'.
      rs_bew = zukaufteil( iv_matnr ).
    ELSE.
      CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
        EXPORTING
          capid                 = 'PP01'
          datuv                 = mv_stichtag
          emeng                 = 1
          mehrs                 = space
          mtnrv                 = iv_matnr
          stlan                 = '1'
          werks                 = mv_werks
        TABLES
          stb                   = lt_stb
        EXCEPTIONS
          material_not_found    = 1
          no_bom_found          = 2
          OTHERS                = 3.
      IF sy-subrc <> 0.
        rs_bew-ursprung = abap_false.
        rs_bew-grund    = 'Keine Stueckliste zum Stichtag'.
      ELSE.
        LOOP AT lt_stb INTO DATA(ls_stb) WHERE postp = 'L'.
          DATA(ls_komp) = bewerten( iv_matnr = ls_stb-idnrk
                                    iv_ebene = iv_ebene + 1 ).
          DATA(lv_kwert) = ls_komp-wert * ls_stb-mngko.
          rs_bew-wert = rs_bew-wert + lv_kwert.
          IF ls_komp-ursprung = abap_false.
            rs_bew-nu_wert = rs_bew-nu_wert + lv_kwert.
          ENDIF.
        ENDLOOP.

*       Wert der Baugruppe: Standardpreis, mindestens Summe Vormaterial
        DATA(lv_preis) = preis( iv_matnr ).
        IF lv_preis > rs_bew-wert.
          rs_bew-wert = lv_preis.
        ENDIF.

*       Listenregel: Hoechstanteil Vormaterial ohne Ursprung je Kapitel
        SELECT SINGLE stawn FROM marc INTO @DATA(lv_stawn)
          WHERE matnr = @iv_matnr
            AND werks = @mv_werks.
        DATA(lv_kapitel) = lv_stawn(4).
        SELECT SINGLE max_anteil FROM zft_regel INTO @DATA(lv_max)
          WHERE kapitel = @lv_kapitel.
        IF sy-subrc <> 0.
          lv_max = 40.
        ENDIF.
        rs_bew-ursprung = xsdbool( rs_bew-wert > 0 AND
                                   rs_bew-nu_wert * 100 / rs_bew-wert <= lv_max ).
        IF rs_bew-ursprung = abap_false.
          rs_bew-grund = |Anteil ohne Ursprung ueber { lv_max } %|.
        ENDIF.
      ENDIF.
    ENDIF.

    DELETE mt_pfad WHERE table_line = iv_matnr.
    INSERT rs_bew INTO TABLE mt_cache.
  ENDMETHOD.

  METHOD zukaufteil.
    rs_bew-matnr = iv_matnr.
    rs_bew-wert  = preis( iv_matnr ).

    SELECT lifnr, gueltig_bis, praef_ursprung
      FROM zft_le
      WHERE matnr       =  @iv_matnr
        AND werks       =  @mv_werks
        AND gueltig_bis >= @mv_stichtag
      INTO TABLE @DATA(lt_le).
    IF lt_le IS INITIAL.
      rs_bew-ursprung = abap_false.
      rs_bew-grund    = 'Keine gueltige Lieferantenerklaerung'.
      RETURN.
    ENDIF.

*   konservativ: nur wenn ALLE Lieferanten Ursprung erklaeren
    IF line_exists( lt_le[ praef_ursprung = abap_false ] ).
      rs_bew-ursprung = abap_false.
      rs_bew-grund    = 'Lieferant ohne Ursprungserklaerung'.
    ELSE.
      rs_bew-ursprung = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD preis.
    SELECT SINGLE stprs, peinh FROM mbew INTO @DATA(ls_mbew)
      WHERE matnr = @iv_matnr
        AND bwkey = @mv_werks
        AND bwtar = @space.
    IF sy-subrc = 0 AND ls_mbew-peinh > 0.
      rv_preis = ls_mbew-stprs / ls_mbew-peinh.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
