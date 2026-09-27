CLASS zcl_hr_it_mapper_2001 DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* IT2001 Abwesenheiten -> Z1HRSUSP (optional)
* Lange Abwesenheit (Elternzeit, Langzeitkrank) sperrt den Zutritt voruebergehend.
  PUBLIC SECTION.
    INTERFACES zif_hr_it_mapper.
  PRIVATE SECTION.
    CONSTANTS gc_min_days TYPE i VALUE 42.
ENDCLASS.



CLASS zcl_hr_it_mapper_2001 IMPLEMENTATION.

  METHOD zif_hr_it_mapper~map.
    DATA: lt_p2001 TYPE STANDARD TABLE OF p2001,
          ls_seg   TYPE z1hrsusp,
          lv_days  TYPE i.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = iv_pernr
        infty     = '2001'
        begda     = iv_keydate
        endda     = iv_keydate
      TABLES
        infty_tab = lt_p2001
      EXCEPTIONS
        OTHERS    = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT lt_p2001 INTO DATA(ls_p2001).
*     0400 Elternzeit, 0500 Krankheit ohne Lohnfortzahlung (Kundenschema)
      CHECK ls_p2001-awart = '0400' OR ls_p2001-awart = '0500'.
      lv_days = ls_p2001-endda - ls_p2001-begda + 1.
      IF lv_days > gc_min_days.
        ls_seg-suspended = abap_true.
        ls_seg-susp_from = ls_p2001-begda.
        ls_seg-susp_to   = ls_p2001-endda.
        APPEND VALUE #( segnam = 'Z1HRSUSP' sdata = ls_seg ) TO rt_segments.
        EXIT.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
