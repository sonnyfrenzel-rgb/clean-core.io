CLASS zcl_trm_cpty_limit DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Kontrahentenlimite Treasury (Kreditlinien der Banken)
* Limit je Kontrahent und Gültigkeitszeitraum in ZTRM_CPTY_LIMIT;
* Kontrahenten ohne Limit erhalten das Standardlimit aus TVARVC
* (ZTRM_STD_LIMIT). Überschreitungen werden als Ereignis gemeldet.
* Verwendung: ZTRM_FX_MTM (Devisen), ZTRM_MM_LIMIT (Geldhandel)
* 2017 FXT  Ersterstellung
* 2019 FXT  Standardlimit aus TVARVC
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    EVENTS limit_breach
      EXPORTING VALUE(iv_kontrh) TYPE bu_partner
                VALUE(iv_expo)   TYPE ztrm_betrag
                VALUE(iv_limit)  TYPE ztrm_betrag.

    METHODS constructor
      IMPORTING iv_stichtag TYPE datum.
    METHODS pruefen
      IMPORTING iv_kontrh TYPE bu_partner
                iv_expo   TYPE ztrm_betrag.

  PRIVATE SECTION.
    DATA: mv_stichtag  TYPE datum,
          mv_std_limit TYPE ztrm_betrag.
ENDCLASS.

CLASS zcl_trm_cpty_limit IMPLEMENTATION.

  METHOD constructor.
    mv_stichtag = iv_stichtag.
    SELECT SINGLE low FROM tvarvc INTO @DATA(lv_low)
      WHERE name = 'ZTRM_STD_LIMIT'
        AND type = 'P'.
    mv_std_limit = COND #( WHEN sy-subrc = 0 THEN lv_low ELSE 0 ).
  ENDMETHOD.

  METHOD pruefen.
    SELECT SINGLE limit FROM ztrm_cpty_limit INTO @DATA(lv_limit)
      WHERE kontrh   =  @iv_kontrh
        AND gueltab  <= @mv_stichtag
        AND gueltbis >= @mv_stichtag.
    IF sy-subrc <> 0.
      lv_limit = mv_std_limit.
    ENDIF.

    IF iv_expo > lv_limit.
      RAISE EVENT limit_breach
        EXPORTING iv_kontrh = iv_kontrh
                  iv_expo   = iv_expo
                  iv_limit  = lv_limit.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
