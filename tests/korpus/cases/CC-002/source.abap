REPORT zcc_ref_002.
TYPES: BEGIN OF ty_key, kunnr TYPE c LENGTH 10, END OF ty_key.
DATA lt_keys TYPE STANDARD TABLE OF ty_key WITH EMPTY KEY.
PARAMETERS p_kunnr TYPE c LENGTH 10.
START-OF-SELECTION.
  IF p_kunnr IS NOT INITIAL.
    APPEND VALUE #( kunnr = p_kunnr ) TO lt_keys.
  ENDIF.
  IF lt_keys IS INITIAL.
    WRITE / 'NO_INPUT'.
    RETURN.
  ENDIF.
  SELECT kunnr, bukrs, akont
    FROM knb1
    FOR ALL ENTRIES IN @lt_keys
    WHERE kunnr = @lt_keys-kunnr
    INTO TABLE @DATA(lt_company).
  LOOP AT lt_company INTO DATA(ls_company).
    WRITE: / ls_company-kunnr, ls_company-bukrs, ls_company-akont.
  ENDLOOP.
