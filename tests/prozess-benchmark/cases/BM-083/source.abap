FUNCTION z_hr_get_orgeh.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_PERNR) TYPE  PERSNO
*"     VALUE(IV_DATE) TYPE  DATUM DEFAULT SY-DATUM
*"  EXPORTING
*"     VALUE(EV_ORGEH) TYPE  ORGEH
*"     VALUE(EV_KOSTL) TYPE  KOSTL
*"  EXCEPTIONS
*"      NOT_ASSIGNED
*"----------------------------------------------------------------------
  DATA: lt_p0001 TYPE STANDARD TABLE OF p0001,
        ls_p0001 TYPE p0001.

  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr           = iv_pernr
      infty           = '0001'
      begda           = iv_date
      endda           = iv_date
    TABLES
      infty_tab       = lt_p0001
    EXCEPTIONS
      infty_not_found = 1
      OTHERS          = 2.
  IF sy-subrc <> 0 OR lt_p0001 IS INITIAL.
    RAISE not_assigned.
  ENDIF.

  READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.
  ev_orgeh = ls_p0001-orgeh.
  ev_kostl = ls_p0001-kostl.
* Fallback Kostenstelle aus Planstelle - 2016 deaktiviert (JR)
*  IF ev_kostl IS INITIAL.
*    PERFORM get_kostl_from_plans USING ls_p0001-plans CHANGING ev_kostl.
*  ENDIF.
ENDFUNCTION.
