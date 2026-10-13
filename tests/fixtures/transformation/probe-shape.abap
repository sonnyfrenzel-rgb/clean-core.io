*&---------------------------------------------------------------------*
*& Hand-written fixture for tests/transformation-fill-probes.spec.ts,
*& modelled on the three patterns the SD and PP reviews probed in the
*& written code: a selection range on a field of the input records, a
*& quantity recalculated from its own value, and a database write that
*& refuses a negative amount. Not a customer program.
*&---------------------------------------------------------------------*
REPORT zfx_probe_items.

TYPES: BEGIN OF ty_item,
         vbeln TYPE vbeln_va,
         matnr TYPE matnr,
         menge TYPE p LENGTH 8 DECIMALS 2,
         netwr TYPE p LENGTH 10 DECIMALS 2,
       END OF ty_item.

DATA gt_item TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.

PARAMETERS p_vkorg TYPE vkorg OBLIGATORY DEFAULT '1000'.
PARAMETERS p_add TYPE p LENGTH 6 DECIMALS 2 DEFAULT '1.00'.
PARAMETERS p_demo AS CHECKBOX.
SELECT-OPTIONS s_matnr FOR gt_item-matnr.

START-OF-SELECTION.
  IF p_demo = 'X'.
    PERFORM load_demo.
  ELSE.
    PERFORM read_items.
  ENDIF.
  PERFORM recalc_quantities.
  PERFORM check_amounts.
  PERFORM save_items.
  PERFORM display_items.

FORM read_items.
  SELECT vbeln, matnr, menge, netwr FROM vbap
    WHERE vkorg = @p_vkorg AND matnr IN @s_matnr
    INTO CORRESPONDING FIELDS OF TABLE @gt_item.
ENDFORM.

FORM recalc_quantities.
  LOOP AT gt_item ASSIGNING FIELD-SYMBOL(<ls_item>).
    <ls_item>-menge = <ls_item>-menge + p_add.
  ENDLOOP.
ENDFORM.

FORM check_amounts.
  LOOP AT gt_item INTO DATA(ls_item).
    IF ls_item-netwr < 0.
      MESSAGE e001(zsd).
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM save_items.
  LOOP AT gt_item INTO DATA(ls_save).
    UPDATE vbap SET menge = @ls_save-menge, netwr = @ls_save-netwr WHERE vbeln = @ls_save-vbeln.
  ENDLOOP.
ENDFORM.

FORM display_items.
  LOOP AT gt_item INTO DATA(ls_out).
    WRITE: / ls_out-vbeln, ls_out-matnr, ls_out-menge, ls_out-netwr.
  ENDLOOP.
ENDFORM.

FORM load_demo.
  CLEAR gt_item.
  APPEND VALUE #( vbeln = '0000004711' matnr = 'M-01' menge = '2.00' netwr = '100.00' ) TO gt_item.
  APPEND VALUE #( vbeln = '0000004712' matnr = 'M-02' menge = '1.50' netwr = '80.00' ) TO gt_item.
ENDFORM.
