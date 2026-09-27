FUNCTION z_pm_mplan_calc.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IT_WARPL) TYPE  ZPM_T_WARPL
*"     VALUE(IV_TEST) TYPE  XFELD
*"  EXPORTING
*"     VALUE(ET_RESULT) TYPE  ZPM_T_MPLAN_RESULT
*"----------------------------------------------------------------------
* RFC-fähig (Funktionsgruppe ZPM_MPLAN): ein Paket Wartungspläne
* eines Planungswerks hochrechnen und fällige Aufträge anlegen
*----------------------------------------------------------------------
  DATA: lt_cyc TYPE zpm_t_mplan_cycle,
        ls_res TYPE zpm_s_mplan_result.

  CHECK it_warpl IS NOT INITIAL.

  SELECT c~warpl, c~point, c~zykl1, p~equnr, p~iwerk, p~auart, p~ilart
    FROM mmpt AS c
    INNER JOIN mpos AS p ON p~warpl = c~warpl
    FOR ALL ENTRIES IN @it_warpl
    WHERE c~warpl = @it_warpl-table_line
      AND c~point <> @space
    INTO CORRESPONDING FIELDS OF TABLE @lt_cyc.

  LOOP AT lt_cyc INTO DATA(ls_cyc).
    CLEAR ls_res.
    ls_res-warpl = ls_cyc-warpl.

    CALL FUNCTION 'ENQUEUE_EZPM_MPLA'
      EXPORTING
        warpl          = ls_cyc-warpl
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      ls_res-status = 'L'.
      ls_res-text   = 'Wartungsplan gesperrt'.
      APPEND ls_res TO et_result.
      CONTINUE.
    ENDIF.

    PERFORM process_plan USING ls_cyc iv_test CHANGING ls_res.
    APPEND ls_res TO et_result.

    CALL FUNCTION 'DEQUEUE_EZPM_MPLA'
      EXPORTING
        warpl = ls_cyc-warpl.
  ENDLOOP.
ENDFUNCTION.
