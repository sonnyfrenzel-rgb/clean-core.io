REPORT zcc_ref_052.
PARAMETERS p_bname TYPE c LENGTH 12.
START-OF-SELECTION.
  SELECT SINGLE bname, bcode, uflag
    FROM usr02
    WHERE bname = @p_bname
    INTO @DATA(ls_user).
  IF sy-subrc <> 0.
    WRITE / 'NO_USER'.
    RETURN.
  ENDIF.
  WRITE: / ls_user-bname, ls_user-uflag.
  WRITE: / ls_user-bcode.
