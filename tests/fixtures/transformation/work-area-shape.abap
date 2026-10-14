REPORT zcc_work_area_shape.
* Hand-written (defect E, 13.10.2026): checks on work areas. A row of the
* program's input (read from the database) is raw input; a row of an internal
* table the program builds itself, filled by LOOP, READ TABLE or SELECT, is a
* computed value.
TYPES: BEGIN OF ty_order,
         vbeln  TYPE c LENGTH 10,
         netwr  TYPE p LENGTH 15 DECIMALS 2,
       END OF ty_order.
TYPES: BEGIN OF ty_total,
         vbeln  TYPE c LENGTH 10,
         sum    TYPE p LENGTH 15 DECIMALS 2,
       END OF ty_total.
DATA gt_orders TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY.
DATA gt_totals TYPE STANDARD TABLE OF ty_total WITH DEFAULT KEY.
PARAMETERS p_vbeln TYPE c LENGTH 10.

START-OF-SELECTION.
  PERFORM read_orders.
  PERFORM build_totals.
  PERFORM check_orders.
  PERFORM check_totals.
  PERFORM check_first_total.
  PERFORM check_customer.

FORM read_orders.
  SELECT vbeln, netwr FROM vbak WHERE vbeln = @p_vbeln INTO TABLE @gt_orders.
ENDFORM.

FORM build_totals.
  DATA: ls_order TYPE ty_order, ls_total TYPE ty_total.
  LOOP AT gt_orders INTO ls_order.
    ls_total-vbeln = ls_order-vbeln.
    ls_total-sum = ls_order-netwr * 2.
    APPEND ls_total TO gt_totals.
  ENDLOOP.
ENDFORM.

FORM check_orders.
  LOOP AT gt_orders INTO DATA(ls_order).
    IF ls_order-netwr > 1000.
      MESSAGE 'Order value above 1000' TYPE 'E'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM check_totals.
  LOOP AT gt_totals ASSIGNING FIELD-SYMBOL(<ls_total>).
    IF <ls_total>-sum > 5000.
      MESSAGE 'Total above 5000' TYPE 'E'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM check_first_total.
  DATA ls_first TYPE ty_total.
  READ TABLE gt_totals INTO ls_first INDEX 1.
  IF ls_first-sum > 9000.
    MESSAGE 'First total above 9000' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM check_customer.
  DATA lv_kunnr TYPE c LENGTH 10.
  SELECT SINGLE kunnr FROM vbak WHERE vbeln = @p_vbeln INTO @lv_kunnr.
  IF lv_kunnr = 'BLOCKED'.
    MESSAGE 'Customer blocked' TYPE 'E'.
  ENDIF.
ENDFORM.
