CLASS zcl_hr_pruef_planstelle DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Zielplanstelle muss existieren und darf zum Stichtag nicht mit einer
* anderen Person besetzt sein. Ohne Zielplanstelle keine Pruefung.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES zif_hr_umhaeng_pruefung.
  PRIVATE SECTION.
    CONSTANTS: gc_plvar TYPE plvar VALUE '01'.
ENDCLASS.



CLASS zcl_hr_pruef_planstelle IMPLEMENTATION.

  METHOD zif_hr_umhaeng_pruefung~pruefen.
    DATA: lv_objid TYPE hrobjid,
          lv_sobid TYPE sobid.

    IF iv_plans IS INITIAL.
      RETURN.
    ENDIF.

    SELECT SINGLE objid FROM hrp1000 INTO lv_objid
      WHERE plvar  = gc_plvar
        AND otype  = 'S'
        AND objid  = iv_plans
        AND begda <= iv_stichtag
        AND endda >= iv_stichtag.
    IF sy-subrc <> 0.
      rv_fehler = |Planstelle { iv_plans } existiert nicht zum Stichtag|.
      RETURN.
    ENDIF.

*   Inhaber: Verknuepfung A008 Planstelle -> Person
    SELECT SINGLE sobid FROM hrp1001 INTO lv_sobid
      WHERE plvar  = gc_plvar
        AND otype  = 'S'
        AND objid  = iv_plans
        AND rsign  = 'A'
        AND relat  = '008'
        AND sclas  = 'P'
        AND begda <= iv_stichtag
        AND endda >= iv_stichtag.
    IF sy-subrc = 0 AND lv_sobid <> iv_pernr.
      rv_fehler = |Planstelle { iv_plans } ist mit { lv_sobid } besetzt|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
