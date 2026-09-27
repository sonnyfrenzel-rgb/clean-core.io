* Include ZLE_LIEFERSCHEIN_F01 - Druckprogramm Lieferschein (Smart Form)
* Nachrichtenart ZLD0 (TNAPR: FORM ENTRY, Formular ZLE_LIEFERSCHEIN_SF)
FORM entry USING return_code us_screen.
  DATA: ls_likp  TYPE likp,
        lv_fm    TYPE rs38l_fnam,
        ls_ctrl  TYPE ssfctrlop.

  SELECT SINGLE * FROM likp INTO ls_likp
    WHERE vbeln = nast-objky(10).
  IF sy-subrc <> 0.
    return_code = 1.
    RETURN.
  ENDIF.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING
      formname           = 'ZLE_LIEFERSCHEIN_SF'
    IMPORTING
      fm_name            = lv_fm
    EXCEPTIONS
      no_form            = 1
      no_function_module = 2
      OTHERS             = 3.
* IF sy-subrc <> 0.        "auskommentiert 2014 - Formular ist immer da
*   return_code = 2.
*   RETURN.
* ENDIF.

  ls_ctrl-preview = xsdbool( us_screen = 'X' ).
  ls_ctrl-no_dialog = abap_true.
  CALL FUNCTION lv_fm
    EXPORTING
      control_parameters = ls_ctrl
      is_likp            = ls_likp
      is_nast            = nast
    EXCEPTIONS
      OTHERS             = 1.
  return_code = sy-subrc.
ENDFORM.
