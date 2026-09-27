*&---------------------------------------------------------------------*
*& Include ZISU_ABRVORB_CLS  - lokale Klassen
*&---------------------------------------------------------------------*

*----------------------------------------------------------------------*
* Ausnahme: Lauf bzw. Anlage abbrechen
*----------------------------------------------------------------------*
CLASS lcx_abbruch DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_text  TYPE string OPTIONAL
                previous TYPE REF TO cx_root OPTIONAL.
    METHODS get_text REDEFINITION.
  PRIVATE SECTION.
    DATA mv_text TYPE string.
ENDCLASS.

*----------------------------------------------------------------------*
* Ablauf der Abrechnungsvorbereitung
*----------------------------------------------------------------------*
CLASS lcl_lauf DEFINITION.
  PUBLIC SECTION.
    EVENTS meldung
      EXPORTING VALUE(ev_anlage) TYPE eanl-anlage
                VALUE(ev_typ)    TYPE symsgty
                VALUE(ev_text)   TYPE string.
    METHODS constructor
      IMPORTING iv_portion TYPE te420-termschl
                iv_adat    TYPE sy-datum
                iv_test    TYPE abap_bool.
    METHODS ausfuehren
      RAISING lcx_abbruch.
  PRIVATE SECTION.
    DATA: mv_portion TYPE te420-termschl,
          mv_adat    TYPE sy-datum,
          mv_test    TYPE abap_bool,
          mt_anl     TYPE tt_anl,
          mv_zaehler TYPE i.
    METHODS selektieren
      RAISING lcx_abbruch.
    METHODS anlage_pruefen
      IMPORTING is_anl TYPE ty_anl
      RAISING   lcx_abbruch.
    METHODS ablesung_vorhanden
      IMPORTING iv_anlage    TYPE eanl-anlage
      RETURNING VALUE(rv_da) TYPE abap_bool.
    METHODS schaetzen
      IMPORTING is_anl TYPE ty_anl
      RAISING   lcx_abbruch.
    METHODS sperren
      IMPORTING is_anl   TYPE ty_anl
                iv_grund TYPE ever-abrsperr.
    METHODS paket_sichern.
ENDCLASS.

*----------------------------------------------------------------------*
* Protokollsammler (Handler fuer MELDUNG)
*----------------------------------------------------------------------*
CLASS lcl_protokoll DEFINITION.
  PUBLIC SECTION.
    DATA mt_prot TYPE tt_prot.
    METHODS on_meldung FOR EVENT meldung OF lcl_lauf
      IMPORTING ev_anlage ev_typ ev_text.
ENDCLASS.


CLASS lcx_abbruch IMPLEMENTATION.
  METHOD constructor.
    super->constructor( previous = previous ).
    mv_text = iv_text.
  ENDMETHOD.

  METHOD get_text.
    result = mv_text.
  ENDMETHOD.
ENDCLASS.


CLASS lcl_lauf IMPLEMENTATION.

  METHOD constructor.
    mv_portion = iv_portion.
    mv_adat    = iv_adat.
    mv_test    = iv_test.
  ENDMETHOD.

  METHOD ausfuehren.
    selektieren( ).

    LOOP AT mt_anl INTO DATA(ls_anl).
      CALL FUNCTION 'ENQUEUE_EZISU_ANLAGE'
        EXPORTING
          anlage         = ls_anl-anlage
        EXCEPTIONS
          foreign_lock   = 1
          system_failure = 2
          OTHERS         = 3.
      IF sy-subrc <> 0.
        RAISE EVENT meldung
          EXPORTING ev_anlage = ls_anl-anlage
                    ev_typ    = 'W'
                    ev_text   = |Anlage gesperrt durch { sy-msgv1 }, nicht bearbeitet|.
        CONTINUE.
      ENDIF.

      TRY.
          anlage_pruefen( ls_anl ).
        CATCH lcx_abbruch INTO DATA(lx_anl).
          RAISE EVENT meldung
            EXPORTING ev_anlage = ls_anl-anlage
                      ev_typ    = 'E'
                      ev_text   = lx_anl->get_text( ).
        CLEANUP.
          CALL FUNCTION 'DEQUEUE_EZISU_ANLAGE'
            EXPORTING
              anlage = ls_anl-anlage.
      ENDTRY.

      CALL FUNCTION 'DEQUEUE_EZISU_ANLAGE'
        EXPORTING
          anlage = ls_anl-anlage.

      mv_zaehler = mv_zaehler + 1.
      IF mv_zaehler MOD p_paket = 0.
        paket_sichern( ).
      ENDIF.
    ENDLOOP.

    paket_sichern( ).
  ENDMETHOD.

  METHOD selektieren.
