CLASS zcl_credit_rules DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Lokale Ersatzregeln für die Kreditentscheidung, wenn das FSCM-System
* nicht erreichbar ist. Aufruf dynamisch aus Z_SD_FSCM_CREDIT_CHECK,
* Zuordnung Regel <-> Verkaufsorganisation in ZSD_CR_SEGM.
* Datenbasis: Kreditlimit (UKMBP_CMS_SGM, lokal repliziert) und das
* nächtlich replizierte Obligo ZUKM_EXPO_REPL.
* Regeln:
*   RULE_STANDARD  frei -> OK, bis 110 % -> SPERRE, sonst ABLEHNEN
*   RULE_STRICT    frei -> OK, sonst SPERRE
*   RULE_EXPORT    gültiges Akkreditiv -> OK, sonst wie RULE_STRICT
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES ty_decision TYPE char10.

    CLASS-METHODS rule_standard
      IMPORTING iv_partner       TYPE kunnr
                iv_segment       TYPE ukm_credit_sgmnt
                iv_amount        TYPE netwr_ak
      RETURNING VALUE(rv_result) TYPE ty_decision.
    CLASS-METHODS rule_strict
      IMPORTING iv_partner       TYPE kunnr
                iv_segment       TYPE ukm_credit_sgmnt
                iv_amount        TYPE netwr_ak
      RETURNING VALUE(rv_result) TYPE ty_decision.
    CLASS-METHODS rule_export
      IMPORTING iv_partner       TYPE kunnr
                iv_segment       TYPE ukm_credit_sgmnt
                iv_amount        TYPE netwr_ak
      RETURNING VALUE(rv_result) TYPE ty_decision.

  PRIVATE SECTION.
    CLASS-METHODS get_free_limit
      IMPORTING iv_partner     TYPE kunnr
                iv_segment     TYPE ukm_credit_sgmnt
      RETURNING VALUE(rv_free) TYPE ukm_credit_limit.
ENDCLASS.

CLASS zcl_credit_rules IMPLEMENTATION.

  METHOD get_free_limit.
    SELECT SINGLE credit_limit FROM ukmbp_cms_sgm INTO @DATA(lv_limit)
      WHERE partner      = @iv_partner
        AND credit_sgmnt = @iv_segment.
    IF sy-subrc <> 0.
      rv_free = 0.
      RETURN.
    ENDIF.

    SELECT SINGLE exposure, stand FROM zukm_expo_repl INTO @DATA(ls_exp)
      WHERE partner      = @iv_partner
        AND credit_sgmnt = @iv_segment.

    rv_free = lv_limit - ls_exp-exposure.
*   Replikat älter als ein Tag: nur die Hälfte des freien Limits
    IF ls_exp-stand < sy-datum - 1.
      rv_free = rv_free / 2.
    ENDIF.
  ENDMETHOD.

  METHOD rule_standard.
    DATA(lv_free) = get_free_limit( iv_partner = iv_partner
                                    iv_segment = iv_segment ).
*   bis 10 % Überschreitung sperren, darüber ablehnen
    rv_result = COND #( WHEN iv_amount <= lv_free         THEN 'OK'
                        WHEN iv_amount <= lv_free * '1.1' THEN 'SPERRE'
                        ELSE 'ABLEHNEN' ).
  ENDMETHOD.

  METHOD rule_strict.
    DATA(lv_free) = get_free_limit( iv_partner = iv_partner
                                    iv_segment = iv_segment ).
    rv_result = COND #( WHEN iv_amount <= lv_free THEN 'OK'
                        ELSE 'SPERRE' ).
  ENDMETHOD.

  METHOD rule_export.
*   Exportkunden mit gültigem Akkreditiv gelten als gedeckt
    SELECT SINGLE @abap_true FROM zsd_lc INTO @DATA(lv_lc)
      WHERE kunnr        = @iv_partner
        AND gueltig_bis >= @sy-datum.
    IF sy-subrc = 0.
      rv_result = 'OK'.
      RETURN.
    ENDIF.
    rv_result = rule_strict( iv_partner = iv_partner
                             iv_segment = iv_segment
                             iv_amount  = iv_amount ).
  ENDMETHOD.

ENDCLASS.
