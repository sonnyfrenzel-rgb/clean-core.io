REPORT zcc_ref_048.
PARAMETERS p_min TYPE i DEFAULT 1.
DATA lt_values TYPE STANDARD TABLE OF i WITH EMPTY KEY.
DATA lv_sum TYPE i.
START-OF-SELECTION.
  lt_values = VALUE #( ( 5 ) ( 0 ) ( 3 ) ).
  CHECK p_min >= 0.
  LOOP AT lt_values INTO DATA(lv_value).
    CHECK lv_value >= p_min.
    lv_sum = lv_sum + lv_value.
  ENDLOOP.
  PERFORM show_sum USING lv_sum.
END-OF-SELECTION.
  WRITE / 'END'.
FORM show_sum USING iv_sum TYPE i.
  CHECK iv_sum > 0.
  WRITE / iv_sum.
ENDFORM.
