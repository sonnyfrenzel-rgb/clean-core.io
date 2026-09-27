CLASS zcl_hr_emp_sender DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_keydate TYPE sy-datum.
    METHODS send
      IMPORTING iv_pernr TYPE pernr_d
      RAISING   zcx_hr_send_error.
    METHODS enqueue_retry
      IMPORTING iv_pernr TYPE pernr_d
                ix_error TYPE REF TO zcx_hr_send_error.

  PRIVATE SECTION.
    CONSTANTS gc_max_retries TYPE i VALUE 5.
    DATA: mv_keydate TYPE sy-datum,
          mo_proxy   TYPE REF TO zco_hr_employee_out.

    METHODS build_payload
      IMPORTING iv_pernr      TYPE pernr_d
      RETURNING VALUE(rs_out) TYPE zhr_employee_out_mt
      RAISING   zcx_hr_send_error.
ENDCLASS.



CLASS zcl_hr_emp_sender IMPLEMENTATION.

  METHOD constructor.
    mv_keydate = iv_keydate.
  ENDMETHOD.


  METHOD send.
    DATA ls_out TYPE zhr_employee_out_mt.

    ls_out = build_payload( iv_pernr ).

    TRY.
        IF mo_proxy IS NOT BOUND.
          mo_proxy = NEW #( ).
        ENDIF.
        mo_proxy->employee_out( output = ls_out ).
      CATCH cx_ai_system_fault INTO DATA(lx_sys).
        RAISE EXCEPTION TYPE zcx_hr_send_temporary
          EXPORTING
            previous = lx_sys.
    ENDTRY.

*   erfolgreich uebergeben -> ggf. aus Warteschlange nehmen
    DELETE FROM zhr_send_queue WHERE pernr = iv_pernr.
  ENDMETHOD.


  METHOD build_payload.
    DATA: lt_p0002 TYPE STANDARD TABLE OF p0002,
          ls_p0001 TYPE p0001.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr           = iv_pernr
        infty           = '0002'
        begda           = mv_keydate
        endda           = mv_keydate
      TABLES
        infty_tab       = lt_p0002
      EXCEPTIONS
        infty_not_found = 1
        OTHERS          = 2.
    IF sy-subrc <> 0 OR lt_p0002 IS INITIAL.
*     Text der Ausnahme: Standardtext der Klasse (Personaldaten fehlen)
      RAISE EXCEPTION TYPE zcx_hr_send_error.
    ENDIF.
    READ TABLE lt_p0002 INTO DATA(ls_p0002) INDEX 1.
    rs_out-employee-personnel_number = iv_pernr.
    rs_out-employee-last_name        = ls_p0002-nachn.
    rs_out-employee-first_name       = ls_p0002-vorna.
    rs_out-employee-birth_date       = ls_p0002-gbdat.

    SELECT SINGLE bukrs werks persg persk kostl FROM pa0001
      INTO CORRESPONDING FIELDS OF ls_p0001
      WHERE pernr = iv_pernr
        AND begda <= mv_keydate
        AND endda >= mv_keydate.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_hr_send_error.
    ENDIF.
    rs_out-employee-company_code  = ls_p0001-bukrs.
    rs_out-employee-plant         = ls_p0001-werks.
    rs_out-employee-cost_center   = ls_p0001-kostl.
*   Kostenstelle nur fuer Angestellte (Mitarbeitergruppe 1) - Vorgabe Provider
    IF ls_p0001-persg <> '1'.
      CLEAR rs_out-employee-cost_center.
    ENDIF.
  ENDMETHOD.


  METHOD enqueue_retry.
    DATA ls_queue TYPE zhr_send_queue.

    SELECT SINGLE * FROM zhr_send_queue INTO ls_queue
      WHERE pernr = iv_pernr.
    ls_queue-pernr   = iv_pernr.
    ls_queue-status  = 'R'.
    ls_queue-errtext = ix_error->get_text( ).
    ls_queue-retries = ls_queue-retries + 1.
    IF ls_queue-retries > gc_max_retries.
*     aufgeben - HR-Service muss manuell klaeren
      ls_queue-status = 'X'.
    ENDIF.
    MODIFY zhr_send_queue FROM ls_queue.
  ENDMETHOD.

ENDCLASS.
