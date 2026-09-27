CLASS zcl_hr_overtime DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING
        iv_begda TYPE begda
        iv_endda TYPE endda.
    METHODS evaluate
      IMPORTING
        iv_pernr      TYPE persno
      RETURNING
        VALUE(rs_res) TYPE zhr_s_ot_result.
    METHODS raise_alert
      IMPORTING
        is_res TYPE zhr_s_ot_result.

  PRIVATE SECTION.
    CONSTANTS c_default_limit TYPE p LENGTH 5 DECIMALS 2 VALUE '20.00'.
    DATA: mv_begda TYPE begda,
          mv_endda TYPE endda,
          mt_limit TYPE SORTED TABLE OF zhr_ot_limit
                     WITH NON-UNIQUE KEY persa.
ENDCLASS.



CLASS zcl_hr_overtime IMPLEMENTATION.

  METHOD constructor.
    mv_begda = iv_begda.
    mv_endda = iv_endda.
*   Monatsgrenzen je Personalbereich (Betriebsvereinbarung)
    SELECT * FROM zhr_ot_limit INTO TABLE mt_limit
      WHERE begda <= iv_endda
        AND endda >= iv_begda.
  ENDMETHOD.


  METHOD evaluate.
    DATA: lt_p0007 TYPE STANDARD TABLE OF p0007,
          ls_p0007 TYPE p0007,
          lt_p0001 TYPE STANDARD TABLE OF p0001,
          ls_p0001 TYPE p0001,
          ls_limit TYPE zhr_ot_limit,
          lv_ist   TYPE p LENGTH 7 DECIMALS 2,
          lv_mehr  TYPE p LENGTH 7 DECIMALS 2,
          lv_soll  TYPE p LENGTH 7 DECIMALS 2,
          lv_days  TYPE i.

    rs_res-pernr = iv_pernr.
    rs_res-begda = mv_begda.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr           = iv_pernr
        infty           = '0007'
        begda           = mv_endda
        endda           = mv_endda
      TABLES
        infty_tab       = lt_p0007
      EXCEPTIONS
        infty_not_found = 1
        OTHERS          = 2.
    IF sy-subrc <> 0 OR lt_p0007 IS INITIAL.
      rs_res-status = 'E'.
      rs_res-text   = 'Keine Sollarbeitszeit (IT0007)'.
      RETURN.
    ENDIF.
    READ TABLE lt_p0007 INTO ls_p0007 INDEX 1.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr           = iv_pernr
        infty           = '0001'
        begda           = mv_endda
        endda           = mv_endda
      TABLES
        infty_tab       = lt_p0001
      EXCEPTIONS
        infty_not_found = 1
        OTHERS          = 2.
    READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.
    rs_res-persa = ls_p0001-werks.
    rs_res-orgeh = ls_p0001-orgeh.

*   Ist: Anwesenheiten des Monats
    SELECT SUM( stdaz ) FROM pa2002 INTO lv_ist
      WHERE pernr = iv_pernr
        AND begda BETWEEN mv_begda AND mv_endda
        AND sprps = space.
*   erfasste Mehrarbeit
    SELECT SUM( stdaz ) FROM pa2005 INTO lv_mehr
      WHERE pernr = iv_pernr
        AND begda BETWEEN mv_begda AND mv_endda
        AND sprps = space.

*   Soll: Wochenstunden / 5 * Arbeitstage (vereinfacht, ohne Feiertage)
    lv_days = ( mv_endda - mv_begda + 1 ) * 5 / 7.
    lv_soll = ls_p0007-wostd / 5 * lv_days.
    rs_res-overtime = lv_ist + lv_mehr - lv_soll.

    READ TABLE mt_limit INTO ls_limit WITH KEY persa = rs_res-persa.
    IF sy-subrc = 0.
      rs_res-limit = ls_limit-hours.
    ELSE.
      rs_res-limit = c_default_limit.
    ENDIF.

    IF rs_res-overtime > rs_res-limit.
      rs_res-status = 'R'.
    ELSEIF rs_res-overtime > rs_res-limit * '0.8'.
      rs_res-status = 'Y'.
    ELSE.
      rs_res-status = 'G'.
    ENDIF.
  ENDMETHOD.


  METHOD raise_alert.
    DATA: ls_alert  TYPE zhr_ot_alert,
          lv_objkey TYPE swo_typeid.

    SELECT SINGLE * FROM zhr_ot_alert INTO ls_alert
      WHERE pernr = is_res-pernr
        AND begda = is_res-begda.
    IF sy-subrc = 0.
      RETURN.                 "je Mitarbeiter und Monat nur ein Alarm
    ENDIF.

    CLEAR ls_alert.
    ls_alert-pernr    = is_res-pernr.
    ls_alert-begda    = is_res-begda.
    ls_alert-overtime = is_res-overtime.
    ls_alert-limit    = is_res-limit.
    ls_alert-erdat    = sy-datum.
    ls_alert-ernam    = sy-uname.
    INSERT zhr_ot_alert FROM ls_alert.

    lv_objkey = is_res-pernr && is_res-begda.
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'ZHROT'
        objkey            = lv_objkey
        event             = 'LIMITEXCEEDED'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
  ENDMETHOD.

ENDCLASS.
