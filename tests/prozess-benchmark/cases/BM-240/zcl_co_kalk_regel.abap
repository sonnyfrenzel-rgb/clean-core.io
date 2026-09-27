CLASS zcl_co_kalk_regel DEFINITION
  PUBLIC
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Basisregel fuer die Uebernahme von Plankalkulationen:
*   - Kalkulation muss fehlerfrei sein (Status KA)
*   - dieselbe Kalkulation darf nicht zweimal uebernommen werden
* ZCL_CO_KALK_REGEL_ABW prueft zusaetzlich die Preisabweichung.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS fabrik
      IMPORTING iv_proz         TYPE p
      RETURNING VALUE(ro_regel) TYPE REF TO zcl_co_kalk_regel.

    METHODS pruefen
      IMPORTING is_keko TYPE keko
      RAISING   zcx_co_kalk.

    METHODS kalk_preis
      IMPORTING is_keko         TYPE keko
      RETURNING VALUE(rv_preis) TYPE ck_kwt.

  PROTECTED SECTION.
    DATA mv_proz TYPE p LENGTH 5 DECIMALS 2.
ENDCLASS.



CLASS zcl_co_kalk_regel IMPLEMENTATION.

  METHOD fabrik.
*   ohne Schwelle keine Abweichungspruefung
    IF iv_proz IS INITIAL.
      ro_regel = NEW zcl_co_kalk_regel( ).
    ELSE.
      ro_regel = NEW zcl_co_kalk_regel_abw( ).
      ro_regel->mv_proz = iv_proz.
    ENDIF.
  ENDMETHOD.


  METHOD pruefen.
    DATA lv_da TYPE abap_bool.

*   KA = kalkuliert ohne Fehler, KF = mit Fehlern
    IF is_keko-feh_sta <> 'KA'.
      RAISE EXCEPTION TYPE zcx_co_kalk
        EXPORTING
          mv_schwere = 'E'
          mv_text    = |Kalkulationsstatus { is_keko-feh_sta }|.
    ENDIF.

    SELECT SINGLE @abap_true FROM zco_kalk_frg
      WHERE kalnr = @is_keko-kalnr
        AND kadky = @is_keko-kadky
      INTO @lv_da.
    IF sy-subrc = 0.
      RAISE EXCEPTION TYPE zcx_co_kalk
        EXPORTING
          mv_schwere = 'W'
          mv_text    = `Kalkulation bereits uebernommen`.
    ENDIF.
  ENDMETHOD.


  METHOD kalk_preis.
    DATA lv_summe TYPE ck_kwt.

*   Einzelpositionen der Kalkulation (CKIS), Wert in Objektwaehrung
    SELECT SUM( wertn ) FROM ckis INTO lv_summe
      WHERE lednr = '00'
        AND bzobj = is_keko-bzobj
        AND kalnr = is_keko-kalnr
        AND kalka = is_keko-kalka
        AND kadky = is_keko-kadky
        AND tvers = is_keko-tvers
        AND bwvar = is_keko-bwvar.

    IF is_keko-losgr IS INITIAL.
      RETURN.
    ENDIF.
    rv_preis = lv_summe / is_keko-losgr.
  ENDMETHOD.

ENDCLASS.
