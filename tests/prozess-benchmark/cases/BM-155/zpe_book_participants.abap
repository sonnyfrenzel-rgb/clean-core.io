REPORT zpe_book_participants.
************************************************************************
* Veranstaltungsmanagement: Pflichtschulung fuer ganze Abteilungen
* buchen (z. B. Arbeitssicherheit, Datenschutz-Unterweisung).
* Teilnehmer = alle aktiven Mitarbeiter der gewaehlten Org.-Einheiten.
* Buchungslogik in ZCL_PE_BOOKING (Kapazitaet, Voraussetzung, Warteliste)
* 2019-10 PE-Team  Anlage
************************************************************************
TABLES pa0001.
PARAMETERS: p_event TYPE hrobjid OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECT-OPTIONS s_orgeh FOR pa0001-orgeh OBLIGATORY.

CLASS lcl_log DEFINITION.
  PUBLIC SECTION.
    DATA: mv_booked   TYPE i,
          mv_waiting  TYPE i.
    METHODS on_booked FOR EVENT booked OF zcl_pe_booking
      IMPORTING ev_pernr.
    METHODS on_waitlisted FOR EVENT waitlisted OF zcl_pe_booking
      IMPORTING ev_pernr.
ENDCLASS.

CLASS lcl_log IMPLEMENTATION.
  METHOD on_booked.
    mv_booked = mv_booked + 1.
    WRITE: / ev_pernr, 'gebucht'.
  ENDMETHOD.
  METHOD on_waitlisted.
    mv_waiting = mv_waiting + 1.
    WRITE: / ev_pernr, 'auf Warteliste'.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA: lo_booking TYPE REF TO zcl_pe_booking,
        lo_log     TYPE REF TO lcl_log,
        lx_book    TYPE REF TO zcx_pe_booking.

  TRY.
      lo_booking = NEW zcl_pe_booking( iv_event = p_event
                                       iv_test  = p_test ).
    CATCH zcx_pe_booking INTO lx_book.
      MESSAGE lx_book TYPE 'E'.
  ENDTRY.

  lo_log = NEW lcl_log( ).
  SET HANDLER lo_log->on_booked lo_log->on_waitlisted FOR lo_booking.

  SELECT DISTINCT pernr FROM pa0001
    WHERE orgeh IN @s_orgeh
      AND begda <= @sy-datum
      AND endda >= @sy-datum
    INTO TABLE @DATA(lt_pernr).

  LOOP AT lt_pernr INTO DATA(ls_pernr).
    TRY.
        lo_booking->book( ls_pernr-pernr ).
      CATCH cx_static_check INTO DATA(lx_any).
        lx_book = CAST zcx_pe_booking( lx_any ).
        WRITE: / ls_pernr-pernr, lx_book->get_text( ).
    ENDTRY.
  ENDLOOP.

  IF p_test = abap_false.
    COMMIT WORK AND WAIT.
  ELSE.
    ROLLBACK WORK.
  ENDIF.
  ULINE.
  WRITE: / 'Gebucht:', lo_log->mv_booked, 'Warteliste:', lo_log->mv_waiting.
