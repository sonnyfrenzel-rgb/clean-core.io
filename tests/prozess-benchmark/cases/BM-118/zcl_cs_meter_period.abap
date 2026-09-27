CLASS zcl_cs_meter_period DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Verbrauch eines Zählers in einer Abrechnungsperiode
* Stand Periodenanfang = letzte gültige Ablesung vor dem ersten Tag,
* Stand Periodenende  = letzte gültige Ablesung bis zum letzten Tag.
* Negativer Verbrauch nur bei gepflegtem Zählerüberlauf zulässig.
*----------------------------------------------------------------------*
* 2021-02 EXT  Erstellung (aus ZCS_ZAEHLER_FAKTURA herausgelöst)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS usage
      IMPORTING
        iv_point        TYPE imrc_point
        iv_von          TYPE datum
        iv_bis          TYPE datum
      RETURNING
        VALUE(rv_menge) TYPE f
      RAISING
        zcx_cs_meter.

  PRIVATE SECTION.
    CLASS-METHODS reading_at
      IMPORTING
        iv_point        TYPE imrc_point
        iv_datum        TYPE datum
      RETURNING
        VALUE(rv_readg) TYPE f
      RAISING
        zcx_cs_meter.
ENDCLASS.


CLASS zcl_cs_meter_period IMPLEMENTATION.

  METHOD usage.
    DATA(lv_start) = reading_at( iv_point = iv_point
                                 iv_datum = iv_von - 1 ).
    DATA(lv_end)   = reading_at( iv_point = iv_point
                                 iv_datum = iv_bis ).
    rv_menge = lv_end - lv_start.

    IF rv_menge < 0.
*     Zählerüberlauf (z. B. 6-stelliges Zählwerk)
      SELECT SINGLE cjump FROM imptt
        WHERE point = @iv_point
        INTO @DATA(lv_cjump).
      IF lv_cjump IS INITIAL.
        RAISE EXCEPTION TYPE zcx_cs_meter
          EXPORTING
            textid = zcx_cs_meter=>negative
            point  = iv_point.
      ENDIF.
      rv_menge = rv_menge + lv_cjump.
    ENDIF.
  ENDMETHOD.


  METHOD reading_at.
    SELECT readg FROM imrg
      WHERE point = @iv_point
        AND idate <= @iv_datum
        AND cancl = @space
      ORDER BY idate DESCENDING, itime DESCENDING
      INTO TABLE @DATA(lt_read)
      UP TO 1 ROWS.
    IF lt_read IS INITIAL.
      RAISE EXCEPTION TYPE zcx_cs_meter
        EXPORTING
          textid = zcx_cs_meter=>no_reading
          point  = iv_point
          datum  = iv_datum.
    ENDIF.
    rv_readg = lt_read[ 1 ]-readg.
  ENDMETHOD.

ENDCLASS.
