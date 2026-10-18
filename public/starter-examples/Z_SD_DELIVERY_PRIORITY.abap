REPORT z_sd_delivery_priority.
*----------------------------------------------------------------------*
* Delivery priority of open sales orders
*----------------------------------------------------------------------*
* One change for the shipping planners, built in 2019 in three parts:
*
*   1. Two customer fields on the sales order header, in the append
*      ZASD_VBAK_PRIO of VBAK: ZZ_PRIO_CLASS (priority class A, B or C)
*      and ZZ_PRIO_NOTE (why a planner set the class by hand).
*   2. The rule that fills ZZ_PRIO_CLASS when an order is saved, and the
*      check that refuses a class outside A, B and C: the implementation
*      ZCL_IM_SD_DELIV_PRIO of the customer BAdI ZSD_DELIV_PRIO. It is
*      shown here as local classes, so that the example stays one program.
*   3. This list: open orders of one sales organisation, totalled per
*      priority class, with their net value.
*
* The thresholds stand in ZSD_PRIO_RULES, one row per sales organisation:
* the net value from which an order is class A, the net value from which
* it is class B, and the customer group whose orders are always class A.
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_total,
         prio_class TYPE c LENGTH 1,
         waerk      TYPE waerk,
         orders     TYPE i,
         netwr      TYPE netwr,
       END OF ty_total,
       ty_totals TYPE STANDARD TABLE OF ty_total WITH EMPTY KEY.

*----------------------------------------------------------------------*
* The BAdI interface and its implementation
*----------------------------------------------------------------------*
INTERFACE lif_sd_deliv_prio.
  METHODS derive_priority
    CHANGING cs_header TYPE vbak.
  METHODS check_priority
    IMPORTING is_header  TYPE vbak
    EXPORTING ev_message TYPE string.
ENDINTERFACE.

CLASS lcl_im_sd_deliv_prio DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES: if_badi_interface,
                lif_sd_deliv_prio.
ENDCLASS.

CLASS lcl_im_sd_deliv_prio IMPLEMENTATION.

  METHOD lif_sd_deliv_prio~derive_priority.
    " A class a planner set by hand stays as it is.
    IF cs_header-zz_prio_note IS NOT INITIAL.
      RETURN.
    ENDIF.

    SELECT SINGLE value_a, value_b, kvgr1_a
      FROM zsd_prio_rules
      WHERE vkorg = @cs_header-vkorg
      INTO @DATA(ls_rule).
    IF sy-subrc <> 0.
      cs_header-zz_prio_class = 'C'.
      RETURN.
    ENDIF.

    IF ls_rule-kvgr1_a IS NOT INITIAL AND cs_header-kvgr1 = ls_rule-kvgr1_a.
      cs_header-zz_prio_class = 'A'.
    ELSEIF cs_header-netwr >= ls_rule-value_a.
      cs_header-zz_prio_class = 'A'.
    ELSEIF cs_header-netwr >= ls_rule-value_b.
      cs_header-zz_prio_class = 'B'.
    ELSE.
      cs_header-zz_prio_class = 'C'.
    ENDIF.
  ENDMETHOD.

  METHOD lif_sd_deliv_prio~check_priority.
    CLEAR ev_message.
    IF is_header-zz_prio_class <> 'A'
       AND is_header-zz_prio_class <> 'B'
       AND is_header-zz_prio_class <> 'C'.
      ev_message = |Priority class { is_header-zz_prio_class } is not A, B or C.|.
    ELSEIF is_header-zz_prio_class = 'A' AND is_header-zz_prio_note IS INITIAL
       AND is_header-netwr < 1000.
      ev_message = |Class A below 1000 needs a note why it was set by hand.|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

*----------------------------------------------------------------------*
* The list
*----------------------------------------------------------------------*
DATA gv_erdat TYPE erdat.
DATA gt_totals TYPE ty_totals.

PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.
SELECT-OPTIONS s_erdat FOR gv_erdat.

START-OF-SELECTION.
  PERFORM collect_totals.
  PERFORM write_totals.

*----------------------------------------------------------------------*
* Open orders of the sales organisation, totalled per priority class
*----------------------------------------------------------------------*
FORM collect_totals.
  DATA ls_total TYPE ty_total.

  SELECT vbeln, erdat, waerk, netwr, zz_prio_class
    FROM vbak
    WHERE vkorg = @p_vkorg
      AND erdat IN @s_erdat
      AND gbstk <> 'C'
    INTO TABLE @DATA(lt_orders).

  LOOP AT lt_orders INTO DATA(ls_order).
    CLEAR ls_total.
    ls_total-prio_class = ls_order-zz_prio_class.
    ls_total-waerk      = ls_order-waerk.
    ls_total-orders     = 1.
    ls_total-netwr      = ls_order-netwr.
    COLLECT ls_total INTO gt_totals.
  ENDLOOP.

  SORT gt_totals BY prio_class waerk.
ENDFORM.

*----------------------------------------------------------------------*
* One line per priority class and currency
*----------------------------------------------------------------------*
FORM write_totals.
  WRITE: / 'Open sales orders per delivery priority, sales organisation', p_vkorg.
  ULINE.
  LOOP AT gt_totals INTO DATA(ls_total).
    WRITE: / ls_total-prio_class, ls_total-orders, ls_total-netwr, ls_total-waerk.
  ENDLOOP.
ENDFORM.
