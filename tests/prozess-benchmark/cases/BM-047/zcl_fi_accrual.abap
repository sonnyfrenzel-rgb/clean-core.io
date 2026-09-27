CLASS zcl_fi_accrual DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_return TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.
    METHODS post_period
      IMPORTING iv_bukrs         TYPE bukrs
                iv_gjahr         TYPE gjahr
                iv_monat         TYPE monat
                iv_test          TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rt_return) TYPE tt_return.
  PRIVATE SECTION.
    METHODS last_day
      IMPORTING iv_gjahr       TYPE gjahr
                iv_monat       TYPE monat
      RETURNING VALUE(rv_date) TYPE budat.
ENDCLASS.

CLASS zcl_fi_accrual IMPLEMENTATION.

  METHOD post_period.
    DATA: lt_accr   TYPE STANDARD TABLE OF zfi_accrual,
          ls_header TYPE bapiache09,
          lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
          lt_amt    TYPE STANDARD TABLE OF bapiaccr09,
          lt_ret    TYPE STANDARD TABLE OF bapiret2,
          lv_objkey TYPE bapiache09-obj_key,
          lv_budat  TYPE budat.

    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
      ID 'BUKRS' FIELD iv_bukrs
      ID 'ACTVT' FIELD '01'.
    IF sy-subrc <> 0.
      APPEND VALUE #( type = 'E' id = 'ZFI' number = '010'
                      message_v1 = iv_bukrs ) TO rt_return.
      RETURN.
    ENDIF.

*   nur noch nicht gebuchte Abgrenzungen der Periode
    SELECT * FROM zfi_accrual INTO TABLE lt_accr
      WHERE bukrs = iv_bukrs
        AND gjahr = iv_gjahr
        AND monat = iv_monat
        AND belnr = space.

    lv_budat = last_day( iv_gjahr = iv_gjahr iv_monat = iv_monat ).

    LOOP AT lt_accr ASSIGNING FIELD-SYMBOL(<ls_accr>).
      CLEAR: lv_objkey, lt_ret.
      ls_header = VALUE #( bus_act    = 'RFBU'
                           username   = sy-uname
                           comp_code  = iv_bukrs
                           doc_date   = lv_budat
                           pstng_date = lv_budat
                           doc_type   = 'SA'
                           header_txt = |Abgrenzung { <ls_accr>-accr_id }| ).
      lt_gl = VALUE #( ( itemno_acc = 1 gl_account = <ls_accr>-hkont_aufw
                         costcenter = <ls_accr>-kostl item_text = <ls_accr>-sgtxt )
                       ( itemno_acc = 2 gl_account = <ls_accr>-hkont_abgr
                         item_text = <ls_accr>-sgtxt ) ).
      lt_amt = VALUE #( ( itemno_acc = 1 currency = <ls_accr>-waers
                          amt_doccur = <ls_accr>-betrag )
                        ( itemno_acc = 2 currency = <ls_accr>-waers
                          amt_doccur = - <ls_accr>-betrag ) ).

      IF iv_test = abap_true.
        CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
          EXPORTING
            documentheader = ls_header
          TABLES
            accountgl      = lt_gl
            currencyamount = lt_amt
            return         = lt_ret.
      ELSE.
        CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
          EXPORTING
            documentheader = ls_header
          IMPORTING
            obj_key        = lv_objkey
          TABLES
            accountgl      = lt_gl
            currencyamount = lt_amt
            return         = lt_ret.
      ENDIF.
      APPEND LINES OF lt_ret TO rt_return.

      IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        CONTINUE.
      ENDIF.

      CHECK iv_test = abap_false.
*     Belegnummer + Storno zum Folgetag zurueckschreiben
      <ls_accr>-belnr = lv_objkey(10).
      <ls_accr>-stodt = lv_budat + 1.
      UPDATE zfi_accrual FROM <ls_accr>.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
    ENDLOOP.
  ENDMETHOD.

  METHOD last_day.
    DATA lv_first TYPE budat.
*   Geschaeftsjahr = Kalenderjahr (gilt fuer alle BUKRS der Gruppe)
    lv_first = iv_gjahr && iv_monat && '01'.
    CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
      EXPORTING
        day_in            = lv_first
      IMPORTING
        last_day_of_month = rv_date
      EXCEPTIONS
        OTHERS            = 1.
  ENDMETHOD.

ENDCLASS.
