REPORT zce_assert_fae.
TYPES: BEGIN OF ty_key, kunnr TYPE c LENGTH 10, END OF ty_key.
DATA keys TYPE STANDARD TABLE OF ty_key WITH EMPTY KEY.
START-OF-SELECTION.
  ASSERT lines( keys ) > 0.
  SELECT kunnr FROM kna1
    FOR ALL ENTRIES IN @keys
    WHERE kunnr = @keys-kunnr
    INTO TABLE @DATA(found).
