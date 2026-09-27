CLASS zcl_hr_it_mapper_0002 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* IT0002 Daten zur Person -> Z1HRPER (Pflicht)
* DSGVO: volles Geburtsdatum nur mit Einwilligung (ZHR_CONSENT, Zweck CANTEEN)
  PUBLIC SECTION.
    INTERFACES zif_hr_it_mapper.
ENDCLASS.



CLASS zcl_hr_it_mapper_0002 IMPLEMENTATION.

  METHOD zif_hr_it_mapper~map.
    DATA: lt_p0002   TYPE STANDARD TABLE OF p0002,
          ls_seg     TYPE z1hrper,
          lv_consent TYPE abap_bool.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = iv_pernr
        infty     = '0002'
        begda     = iv_keydate
        endda     = iv_keydate
      TABLES
        infty_tab = lt_p0002
      EXCEPTIONS
        OTHERS    = 1.
    IF sy-subrc <> 0 OR lt_p0002 IS INITIAL.
      RAISE EXCEPTION TYPE zcx_hr_idoc_map
        EXPORTING
          textid = zcx_hr_idoc_map=>mandatory_missing.
    ENDIF.

    READ TABLE lt_p0002 INTO DATA(ls_p0002) INDEX 1.
    ls_seg-nachn = ls_p0002-nachn.
    ls_seg-vorna = ls_p0002-vorna.

    SELECT SINGLE consent FROM zhr_consent INTO lv_consent
      WHERE pernr   = iv_pernr
        AND purpose = 'CANTEEN'
        AND endda  >= iv_keydate.
    IF sy-subrc = 0 AND lv_consent = abap_true.
      ls_seg-gbdat = ls_p0002-gbdat.
    ELSE.
*     nur Geburtsjahr (Altersnachweis Kantine), Rest mit 0101 aufgefuellt
      ls_seg-gbdat = |{ ls_p0002-gbdat(4) }0101|.
    ENDIF.
    APPEND VALUE #( segnam = 'Z1HRPER' sdata = ls_seg ) TO rt_segments.
  ENDMETHOD.

ENDCLASS.
