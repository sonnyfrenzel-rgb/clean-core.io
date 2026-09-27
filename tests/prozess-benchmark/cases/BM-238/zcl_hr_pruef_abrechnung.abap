CLASS zcl_hr_pruef_abrechnung DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Keine Umhaengung, solange der Abrechnungskreis des Mitarbeiters zur
* Abrechnung freigegeben ist (Steuersatz T569V, Status 1) - sonst
* rechnet die Abrechnung mit der alten Kostenstelle.
* Eingefuehrt 2019, in ZHR_UMH_PRUEF zunaechst inaktiv.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES zif_hr_umhaeng_pruefung.
ENDCLASS.



CLASS zcl_hr_pruef_abrechnung IMPLEMENTATION.

  METHOD zif_hr_umhaeng_pruefung~pruefen.
    DATA: lv_abkrs TYPE abkrs,
          lv_state TYPE t569v-state.

    SELECT SINGLE abkrs FROM pa0001 INTO lv_abkrs
      WHERE pernr  = iv_pernr
        AND begda <= iv_stichtag
        AND endda >= iv_stichtag.
    CHECK sy-subrc = 0.

    SELECT SINGLE state FROM t569v INTO lv_state
      WHERE abkrs = lv_abkrs.
    IF lv_state = '1'.
      rv_fehler = |Abrechnungskreis { lv_abkrs } ist zur Abrechnung freigegeben|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
