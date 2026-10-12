*&---------------------------------------------------------------------*
*& Hand-written fixture for tests/transformation-*.spec.ts, modelled on
*& the shape of a PP/MM kit simulation: packed quantities with three
*& places, a skipping CONTINUE and CHECK inside loops, an early RETURN,
*& one large demo-data routine. Not a customer program.
*&---------------------------------------------------------------------*
REPORT zfx_pp_kit.

TYPES ty_qty TYPE p LENGTH 12 DECIMALS 3.
TYPES: BEGIN OF ty_comp,
         matnr TYPE matnr,
         bdmng TYPE p LENGTH 12 DECIMALS 3,
         enmng TYPE p LENGTH 12 DECIMALS 3,
         labst TYPE p LENGTH 12 DECIMALS 3,
         status TYPE c LENGTH 1,
       END OF ty_comp.

DATA gt_comp TYPE STANDARD TABLE OF ty_comp WITH EMPTY KEY.
DATA gv_short TYPE i.

PARAMETERS p_werks TYPE werks_d OBLIGATORY.
PARAMETERS p_aufnr TYPE aufnr.
PARAMETERS p_demo AS CHECKBOX.
SELECT-OPTIONS s_matnr FOR gt_comp-matnr NO INTERVALS.

INITIALIZATION.
  p_demo = 'X'.

START-OF-SELECTION.
  IF p_demo = 'X'.
    PERFORM load_demo.
  ELSE.
    PERFORM read_components.
  ENDIF.
  PERFORM check_coverage.
  PERFORM display.

FORM read_components.
  IF p_aufnr IS INITIAL.
    RETURN.
  ENDIF.
  SELECT matnr, bdmng, enmng FROM resb
    WHERE aufnr = @p_aufnr AND werks = @p_werks AND matnr IN @s_matnr
    INTO CORRESPONDING FIELDS OF TABLE @gt_comp.
  LOOP AT gt_comp ASSIGNING FIELD-SYMBOL(<ls_comp>).
    SELECT SINGLE labst FROM mard WHERE matnr = @<ls_comp>-matnr AND werks = @p_werks INTO @<ls_comp>-labst.
  ENDLOOP.
ENDFORM.

FORM check_coverage.
  DATA lv_open TYPE ty_qty.
  LOOP AT gt_comp ASSIGNING FIELD-SYMBOL(<ls_comp>).
    IF <ls_comp>-bdmng <= 0.
      CONTINUE.
    ENDIF.
    lv_open = <ls_comp>-bdmng - <ls_comp>-enmng.
    IF <ls_comp>-labst >= lv_open.
      <ls_comp>-status = 'G'.
    ELSE.
      <ls_comp>-status = 'R'.
      gv_short = gv_short + 1.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM display.
  LOOP AT gt_comp INTO DATA(ls_comp).
    CHECK ls_comp-status <> ' '.
    PERFORM write_line USING ls_comp.
  ENDLOOP.
ENDFORM.

FORM write_line USING is_comp TYPE ty_comp.
  WRITE: / is_comp-matnr, is_comp-bdmng, is_comp-labst, is_comp-status.
ENDFORM.

FORM load_demo.
  CLEAR gt_comp.
  APPEND VALUE #( matnr = 'M-01' bdmng = '0.400' enmng = '0.100' labst = '0.300' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-02' bdmng = '0.800' enmng = '0.100' labst = '0.700' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-03' bdmng = '5.000' enmng = '0.000' labst = '4.999' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-04' bdmng = '1.000' enmng = '0.000' labst = '1.000' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-05' bdmng = '2.500' enmng = '0.500' labst = '2.000' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-06' bdmng = '3.000' enmng = '1.000' labst = '1.000' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-07' bdmng = '0.000' enmng = '0.000' labst = '0.000' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-08' bdmng = '7.250' enmng = '0.250' labst = '7.000' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-09' bdmng = '9.999' enmng = '0.000' labst = '9.998' ) TO gt_comp.
  APPEND VALUE #( matnr = 'M-10' bdmng = '0.300' enmng = '0.000' labst = '0.300' ) TO gt_comp.
ENDFORM.
