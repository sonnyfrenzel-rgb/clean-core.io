CLASS zcl_im_pm_wcm_release DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* BAdI WORKORDER_UPDATE - Freigabeprüfung Arbeitssicherheit
* Instandhaltungsauftrag darf erst freigegeben werden, wenn alle
* Genehmigungen erteilt und alle ZWCM-Vorgänge freigeschaltet sind.
* 2019-02 JHO  Erstellung (Arbeitsschutzprojekt Werk 2000)
* 2020-11 JHO  Freischaltprüfung je Vorgang (ZPM_FREISCH)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES if_badi_interface.
    INTERFACES if_ex_workorder_update.
ENDCLASS.


CLASS zcl_im_pm_wcm_release IMPLEMENTATION.

  METHOD if_ex_workorder_update~at_release.
    DATA: lt_afvc    TYPE STANDARD TABLE OF afvc,
          lt_isol    TYPE STANDARD TABLE OF zpm_freisch,
          lv_isol_ok TYPE abap_bool VALUE abap_true.

    CHECK is_header_dialog-iwerk = '2000'.

*   1) Genehmigungen (Feuererlaubnis, Befahrerlaubnis ...) am Auftrag
    SELECT counter, permit, gendatum, genvname FROM ihgns
      WHERE objnr = @is_header_dialog-objnr
        AND geloe = @space
      INTO TABLE @DATA(lt_perm).

    DATA(lv_offen) = REDUCE i( INIT n = 0
                               FOR ls_perm IN lt_perm
                               WHERE ( gendatum IS INITIAL )
                               NEXT n = n + 1 ).
    IF lv_offen > 0.
      MESSAGE e210(zpm) WITH lv_offen is_header_dialog-aufnr
        RAISING error_with_message.
    ENDIF.

*   2) Vorgänge mit Steuerschlüssel ZWCM brauchen aktive Freischaltung
    SELECT * FROM afvc INTO TABLE lt_afvc
      WHERE aufpl = is_header_dialog-aufpl
        AND steus = 'ZWCM'.
*   IF lt_afvc IS INITIAL. RETURN. ENDIF.   "raus wg. Performance-Test?
    SELECT * FROM zpm_freisch INTO TABLE lt_isol
      FOR ALL ENTRIES IN lt_afvc
      WHERE aufpl = lt_afvc-aufpl
        AND aplzl = lt_afvc-aplzl.

    LOOP AT lt_afvc INTO DATA(ls_afvc).
      LOOP AT lt_isol INTO DATA(ls_isol) WHERE aplzl = ls_afvc-aplzl.
        IF ls_isol-status <> 'AKT'.
          lv_isol_ok = abap_false.
          EXIT.
        ENDIF.
      ENDLOOP.
      IF sy-subrc <> 0.
*       keine Freischaltung erfasst
        lv_isol_ok = abap_false.
      ENDIF.
      IF lv_isol_ok = abap_false.
        EXIT.
      ENDIF.
    ENDLOOP.

    IF lv_isol_ok = abap_false.
      MESSAGE e211(zpm) WITH ls_afvc-vornr is_header_dialog-aufnr
        RAISING error_with_message.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
