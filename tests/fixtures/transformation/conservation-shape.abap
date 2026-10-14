REPORT zcc_conservation_shape.
* Hand-written in the shape of the SD A/B program of 13.10.2026 (not the program
* itself): a derived check whose literal the routine also uses in a CASE before
* it, and a derived check on a code a called routine returns.
TYPES: BEGIN OF ty_effect,
         eid       TYPE c LENGTH 10,
         reference TYPE c LENGTH 10,
         kind      TYPE c LENGTH 10,
         qty       TYPE i,
       END OF ty_effect.
DATA gt_effects TYPE STANDARD TABLE OF ty_effect WITH DEFAULT KEY.
DATA gv_code TYPE c LENGTH 32.
PARAMETERS p_stamp TYPE c LENGTH 14.

START-OF-SELECTION.
  PERFORM validate_selection.
  PERFORM check_conservation CHANGING gv_code.
  WRITE: / gv_code.

FORM validate_selection.
  DATA lv_code TYPE c LENGTH 32.
  lv_code = space.
  PERFORM check_stamp USING p_stamp CHANGING lv_code.
  IF lv_code IS NOT INITIAL.
    MESSAGE 'P_STAMP must be a valid stamp' TYPE 'E'.
  ENDIF.
ENDFORM.

FORM check_stamp USING iv_stamp TYPE c CHANGING cv_code TYPE c.
  CLEAR cv_code.
  IF strlen( iv_stamp ) <> 14.
    cv_code = 'BAD_STAMP'.
  ENDIF.
ENDFORM.

FORM check_conservation CHANGING cv_code TYPE c.
  DATA: ls_parent TYPE ty_effect, ls_child TYPE ty_effect, lv_qty TYPE i.
  LOOP AT gt_effects INTO ls_parent.
    CLEAR lv_qty.
    LOOP AT gt_effects INTO ls_child WHERE reference = ls_parent-eid.
      CASE ls_parent-kind.
        WHEN 'SHIP'.
          IF ls_child-kind = 'RECEIPT'. lv_qty = lv_qty + ls_child-qty. ENDIF.
      ENDCASE.
    ENDLOOP.
    IF ls_parent-kind = 'SHIP' AND lv_qty > ls_parent-qty.
      cv_code = 'RETURNS_EXCEED_SHIPMENT'. RETURN.
    ENDIF.
  ENDLOOP.
ENDFORM.
