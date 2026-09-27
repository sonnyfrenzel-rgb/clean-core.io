*&---------------------------------------------------------------------*
*&  Include           MZPP_SHOPFLOOR_I02
*&---------------------------------------------------------------------*
*  Werkstatt-Terminal: Rueckmeldung zum Fertigungsauftragsvorgang
*  Dynpro 0200 (Vorgangsdetail). Aufruf aus Vorgangsliste 0100.
*----------------------------------------------------------------------*
*  2010-09-14 RHO  Ersterstellung Halle 3
*  2014-01-08 RHO  Endrueckmeldung mit Rueckfrage (Meister-Wunsch)
*  2019-05-27 EXT  Umstellung CO11N-BDC -> BAPI_PRODORDCONF_CREATE_TT
*----------------------------------------------------------------------*

*----------------------------------------------------------------------*
*  MODULE user_command_0200 INPUT
*----------------------------------------------------------------------*
MODULE user_command_0200 INPUT.

  CASE ok_code.
    WHEN 'BACK'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0100.

    WHEN 'RUECK'.
      CLEAR ok_code.
*     Gutmenge + Ausschuss duerfen die offene Vorgangsmenge nicht
*     ueberschreiten (Ueberlieferung ist in Halle 3 nicht erlaubt)
      IF gs_rm-yield + gs_rm-scrap > gs_vorg-offen.
        MESSAGE e210(zpp_sf) WITH gs_vorg-offen gs_vorg-meinh.
      ENDIF.
      PERFORM rueckmelden.

  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0200  INPUT

*&---------------------------------------------------------------------*
*&      Form  RUECKMELDEN
*&---------------------------------------------------------------------*
FORM rueckmelden.

  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
        ls_tt     TYPE bapi_pp_timeticket,
        lt_detret TYPE STANDARD TABLE OF bapi_coru_return,
        ls_return TYPE bapiret1,
        lv_answer TYPE c LENGTH 1.

* Endrueckmeldung schliesst den Vorgang -> Werker muss bestaetigen
  IF gs_rm-endrm = abap_true.
    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Endrueckmeldung'(t02)
        text_question         = 'Vorgang wird endgueltig abgeschlossen. Fortfahren?'(q02)
        default_button        = '2'
        display_cancel_button = abap_false
      IMPORTING
        answer                = lv_answer
      EXCEPTIONS
        OTHERS                = 1.
    IF lv_answer <> '1'.
      RETURN.
    ENDIF.
  ENDIF.

  ls_tt-orderid    = gs_rm-aufnr.
  ls_tt-operation  = gs_rm-vornr.
  ls_tt-yield      = gs_rm-yield.
  ls_tt-scrap      = gs_rm-scrap.
  ls_tt-dev_reason = gs_rm-grund.
  ls_tt-fin_conf   = gs_rm-endrm.
  ls_tt-conf_text  = gs_rm-text.
  ls_tt-postg_date = sy-datum.
  APPEND ls_tt TO lt_tt.

  CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
    EXPORTING
      post_wrong_entries = '0'
    IMPORTING
      return             = ls_return
    TABLES
      timetickets        = lt_tt
      detail_return      = lt_detret.

  IF ls_return-type CA 'EA'.
*   kein Rollback noetig, BAPI hat nichts gebucht (lt. Doku)
    MESSAGE ls_return-message TYPE 'I' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.

  MESSAGE s213(zpp_sf) WITH gs_rm-aufnr gs_rm-vornr.
  CLEAR gs_rm.

ENDFORM.                    " RUECKMELDEN
