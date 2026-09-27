CLASS zcl_hr_it_mapper_0001 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* IT0001 Organisatorische Zuordnung -> Z1HRORG (Pflicht)
  PUBLIC SECTION.
    INTERFACES zif_hr_it_mapper.
ENDCLASS.



CLASS zcl_hr_it_mapper_0001 IMPLEMENTATION.

  METHOD zif_hr_it_mapper~map.
    DATA: lt_p0001 TYPE STANDARD TABLE OF p0001,
          ls_seg   TYPE z1hrorg.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = iv_pernr
        infty     = '0001'
        begda     = iv_keydate
        endda     = iv_keydate
      TABLES
        infty_tab = lt_p0001
      EXCEPTIONS
        OTHERS    = 1.
    IF sy-subrc <> 0 OR lt_p0001 IS INITIAL.
      RAISE EXCEPTION TYPE zcx_hr_idoc_map
        EXPORTING
          textid = zcx_hr_idoc_map=>mandatory_missing.
    ENDIF.

    READ TABLE lt_p0001 INTO DATA(ls_p0001) INDEX 1.
    ls_seg-bukrs = ls_p0001-bukrs.
    ls_seg-werks = ls_p0001-werks.
    ls_seg-btrtl = ls_p0001-btrtl.
    ls_seg-kostl = ls_p0001-kostl.
    ls_seg-orgeh = ls_p0001-orgeh.
*   ls_seg-plans = ls_p0001-plans.   "Planstelle will das Zutrittssystem nicht
    APPEND VALUE #( segnam = 'Z1HRORG' sdata = ls_seg ) TO rt_segments.
  ENDMETHOD.

ENDCLASS.
