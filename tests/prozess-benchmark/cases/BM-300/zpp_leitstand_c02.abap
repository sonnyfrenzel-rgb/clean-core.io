*&---------------------------------------------------------------------*
*&  Include           ZPP_LEITSTAND_C02
*&---------------------------------------------------------------------*
*  Leitstandsaktionen: Basisklasse mit Ablauf (Berechtigung, Sperre,
*  Durchfuehrung, Protokoll, Commit) und Fabrik nach Funktionscode
*----------------------------------------------------------------------*

CLASS lcx_leit DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_leit IMPLEMENTATION.
ENDCLASS.

CLASS lcl_aktion DEFINITION ABSTRACT.
  PUBLIC SECTION.
    CLASS-METHODS fuer
      IMPORTING iv_ucomm      TYPE sy-ucomm
      RETURNING VALUE(ro_akt) TYPE REF TO lcl_aktion
      RAISING   lcx_leit.
    METHODS ausfuehren
      IMPORTING is_vorg TYPE ty_vorg
      RAISING   lcx_leit.
  PROTECTED SECTION.
    DATA mv_aktivitaet TYPE activ_auth.
    METHODS durchfuehren ABSTRACT
      IMPORTING is_vorg TYPE ty_vorg
      RAISING   lcx_leit.
ENDCLASS.

CLASS lcl_akt_vorziehen DEFINITION INHERITING FROM lcl_aktion FINAL.
  PROTECTED SECTION.
    METHODS durchfuehren REDEFINITION.
ENDCLASS.

CLASS lcl_akt_freigeben DEFINITION INHERITING FROM lcl_aktion FINAL.
  PROTECTED SECTION.
    METHODS durchfuehren REDEFINITION.
ENDCLASS.

CLASS lcl_akt_drucken DEFINITION INHERITING FROM lcl_aktion FINAL.
  PUBLIC SECTION.
    METHODS druck_fertig
      IMPORTING p_task TYPE clike.
  PROTECTED SECTION.
    METHODS durchfuehren REDEFINITION.
ENDCLASS.

CLASS lcl_aktion IMPLEMENTATION.

  METHOD fuer.
    CASE iv_ucomm.
      WHEN 'VORZ'.
        ro_akt = NEW lcl_akt_vorziehen( ).
        ro_akt->mv_aktivitaet = '02'.
      WHEN 'FREI'.
        ro_akt = NEW lcl_akt_freigeben( ).
        ro_akt->mv_aktivitaet = '40'.
      WHEN 'DRUCK'.
        ro_akt = NEW lcl_akt_drucken( ).
        ro_akt->mv_aktivitaet = '04'.
      WHEN OTHERS.
        RAISE EXCEPTION TYPE lcx_leit
          MESSAGE e801(zpp_ls) WITH iv_ucomm.
    ENDCASE.
  ENDMETHOD.

  METHOD ausfuehren.
    DATA lv_auart TYPE aufart.

    SELECT SINGLE auart FROM aufk INTO lv_auart
      WHERE aufnr = is_vorg-aufnr.
    AUTHORITY-CHECK OBJECT 'C_AFKO_AWK'
      ID 'WERK'  FIELD is_vorg-werks
      ID 'AUFART' FIELD lv_auart
      ID 'ACTVT' FIELD mv_aktivitaet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_leit
        MESSAGE e802(zpp_ls) WITH is_vorg-aufnr mv_aktivitaet.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_ESORDER'
      EXPORTING
        aufnr          = is_vorg-aufnr
      EXCEPTIONS
        foreign_lock   = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_leit
        MESSAGE e803(zpp_ls) WITH is_vorg-aufnr sy-msgv1.
    ENDIF.

    TRY.
        durchfuehren( is_vorg ).
      CLEANUP.
        CALL FUNCTION 'DEQUEUE_ESORDER'
          EXPORTING
            aufnr = is_vorg-aufnr.
    ENDTRY.

*   Leitstandsprotokoll fuer die Schichtuebergabe (Verbucher)
    CALL FUNCTION 'Z_PP_LEITSTAND_LOG' IN UPDATE TASK
      EXPORTING
        iv_aufnr  = is_vorg-aufnr
        iv_vornr  = is_vorg-vornr
        iv_aktion = mv_aktivitaet
        iv_user   = sy-uname.
    COMMIT WORK.

    CALL FUNCTION 'DEQUEUE_ESORDER'
      EXPORTING
        aufnr = is_vorg-aufnr.
  ENDMETHOD.

ENDCLASS.
