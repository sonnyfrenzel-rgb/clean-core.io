CLASS zcl_hr_pruef_offene_abw DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Keine Umhaengung, wenn ab Stichtag Abwesenheiten erfasst sind -
* die Genehmiger haengen an der alten Organisationseinheit
* (Anforderung Zeitwirtschaft 2016).
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES zif_hr_umhaeng_pruefung.
ENDCLASS.



CLASS zcl_hr_pruef_offene_abw IMPLEMENTATION.

  METHOD zif_hr_umhaeng_pruefung~pruefen.
    DATA lv_cnt TYPE i.

    SELECT COUNT(*) FROM pa2001 INTO lv_cnt
      WHERE pernr  = iv_pernr
        AND begda >= iv_stichtag
        AND sprps  = space.
    IF lv_cnt > 0.
      rv_fehler = |{ lv_cnt } Abwesenheit(en) ab Stichtag erfasst|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
