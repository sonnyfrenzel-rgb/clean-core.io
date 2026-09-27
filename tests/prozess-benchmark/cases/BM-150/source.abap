CLASS zcl_ess_leave_check DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Zusatzpruefung Urlaubsantrag ESS/MSS, gerufen aus der BAdI-Implementierung
* ZIM_PT_ABS_REQ vor dem Absenden des Antrags an den Genehmiger
  PUBLIC SECTION.
    CLASS-METHODS check_request
      IMPORTING iv_pernr          TYPE pernr_d
                iv_awart          TYPE awart
                iv_begda          TYPE begda
                iv_endda          TYPE endda
      RETURNING VALUE(rv_warning) TYPE abap_bool
      RAISING   zcx_ess_leave.
ENDCLASS.

CLASS zcl_ess_leave_check IMPLEMENTATION.
  METHOD check_request.
    DATA: lv_werks TYPE persa,
          lv_btrtl TYPE btrtl,
          lv_days  TYPE i.

    SELECT SINGLE werks, btrtl FROM pa0001
      WHERE pernr = @iv_pernr
        AND begda <= @iv_begda
        AND endda >= @iv_begda
      INTO (@lv_werks, @lv_btrtl).

*   Urlaubssperre (Inventur, Jahresabschluss) je Teilbereich
    SELECT COUNT(*) FROM zpt_url_sperre
      WHERE werks = @lv_werks
        AND btrtl = @lv_btrtl
        AND sperr_von <= @iv_endda
        AND sperr_bis >= @iv_begda.
    IF sy-subrc = 0 AND iv_awart = '0100'.
      RAISE EXCEPTION TYPE zcx_ess_leave
        EXPORTING textid = zcx_ess_leave=>blocked_period.
    ENDIF.

*   Ueberschneidung mit bereits erfassten Abwesenheiten
    SELECT SINGLE @abap_true FROM pa2001
      WHERE pernr = @iv_pernr
        AND begda <= @iv_endda
        AND endda >= @iv_begda
        AND sprps = @space
      INTO @DATA(lv_overlap).
    IF lv_overlap = abap_true.
      RAISE EXCEPTION TYPE zcx_ess_leave
        EXPORTING textid = zcx_ess_leave=>overlap.
    ENDIF.

    lv_days = iv_endda - iv_begda + 1.

    CASE iv_awart.
      WHEN '0100'.
*       Erholungsurlaub: Restanspruch aus Kontingent 01 und 02
        SELECT anzhl, kverb FROM pa2006
          WHERE pernr = @iv_pernr
            AND ktart IN ('01', '02')
            AND deend >= @iv_begda
          INTO TABLE @DATA(lt_quota).
        DATA(lv_rest) = REDUCE ptm_quonum( INIT r = 0
                                           FOR q IN lt_quota
                                           NEXT r = r + q-anzhl - q-kverb ).
        IF lv_days > lv_rest.
          RAISE EXCEPTION TYPE zcx_ess_leave
            EXPORTING textid = zcx_ess_leave=>quota_exceeded.
        ENDIF.
      WHEN '0200' OR '0210'.
*       Krankheit wird nicht ueber ESS beantragt
        RAISE EXCEPTION TYPE zcx_ess_leave
          EXPORTING textid = zcx_ess_leave=>not_via_ess.
      WHEN OTHERS.
*       Sonderurlaub etc.: keine Kontingentpruefung
    ENDCASE.

*   Hinweis an Genehmiger bei langen Abwesenheiten
    rv_warning = xsdbool( lv_days > 10 ).
  ENDMETHOD.
ENDCLASS.
