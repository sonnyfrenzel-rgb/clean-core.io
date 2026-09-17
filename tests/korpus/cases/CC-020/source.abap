REPORT zcc_ref_020.
PARAMETERS p_type TYPE c LENGTH 30 DEFAULT 'ZCCR_PAYLOAD'.
PARAMETERS p_field TYPE c LENGTH 30 DEFAULT 'AMOUNT'.
DATA lr_payload TYPE REF TO data.
FIELD-SYMBOLS <payload> TYPE any.
FIELD-SYMBOLS <value> TYPE any.
START-OF-SELECTION.
  CREATE DATA lr_payload TYPE (p_type).
  ASSIGN lr_payload->* TO <payload>.
  ASSIGN COMPONENT p_field OF STRUCTURE <payload> TO <value>.
  IF sy-subrc = 0.
    WRITE / <value>.
  ELSE.
    WRITE / 'FIELD_NOT_FOUND'.
  ENDIF.
