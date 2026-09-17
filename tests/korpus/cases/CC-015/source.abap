REPORT zcc_ref_015.
PARAMETERS p_read AS CHECKBOX DEFAULT space.
DATA lv_parameter TYPE c LENGTH 40 VALUE 'rdisp/myname'.
DATA lv_value TYPE c LENGTH 128.
START-OF-SELECTION.
  IF p_read <> 'X'.
    WRITE / 'NOT_EXECUTED'.
    RETURN.
  ENDIF.
  CALL 'C_SAPGPARAM'
    ID 'NAME' FIELD lv_parameter
    ID 'VALUE' FIELD lv_value.
  WRITE / lv_value.
