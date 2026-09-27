CLASS zcl_pe_booking DEFINITION PUBLIC FINAL CREATE PUBLIC.
************************************************************************
* Buchung eines Teilnehmers (P) auf eine Veranstaltung (E)
*  Beziehung A025 "nimmt teil an" P -> E, Prioritaet PRIOX:
*    '50' = feste Buchung, '90' = Warteliste (Kundenkonvention)
*  Kapazitaet aus Infotyp 1024 (KAPZ3 = Maximum)
*  Voraussetzung: Qualifikation lt. ZPE_EVT_PREREQ je Veranstaltungstyp
************************************************************************
  PUBLIC SECTION.
    EVENTS: booked     EXPORTING VALUE(ev_pernr) TYPE pernr_d,
            waitlisted EXPORTING VALUE(ev_pernr) TYPE pernr_d.

    METHODS constructor
      IMPORTING iv_event TYPE hrobjid
                iv_test  TYPE abap_bool
      RAISING   zcx_pe_booking.
    METHODS book
      IMPORTING iv_pernr TYPE pernr_d
      RAISING   zcx_pe_booking.

  PRIVATE SECTION.
    CONSTANTS: gc_plvar TYPE plvar VALUE '01',
               gc_fixed TYPE priox VALUE '50',
               gc_wait  TYPE priox VALUE '90'.
    DATA: mv_event  TYPE hrobjid,
          mv_test   TYPE abap_bool,
          mv_capmax TYPE i,
          mv_booked TYPE i,
          mv_prereq TYPE hrobjid.

    METHODS create_relation
      IMPORTING iv_pernr TYPE pernr_d
                iv_prio  TYPE priox
      RAISING   zcx_pe_booking.
ENDCLASS.


CLASS zcl_pe_booking IMPLEMENTATION.

  METHOD constructor.
    DATA: lv_istat TYPE istat_d,
          lv_evtyp TYPE hrobjid.

    mv_event = iv_event.
    mv_test  = iv_test.

    SELECT SINGLE istat FROM hrp1000 INTO lv_istat
      WHERE plvar = gc_plvar AND otype = 'E' AND objid = iv_event
        AND begda >= sy-datum.
    IF sy-subrc <> 0 OR lv_istat = '2'.
*     Veranstaltung vergangen, unbekannt oder nur geplant ('2')
      RAISE EXCEPTION TYPE zcx_pe_booking
        EXPORTING textid = zcx_pe_booking=>event_not_bookable.
    ENDIF.

    SELECT SINGLE kapz3 FROM hrp1024 INTO mv_capmax
      WHERE plvar = gc_plvar AND otype = 'E' AND objid = iv_event.

    SELECT COUNT(*) FROM hrp1001 INTO mv_booked
      WHERE plvar = gc_plvar AND otype = 'E' AND objid = iv_event
        AND rsign = 'B' AND relat = '025' AND sclas = 'P'
        AND priox = gc_fixed.

*   Veranstaltungstyp (D) und dessen Voraussetzung
    SELECT SINGLE sobid FROM hrp1001 INTO lv_evtyp
      WHERE plvar = gc_plvar AND otype = 'E' AND objid = iv_event
        AND rsign = 'A' AND relat = '020' AND sclas = 'D'.
    IF sy-subrc = 0.
      SELECT SINGLE qualid FROM zpe_evt_prereq INTO mv_prereq
        WHERE evtyp = lv_evtyp.
    ENDIF.
  ENDMETHOD.


  METHOD book.
*   bereits gebucht oder auf Warteliste?
    SELECT SINGLE @abap_true FROM hrp1001
      WHERE plvar = @gc_plvar AND otype = 'P' AND objid = @iv_pernr
        AND rsign = 'A' AND relat = '025' AND sclas = 'E'
        AND sobid = @mv_event
      INTO @DATA(lv_exists).
    IF lv_exists = abap_true.
      RAISE EXCEPTION TYPE zcx_pe_booking
        EXPORTING textid = zcx_pe_booking=>already_booked.
    ENDIF.

*   Voraussetzung (Qualifikation A032) vorhanden?
    IF mv_prereq IS NOT INITIAL.
      SELECT SINGLE @abap_true FROM hrp1001
        WHERE plvar = @gc_plvar AND otype = 'P' AND objid = @iv_pernr
          AND rsign = 'A' AND relat = '032' AND sclas = 'Q'
          AND sobid = @mv_prereq
          AND endda >= @sy-datum
        INTO @DATA(lv_qualified).
      IF lv_qualified = abap_false.
        RAISE EXCEPTION TYPE zcx_pe_booking
          EXPORTING textid = zcx_pe_booking=>prerequisite_missing.
      ENDIF.
    ENDIF.

    IF mv_capmax > 0 AND mv_booked >= mv_capmax.
      create_relation( iv_pernr = iv_pernr iv_prio = gc_wait ).
      RAISE EVENT waitlisted EXPORTING ev_pernr = iv_pernr.
      RETURN.
    ENDIF.

    create_relation( iv_pernr = iv_pernr iv_prio = gc_fixed ).
    mv_booked = mv_booked + 1.
    RAISE EVENT booked EXPORTING ev_pernr = iv_pernr.
  ENDMETHOD.


  METHOD create_relation.
    CALL FUNCTION 'RH_RELATION_MAINTAIN'
      EXPORTING
        act_fcode           = 'INSE'
        act_plvar           = gc_plvar
        act_otype           = 'P'
        act_objid           = iv_pernr
        act_rsign           = 'A'
        act_relat           = '025'
        act_sclas           = 'E'
        act_sobid           = mv_event
        act_begda           = sy-datum
        act_endda           = '99991231'
        act_prozt           = 0
        act_priox           = iv_prio
        act_vtask           = COND hr_vtask( WHEN mv_test = abap_true
                                             THEN 'B'
                                             ELSE 'V' )
      EXCEPTIONS
        maintainance_failed = 1
        OTHERS              = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_pe_booking
        EXPORTING textid = zcx_pe_booking=>relation_failed.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
