*&---------------------------------------------------------------------*
*& Report ZMM_PI_DIFF_POST
*&---------------------------------------------------------------------*
*& Inventurdifferenzen buchen mit wertabhaengiger Freigaberegel
*& - Differenzen unter der Werksgrenze werden direkt gebucht
*& - darueber: Vormerkung zur Freigabe durch das Werkscontrolling
*& Ersatz fuer MI07 im Sammellauf (Projekt INV-2017)
*&---------------------------------------------------------------------*
REPORT zmm_pi_diff_post LINE-SIZE 132.

TABLES: ikpf.

TYPES: BEGIN OF ty_item,
         iblnr  TYPE iblnr,
         gjahr  TYPE gjahr,
         zeili  TYPE dzeile,
         matnr  TYPE matnr,
         werks  TYPE werks_d,
         lgort  TYPE lgort_d,
         buchm  TYPE menge_d,
         menge  TYPE menge_d,
         wert   TYPE dmbtr,
         action TYPE char4,
       END OF ty_item.

DATA: gt_items TYPE STANDARD TABLE OF ty_item,
      gv_posted TYPE i,
      gv_held   TYPE i.

FIELD-SYMBOLS <gs_item> TYPE ty_item.

SELECT-OPTIONS: s_werks FOR ikpf-werks OBLIGATORY,
                s_iblnr FOR ikpf-iblnr.
PARAMETERS:     p_test AS CHECKBOX DEFAULT 'X'.

INCLUDE zmm_pi_diff_post_c01.
INCLUDE zmm_pi_diff_post_f01.

START-OF-SELECTION.
  PERFORM select_items.
  IF gt_items IS INITIAL.
    MESSAGE s398(00) WITH 'Keine gezaehlten, ungebuchten Differenzen'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  LOOP AT gt_items ASSIGNING <gs_item>.
    DATA(lo_rule) = lcl_rule_factory=>get( <gs_item>-werks ).
    IF lo_rule->is_auto_postable( <gs_item> ) = abap_true.
      <gs_item>-action = 'POST'.
    ELSE.
      <gs_item>-action = 'HOLD'.
    ENDIF.
  ENDLOOP.

  IF p_test = abap_true.
    PERFORM display_items.
  ELSE.
    PERFORM post_differences.
  ENDIF.
