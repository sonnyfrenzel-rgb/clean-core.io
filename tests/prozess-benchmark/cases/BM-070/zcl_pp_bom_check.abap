CLASS zcl_pp_bom_check DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_issue,
             idnrk TYPE idnrk,
             stufe TYPE histu,
             text  TYPE c LENGTH 60,
           END OF ty_issue,
           tt_issue TYPE STANDARD TABLE OF ty_issue WITH DEFAULT KEY.

    "! Mehrstufige Stuecklistenaufloesung mit Plausibilitaetspruefung der
    "! Lagerkomponenten im Produktionswerk (vor Freigabe neuer Varianten)
    METHODS check_components
      IMPORTING iv_matnr         TYPE matnr
                iv_werks         TYPE werks_d
                iv_datum         TYPE datuv DEFAULT sy-datum
      RETURNING VALUE(rt_issues) TYPE tt_issue
      RAISING   zcx_pp_bom_error.

  PRIVATE SECTION.
    METHODS is_blocked
      IMPORTING iv_matnr          TYPE matnr
      RETURNING VALUE(rv_blocked) TYPE abap_bool.
ENDCLASS.



CLASS zcl_pp_bom_check IMPLEMENTATION.

  METHOD check_components.
    DATA: lt_stb   TYPE STANDARD TABLE OF stpox,
          ls_stb   TYPE stpox,
          ls_marc  TYPE marc,
          ls_issue TYPE ty_issue.

    CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
      EXPORTING
        capid              = 'PP01'
        datuv              = iv_datum
        mtnrv              = iv_matnr
        werks              = iv_werks
        mehrs              = 'X'
        emeng              = 1
      TABLES
        stb                = lt_stb
      EXCEPTIONS
        material_not_found = 1
        no_bom_found       = 2
        OTHERS             = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pp_bom_error.
    ENDIF.

*   nur Lagerpositionen, Text- und Dokumentpositionen interessieren nicht
    LOOP AT lt_stb INTO ls_stb WHERE postp = 'L'.
      CLEAR ls_issue.
      ls_issue-idnrk = ls_stb-idnrk.
      ls_issue-stufe = ls_stb-stufe.

      SELECT SINGLE * FROM marc INTO ls_marc
        WHERE matnr = ls_stb-idnrk
          AND werks = iv_werks.
      IF sy-subrc <> 0.
        ls_issue-text = 'Komponente im Werk nicht angelegt'.
        APPEND ls_issue TO rt_issues.
        CONTINUE.
      ENDIF.

      IF ls_marc-lvorm = 'X'.
        ls_issue-text = 'Komponente zum Loeschen vorgemerkt'.
        APPEND ls_issue TO rt_issues.
      ELSEIF ls_marc-dismm = 'ND'.
        ls_issue-text = 'Komponente ohne Disposition (ND)'.
        APPEND ls_issue TO rt_issues.
      ENDIF.

      DATA(lv_gesperrt) = is_blocked( ls_stb-idnrk ).
      IF lv_gesperrt = abap_true.
        ls_issue-text = 'Werksuebergreifend gesperrt'.
        APPEND ls_issue TO rt_issues.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD is_blocked.
    DATA lv_mstae TYPE mstae.

    SELECT SINGLE mstae FROM mara INTO lv_mstae
      WHERE matnr = iv_matnr.
*   01 = Einkauf/Lager gesperrt, Z9 = Auslauf (seit 2019)
    IF lv_mstae = '01' OR lv_mstae = 'Z9'.
      rv_blocked = abap_true.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