*   Portion -> Ableseeinheiten (TE422) -> Anlagen (Zeitscheibe) -> Vertrag
    SELECT h~anlage, v~vertrag, v~abrsperr, a~sparte, h~aklasse, v~einzdat
      FROM eanlh AS h
      INNER JOIN te422 AS t ON t~termschl = h~ableinh
      INNER JOIN eanl  AS a ON a~anlage   = h~anlage
      INNER JOIN ever  AS v ON v~anlage   = h~anlage
      WHERE t~portion  =  @mv_portion
        AND h~ab       <= @mv_adat
        AND h~bis      >= @mv_adat
        AND v~einzdat  <= @mv_adat
        AND v~auszdat  >= @mv_adat
      INTO TABLE @mt_anl.
    IF mt_anl IS INITIAL.
      RAISE EXCEPTION TYPE lcx_abbruch
        EXPORTING iv_text = |Keine Anlagen mit aktivem Vertrag in Portion { mv_portion }|.
    ENDIF.
    RAISE EVENT meldung
      EXPORTING ev_anlage = space
                ev_typ    = 'I'
                ev_text   = |{ lines( mt_anl ) } Anlagen selektiert|.
  ENDMETHOD.

  METHOD anlage_pruefen.
    IF is_anl-abrsperr IS NOT INITIAL.
      RAISE EVENT meldung
        EXPORTING ev_anlage = is_anl-anlage
                  ev_typ    = 'I'
                  ev_text   = |Abrechnungssperre { is_anl-abrsperr } bereits gesetzt|.
      RETURN.
    ENDIF.

    IF ablesung_vorhanden( is_anl-anlage ) = abap_true.
      RETURN.
    ENDIF.

*   Leistungsgemessene Kunden (RLM) nie schaetzen - 2020
    IF is_anl-aklasse = 'RLM' OR p_schae = abap_false.
      IF p_sperr = abap_true.
        sperren( is_anl = is_anl iv_grund = gc_sperr_rlm ).
      ELSE.
        RAISE EVENT meldung
          EXPORTING ev_anlage = is_anl-anlage
                    ev_typ    = 'W'
                    ev_text   = |Turnusablesung fehlt, weder geschaetzt noch gesperrt|.
      ENDIF.
      RETURN.
    ENDIF.

    schaetzen( is_anl ).
  ENDMETHOD.

  METHOD ablesung_vorhanden.
    SELECT COUNT(*) FROM eablg AS g
      INNER JOIN eabl AS l ON l~ablbelnr = g~ablbelnr
      WHERE g~anlage   =  @iv_anlage
        AND g~ablesgr  =  '01'
        AND l~adatsoll =  @mv_adat
        AND l~ablstat  <> '0'.
    rv_da = xsdbool( sy-dbcnt > 0 ).
  ENDMETHOD.

  METHOD schaetzen.
    DATA: lv_subrc TYPE sy-subrc,
          lv_msg   TYPE char80.

    IF mv_test = abap_true.
      RAISE EVENT meldung
        EXPORTING ev_anlage = is_anl-anlage
                  ev_typ    = 'I'
                  ev_text   = |Testlauf: Turnusablesung wuerde geschaetzt|.
      RETURN.
    ENDIF.

    CALL FUNCTION 'Z_ISU_ABLESUNG_SCHAETZEN'
      EXPORTING
        iv_anlage   = is_anl-anlage
        iv_adatsoll = mv_adat
      IMPORTING
        ev_subrc    = lv_subrc
        ev_text     = lv_msg.

    CASE lv_subrc.
      WHEN 0.
        RAISE EVENT meldung
          EXPORTING ev_anlage = is_anl-anlage
                    ev_typ    = 'S'
                    ev_text   = |Turnusablesung geschaetzt|.
      WHEN 4.
*       keine Vorperiode -> nicht schaetzbar -> Abrechnung sperren
        sperren( is_anl = is_anl iv_grund = gc_sperr_keinvp ).
      WHEN OTHERS.
        RAISE EXCEPTION TYPE lcx_abbruch
          EXPORTING iv_text = |Schaetzung Anlage { is_anl-anlage }: { lv_msg }|.
    ENDCASE.
  ENDMETHOD.

  METHOD sperren.
    IF mv_test = abap_true.
      RAISE EVENT meldung
        EXPORTING ev_anlage = is_anl-anlage
                  ev_typ    = 'I'
                  ev_text   = |Testlauf: Abrechnungssperre { iv_grund } wuerde gesetzt|.
      RETURN.
    ENDIF.

    UPDATE ever SET abrsperr = @iv_grund
      WHERE vertrag = @is_anl-vertrag.
    IF sy-subrc = 0.
      RAISE EVENT meldung
        EXPORTING ev_anlage = is_anl-anlage
                  ev_typ    = 'W'
                  ev_text   = |Abrechnungssperre { iv_grund } gesetzt|.
    ENDIF.
  ENDMETHOD.

  METHOD paket_sichern.
    IF mv_test = abap_true.
      ROLLBACK WORK.
      RETURN.
    ENDIF.
    COMMIT WORK.
    RAISE EVENT meldung
      EXPORTING ev_anlage = space
                ev_typ    = 'I'
                ev_text   = |Paket gesichert, { mv_zaehler } Anlagen bearbeitet|.
  ENDMETHOD.

ENDCLASS.


CLASS lcl_protokoll IMPLEMENTATION.
  METHOD on_meldung.
    APPEND VALUE #( anlage = ev_anlage
                    typ    = ev_typ
                    text   = ev_text ) TO mt_prot.
*   Fehler zusaetzlich ins Jobprotokoll
    IF ev_typ = 'E' AND sy-batch = abap_true.
      MESSAGE ev_text TYPE 'I'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
