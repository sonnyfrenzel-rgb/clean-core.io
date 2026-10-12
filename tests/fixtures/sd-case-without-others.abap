*&---------------------------------------------------------------------*
*& Report Z_CASE_WITHOUT_OTHERS
*&---------------------------------------------------------------------*
*& Hand-written fixture (SD review, 12.10.2026): radio buttons decide how
*& the result is put out, through a CASE without WHEN OTHERS, and a mode
*& decides how it is saved, with a decision of its own inside one arm.
*&---------------------------------------------------------------------*
REPORT z_case_without_others.

PARAMETERS: r_list RADIOBUTTON GROUP out DEFAULT 'X',
            r_form RADIOBUTTON GROUP out,
            r_file RADIOBUTTON GROUP out.
PARAMETERS: p_mode TYPE c LENGTH 4 DEFAULT 'SAVE',
            p_direct AS CHECKBOX.

START-OF-SELECTION.
  PERFORM read_orders.

  CASE 'X'.
    WHEN r_list.
      PERFORM show_list.
    WHEN r_form.
      PERFORM print_form.
    WHEN r_file.
      PERFORM write_file.
  ENDCASE.

  CASE p_mode.
    WHEN 'SAVE'.
      IF p_direct = 'X'.
        PERFORM save_direct.
      ELSE.
        PERFORM save_by_transaction.
      ENDIF.
    WHEN 'MAIL'.
      PERFORM mail_result.
  ENDCASE.

  PERFORM write_log.

FORM read_orders.
  DATA lt_orders TYPE STANDARD TABLE OF vbak.
  SELECT * FROM vbak INTO TABLE lt_orders UP TO 10 ROWS.
ENDFORM.

FORM show_list.
  WRITE / 'List'.
ENDFORM.

FORM print_form.
  WRITE / 'Form'.
ENDFORM.

FORM write_file.
  WRITE / 'File'.
ENDFORM.

FORM save_direct.
  WRITE / 'Direct'.
ENDFORM.

FORM save_by_transaction.
  WRITE / 'Transaction'.
ENDFORM.

FORM mail_result.
  WRITE / 'Mail'.
ENDFORM.

FORM write_log.
  WRITE / 'Log'.
ENDFORM.
