CLASS zcl_trm_fx_ratecheck DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Treasury Devisenhandel: Marktgerechtigkeitsprüfung (MaRisk BTO 2.2.1)
* Über die Handelsplattform importierte Devisengeschäfte (ZTRM_FX_DEAL)
* werden gegen den Mittelkurs des Handelstags geprüft.
* 2019 FXT-Team
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    EVENTS rate_deviation
      EXPORTING VALUE(iv_tradeid) TYPE ztrm_tradeid
                VALUE(iv_abw)     TYPE decfloat16.
    METHODS run
      IMPORTING iv_bukrs        TYPE bukrs
                iv_datum        TYPE datum
      RETURNING VALUE(rv_count) TYPE i
      RAISING   zcx_trm_check.
ENDCLASS.

CLASS zcl_trm_fx_ratecheck IMPLEMENTATION.
  METHOD run.
    DATA: lv_mkurs TYPE ukurs_curr,
          lv_abw   TYPE decfloat16.

    SELECT * FROM ztrm_fx_deal
      WHERE bukrs      = @iv_bukrs
        AND handelstag = @iv_datum
        AND status     = 'N'
      INTO TABLE @DATA(lt_deal).
    IF lt_deal IS INITIAL.
      RAISE EXCEPTION TYPE zcx_trm_check
        EXPORTING textid = zcx_trm_check=>nothing_to_do.
    ENDIF.

    LOOP AT lt_deal ASSIGNING FIELD-SYMBOL(<ls_deal>).
*     Toleranz in Prozent je Geschäftsart: Kasse, Termin, Swap/sonstige
      DATA(lv_tol) = SWITCH decfloat16( <ls_deal>-sfhaart
                                        WHEN '101' THEN '0.5'
                                        WHEN '102' THEN '1.5'
                                        ELSE '0.25' ).
      CALL FUNCTION 'READ_EXCHANGE_RATE'
        EXPORTING
          date             = <ls_deal>-handelstag
          foreign_currency = <ls_deal>-waers_sell
          local_currency   = <ls_deal>-waers_buy
          type_of_rate     = 'M'
        IMPORTING
          exchange_rate    = lv_mkurs
        EXCEPTIONS
          no_rate_found    = 1
          OTHERS           = 2.
      IF sy-subrc <> 0.
        <ls_deal>-status = 'K'.        "kein Marktkurs - manuell prüfen
        CONTINUE.
      ENDIF.

      lv_abw = abs( <ls_deal>-kurs - lv_mkurs ) / lv_mkurs * 100.
      IF lv_abw > lv_tol.
        <ls_deal>-status = 'A'.        "auffällig
        RAISE EVENT rate_deviation
          EXPORTING iv_tradeid = <ls_deal>-tradeid
                    iv_abw     = lv_abw.
      ELSE.
        <ls_deal>-status = 'P'.        "geprüft, marktgerecht
      ENDIF.
    ENDLOOP.

    MODIFY ztrm_fx_deal FROM TABLE lt_deal.
    rv_count = REDUCE i( INIT n = 0
                         FOR ls_d IN lt_deal WHERE ( status = 'A' )
                         NEXT n = n + 1 ).
  ENDMETHOD.
ENDCLASS.
