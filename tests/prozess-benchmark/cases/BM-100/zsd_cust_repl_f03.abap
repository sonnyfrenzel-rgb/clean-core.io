*&---------------------------------------------------------------------*
*& Include ZSD_CUST_REPL_F03 - Zeigerstatus und Protokoll
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form WRITE_POINTER_STATUS
*&---------------------------------------------------------------------*
*& Nur Zeiger erledigter Kunden werden geschlossen; die übrigen bleiben
*& offen und werden im nächsten Lauf erneut übertragen.
*&---------------------------------------------------------------------*
FORM write_pointer_status.
  DATA: lt_ident TYPE STANDARD TABLE OF bdicpident,
        ls_ident TYPE bdicpident,
        ls_cpmap TYPE ty_cpmap.

  LOOP AT gt_cpmap INTO ls_cpmap.
    READ TABLE gt_done WITH TABLE KEY table_line = ls_cpmap-kunnr
         TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      ls_ident-cpident = ls_cpmap-cpident.
      APPEND ls_ident TO lt_ident.
    ENDIF.
  ENDLOOP.
  IF lt_ident IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'CHANGE_POINTERS_STATUS_WRITE'
    EXPORTING
      message_type           = p_mestyp
    TABLES
      change_pointers_idents = lt_ident.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_ADD - Freitext ins Anwendungslog
*&---------------------------------------------------------------------*
FORM log_add USING pv_type TYPE c
                   pv_text TYPE c.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log
      i_msgty      = pv_type
      i_text       = pv_text
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.
