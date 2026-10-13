*&---------------------------------------------------------------------*
*& Hand-written fixture for tests/transformation-*.spec.ts, modelled on
*& the shape of an SD order program: END-OF-SELECTION, an ALV with a
*& user-command callback, a dialog module, a discount in percent, a
*& database update on the user's command. Not a customer program.
*&---------------------------------------------------------------------*
REPORT zfx_sd_orders.

TYPES: BEGIN OF ty_order,
         vbeln TYPE vbeln_va,
         kunnr TYPE kunnr,
         netwr TYPE p LENGTH 8 DECIMALS 2,
       END OF ty_order.

DATA gt_orders TYPE STANDARD TABLE OF ty_order WITH EMPTY KEY.
DATA gv_ok TYPE sy-ucomm.

PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.
PARAMETERS p_discnt TYPE p LENGTH 3 DECIMALS 2 DEFAULT '2.50'.
PARAMETERS p_from TYPE erdat.
SELECT-OPTIONS s_kunnr FOR gt_orders-kunnr.

AT SELECTION-SCREEN.
  IF p_discnt > 30.
    MESSAGE e010(zsd).
  ENDIF.

START-OF-SELECTION.
  PERFORM read_orders.

END-OF-SELECTION.
  PERFORM show_alv.
  CALL SCREEN 100.

FORM read_orders.
  SELECT vbeln, kunnr, netwr FROM vbak
    WHERE vkorg = @p_vkorg AND kunnr IN @s_kunnr AND erdat >= @p_from
    INTO CORRESPONDING FIELDS OF TABLE @gt_orders.
  IF gt_orders IS INITIAL.
    MESSAGE e011(zsd).
  ENDIF.
ENDFORM.

FORM show_alv.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program      = sy-repid
      i_callback_user_command = 'USER_COMMAND'
    TABLES
      t_outtab                = gt_orders.
ENDFORM.

FORM user_command USING iv_ucomm TYPE sy-ucomm is_selfield TYPE slis_selfield.
  CASE iv_ucomm.
    WHEN 'DISC'.
      PERFORM apply_discount USING is_selfield-tabindex.
    WHEN 'VA02'.
      CALL TRANSACTION 'VA02' AND SKIP FIRST SCREEN.
  ENDCASE.
ENDFORM.

FORM apply_discount USING iv_index TYPE i.
  DATA lv_new TYPE p LENGTH 8 DECIMALS 2.
  READ TABLE gt_orders INTO DATA(ls_order) INDEX iv_index.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  lv_new = ls_order-netwr - ls_order-netwr * p_discnt / 100.
  UPDATE vbak SET netwr = @lv_new WHERE vbeln = @ls_order-vbeln.
ENDFORM.

MODULE status_0100 OUTPUT.
  SET PF-STATUS 'MAIN'.
ENDMODULE.

MODULE user_command_0100 INPUT.
  IF gv_ok = 'BACK'.
    LEAVE TO SCREEN 0.
  ENDIF.
ENDMODULE.
