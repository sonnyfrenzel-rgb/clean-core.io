CLASS zcl_vc_kabel DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Kabelkonfiguration: Gewicht und Trommel zu Querschnitt und Laenge
* Stammdaten: ZVC_KABELTYP (je Querschnitt), ZVC_TROMMEL (Trommeltypen)
* Verwendet von Variantenfunktion Z_VF_KABELLAENGE und ZVC_KONFIG_PRUEFUNG
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_querschnitt TYPE atflv
                iv_verlegeart  TYPE atwrt
      RAISING   zcx_vc_kabel.
    METHODS gewicht_berechnen
      IMPORTING iv_laenge    TYPE atflv
      RETURNING VALUE(rv_kg) TYPE atflv.
    METHODS trommel_ermitteln
      IMPORTING iv_laenge         TYPE atflv
                iv_gewicht        TYPE atflv
      RETURNING VALUE(rv_trommel) TYPE atwrt
      RAISING   zcx_vc_kabel.
    METHODS pruefen
      IMPORTING iv_laenge         TYPE atflv
                iv_trommel        TYPE atwrt
      RETURNING VALUE(rt_meldung) TYPE string_table.
  PRIVATE SECTION.
    DATA: ms_typ        TYPE zvc_kabeltyp,
          mv_verlegeart TYPE atwrt.
ENDCLASS.



CLASS zcl_vc_kabel IMPLEMENTATION.

  METHOD constructor.
    SELECT SINGLE * FROM zvc_kabeltyp INTO @ms_typ
      WHERE querschnitt = @iv_querschnitt.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_vc_kabel
        EXPORTING textid = zcx_vc_kabel=>typ_unbekannt.
    ENDIF.
    mv_verlegeart = iv_verlegeart.
  ENDMETHOD.


  METHOD gewicht_berechnen.
    rv_kg = iv_laenge * ms_typ-kg_je_m.
*   Armierung bei Erdverlegung: +12 % (Werksnorm WN-114)
    IF mv_verlegeart = 'ERDE'.
      rv_kg = rv_kg * '1.12'.
    ENDIF.
  ENDMETHOD.


  METHOD trommel_ermitteln.
*   kleinste Trommel, die Laenge und Gewicht aufnimmt
    SELECT trommel, max_laenge, max_gewicht
      FROM zvc_trommel
      WHERE querschnitt_bis >= @ms_typ-querschnitt
      ORDER BY max_laenge ASCENDING
      INTO TABLE @DATA(lt_trommel).

    LOOP AT lt_trommel INTO DATA(ls_trommel).
      IF ls_trommel-max_laenge >= iv_laenge AND ls_trommel-max_gewicht >= iv_gewicht.
        rv_trommel = ls_trommel-trommel.
        RETURN.
      ENDIF.
    ENDLOOP.

    RAISE EXCEPTION TYPE zcx_vc_kabel
      EXPORTING textid = zcx_vc_kabel=>keine_trommel.
  ENDMETHOD.


  METHOD pruefen.
    DATA(lv_kg) = gewicht_berechnen( iv_laenge ).
    TRY.
        DATA(lv_soll) = trommel_ermitteln( iv_laenge  = iv_laenge
                                           iv_gewicht = lv_kg ).
      CATCH zcx_vc_kabel.
        APPEND |Keine Trommel fuer { iv_laenge } m verfuegbar| TO rt_meldung.
        RETURN.
    ENDTRY.

    IF lv_soll <> iv_trommel.
      APPEND |Trommel { iv_trommel } konfiguriert, erforderlich { lv_soll }| TO rt_meldung.
    ENDIF.

    IF iv_laenge > ms_typ-max_fertigungslaenge.
      APPEND |Laenge ueber Fertigungsgrenze { ms_typ-max_fertigungslaenge } m| TO rt_meldung.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
