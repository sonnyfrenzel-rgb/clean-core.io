*&---------------------------------------------------------------------*
*& Include ZMM_PI_DIFF_POST_C01 - Freigaberegeln
*&---------------------------------------------------------------------*
INTERFACE lif_rule.
  METHODS is_auto_postable
    IMPORTING is_item      TYPE ty_item
    RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDINTERFACE.

* Regel ABS: absoluter Differenzwert je Position
CLASS lcl_rule_absolute DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_rule.
    METHODS constructor IMPORTING iv_limit TYPE dmbtr.
  PRIVATE SECTION.
    DATA mv_limit TYPE dmbtr.
ENDCLASS.

CLASS lcl_rule_absolute IMPLEMENTATION.
  METHOD constructor.
    mv_limit = iv_limit.
  ENDMETHOD.
  METHOD lif_rule~is_auto_postable.
    rv_ok = xsdbool( abs( is_item-wert ) <= mv_limit ).
  ENDMETHOD.
ENDCLASS.

* Regel PCT: Differenz in Prozent vom Buchbestand
CLASS lcl_rule_percent DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_rule.
    METHODS constructor IMPORTING iv_pct TYPE p.
  PRIVATE SECTION.
    DATA mv_pct TYPE p LENGTH 5 DECIMALS 2.
ENDCLASS.

CLASS lcl_rule_percent IMPLEMENTATION.
  METHOD constructor.
    mv_pct = iv_pct.
  ENDMETHOD.
  METHOD lif_rule~is_auto_postable.
    IF is_item-buchm = 0.
      rv_ok = abap_false.               " Nullbestand immer zur Freigabe
      RETURN.
    ENDIF.
    rv_ok = xsdbool( abs( is_item-menge - is_item-buchm ) * 100 / is_item-buchm <= mv_pct ).
  ENDMETHOD.
ENDCLASS.

CLASS lcl_rule_factory DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS get
      IMPORTING iv_werks       TYPE werks_d
      RETURNING VALUE(ro_rule) TYPE REF TO lif_rule.
ENDCLASS.

CLASS lcl_rule_factory IMPLEMENTATION.
  METHOD get.
    DATA: lv_rule  TYPE char3,
          lv_limit TYPE dmbtr,
          lv_pct   TYPE p LENGTH 5 DECIMALS 2.

    SELECT SINGLE rule_type limit_value limit_pct FROM zmm_pi_limit
      INTO (lv_rule, lv_limit, lv_pct)
      WHERE werks = iv_werks.
    CASE lv_rule.
      WHEN 'PCT'.
        ro_rule = NEW lcl_rule_percent( lv_pct ).
      WHEN OTHERS.
*       ABS und nicht gepflegt: absolute Grenze (ungepflegt = 0 -> alles zur Freigabe)
        ro_rule = NEW lcl_rule_absolute( lv_limit ).
    ENDCASE.
  ENDMETHOD.
ENDCLASS.
