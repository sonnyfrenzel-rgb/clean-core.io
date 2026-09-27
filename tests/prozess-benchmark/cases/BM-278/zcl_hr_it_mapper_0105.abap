CLASS zcl_hr_it_mapper_0105 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* IT0105 Kommunikation, Subtyp 9001 Ausweisnummer -> Z1HRBADGE (optional)
  PUBLIC SECTION.
    INTERFACES zif_hr_it_mapper.
  PRIVATE SECTION.
    CONSTANTS gc_badge TYPE usrty VALUE '9001'.
ENDCLASS.



CLASS zcl_hr_it_mapper_0105 IMPLEMENTATION.

  METHOD zif_hr_it_mapper~map.
    DATA: lt_p0105 TYPE STANDARD TABLE OF p0105,
          ls_seg   TYPE z1hrbadge.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = iv_pernr
        infty     = '0105'
        begda     = iv_keydate
        endda     = iv_keydate
      TABLES
        infty_tab = lt_p0105
      EXCEPTIONS
        OTHERS    = 1.
    DELETE lt_p0105 WHERE usrty <> gc_badge.
    IF lt_p0105 IS INITIAL.
*     noch kein Ausweis ausgegeben - kein Fehler
      RETURN.
    ENDIF.

    READ TABLE lt_p0105 INTO DATA(ls_p0105) INDEX 1.
    ls_seg-badge_id = ls_p0105-usrid.
    ls_seg-valid_to = ls_p0105-endda.
    APPEND VALUE #( segnam = 'Z1HRBADGE' sdata = ls_seg ) TO rt_segments.
  ENDMETHOD.

ENDCLASS.
