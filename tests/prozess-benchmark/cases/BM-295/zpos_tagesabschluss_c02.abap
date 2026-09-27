*&---------------------------------------------------------------------*
*&  Include           ZPOS_TAGESABSCHLUSS_C02
*&---------------------------------------------------------------------*
*  Kassenbewegungen: Einlage (E) und Entnahme (A) als Klassenhierarchie
*----------------------------------------------------------------------*

CLASS lcx_kasse DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_kasse IMPLEMENTATION.
ENDCLASS.

CLASS lcl_buchung DEFINITION ABSTRACT.
  PUBLIC SECTION.
    CLASS-METHODS erzeugen
      IMPORTING is_bew         TYPE zpos_bewegung
      RETURNING VALUE(ro_buch) TYPE REF TO lcl_buchung
      RAISING   lcx_kasse.
    METHODS betrag_signiert ABSTRACT
      RETURNING VALUE(rv_betrag) TYPE zpos_betrag.
    METHODS gl_zeilen
      CHANGING ct_gl   TYPE tt_gl
               ct_curr TYPE tt_curr.
  PROTECTED SECTION.
    DATA ms_bew TYPE zpos_bewegung.
    METHODS konto ABSTRACT
      RETURNING VALUE(rv_konto) TYPE hkont.
ENDCLASS.

CLASS lcl_einlage DEFINITION INHERITING FROM lcl_buchung FINAL.
  PUBLIC SECTION.
    METHODS betrag_signiert REDEFINITION.
  PROTECTED SECTION.
    METHODS konto REDEFINITION.
ENDCLASS.

CLASS lcl_entnahme DEFINITION INHERITING FROM lcl_buchung FINAL.
  PUBLIC SECTION.
    METHODS betrag_signiert REDEFINITION.
  PROTECTED SECTION.
    METHODS konto REDEFINITION.
ENDCLASS.

CLASS lcl_buchung IMPLEMENTATION.

  METHOD erzeugen.
    CASE is_bew-art.
      WHEN 'E'.
        ro_buch = NEW lcl_einlage( ).
      WHEN 'A'.
        ro_buch = NEW lcl_entnahme( ).
      WHEN OTHERS.
        RAISE EXCEPTION TYPE lcx_kasse
          MESSAGE e510(zpos) WITH is_bew-art is_bew-lfdnr.
    ENDCASE.
    ro_buch->ms_bew = is_bew.
  ENDMETHOD.

* Kasse gegen Konto der Bewegungsart: Einlage erhoeht, Entnahme mindert Kasse
  METHOD gl_zeilen.
    DATA(lv_pos)    = lines( ct_gl ) + 1.
    DATA(lv_betrag) = betrag_signiert( ).
    APPEND VALUE #( itemno_acc = lv_pos
                    gl_account = gc_konto_kasse
                    item_text  = ms_bew-text
                    comp_code  = p_bukrs ) TO ct_gl.
    APPEND VALUE #( itemno_acc = lv_pos
                    currency   = p_waers
                    amt_doccur = lv_betrag ) TO ct_curr.
    APPEND VALUE #( itemno_acc = lv_pos + 1
                    gl_account = konto( )
                    item_text  = ms_bew-text
                    comp_code  = p_bukrs ) TO ct_gl.
    APPEND VALUE #( itemno_acc = lv_pos + 1
                    currency   = p_waers
                    amt_doccur = lv_betrag * -1 ) TO ct_curr.
  ENDMETHOD.

ENDCLASS.

CLASS lcl_einlage IMPLEMENTATION.
  METHOD betrag_signiert.
    rv_betrag = ms_bew-betrag.
  ENDMETHOD.
  METHOD konto.
    rv_konto = '0000113100'.                    "Geldtransit Bank -> Kasse
  ENDMETHOD.
ENDCLASS.

CLASS lcl_entnahme IMPLEMENTATION.
  METHOD betrag_signiert.
    rv_betrag = ms_bew-betrag * -1.
  ENDMETHOD.
  METHOD konto.
*   Abschoepfung zur Bank ueber Geldtransit, sonst Aufwand (Porto etc.)
    IF ms_bew-grund = 'BANK'.
      rv_konto = '0000113100'.
    ELSE.
      rv_konto = '0000476000'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
