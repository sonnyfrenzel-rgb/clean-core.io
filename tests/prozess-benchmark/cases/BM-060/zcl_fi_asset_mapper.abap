CLASS zcl_fi_asset_mapper DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    "! Anlagenklasse zur Investitionskategorie des Senders
    METHODS get_asset_class
      IMPORTING iv_bukrs        TYPE bukrs
                iv_ext_klasse   TYPE char10
      RETURNING VALUE(rv_anlkl) TYPE anlkl.
    "! Kostenstelle im KoKrs des Buchungskreises zum Datum gueltig?
    METHODS check_cost_center
      IMPORTING iv_bukrs        TYPE bukrs
                iv_kostl        TYPE kostl
                iv_datum        TYPE datum
      RETURNING VALUE(rv_valid) TYPE abap_bool.
    "! Kunden-Exit-Baustein je Buchungskreis (ZFIAA_CUST)
    METHODS get_exit_fb
      IMPORTING iv_bukrs     TYPE bukrs
      RETURNING VALUE(rv_fb) TYPE rs38l_fnam.

  PRIVATE SECTION.
    DATA mv_kokrs TYPE kokrs.
ENDCLASS.



CLASS zcl_fi_asset_mapper IMPLEMENTATION.

  METHOD get_asset_class.
*   erst buchungskreisspezifisch, dann generischer Eintrag '*'
    SELECT SINGLE anlkl FROM zfiaa_clsmap INTO rv_anlkl
      WHERE bukrs      = iv_bukrs
        AND ext_klasse = iv_ext_klasse.
    IF sy-subrc <> 0.
      SELECT SINGLE anlkl FROM zfiaa_clsmap INTO rv_anlkl
        WHERE bukrs      = '*'
          AND ext_klasse = iv_ext_klasse.
    ENDIF.
  ENDMETHOD.


  METHOD check_cost_center.
    DATA lv_kostl TYPE kostl.

    rv_valid = abap_false.
*   Kostenrechnungskreis zum Buchungskreis
    SELECT SINGLE kokrs FROM tka02 INTO mv_kokrs
      WHERE bukrs = iv_bukrs.

    SELECT SINGLE kostl FROM csks INTO lv_kostl
      WHERE kokrs = mv_kokrs
        AND kostl = iv_kostl
        AND datbi >= iv_datum
        AND datab <= iv_datum.
*        AND bkzkp = space.   "Sperre primaere Kosten - 2015 wieder raus
    IF sy-subrc = 0.
      rv_valid = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD get_exit_fb.
    SELECT SINGLE exit_fb FROM zfiaa_cust INTO rv_fb
      WHERE bukrs = iv_bukrs
        AND aktiv = abap_true.
    CHECK sy-subrc = 0 AND rv_fb IS NOT INITIAL.

*   Baustein muss existieren, sonst Customizingfehler -> Exit ignorieren
    CALL FUNCTION 'FUNCTION_EXISTS'
      EXPORTING
        funcname           = rv_fb
      EXCEPTIONS
        function_not_exist = 1
        OTHERS             = 2.
    IF sy-subrc <> 0.
      CLEAR rv_fb.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
