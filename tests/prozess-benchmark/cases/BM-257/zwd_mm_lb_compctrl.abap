*----------------------------------------------------------------------*
* WD-Komponente ZWD_MM_LIEF_BEWERTUNG, COMPONENTCONTROLLER
* Attribute: MV_BERECHNET TYPE ABAP_BOOL (public), MS_BEWERTUNG
* Assistenzklasse ZCL_MM_LB_ASSIST (wd_assist)
*
* Gewichtung laut Einkaufsrichtlinie EK-07 (Stand 2021):
*   Liefertreue 40 %, Mengentreue 30 %, Qualitaet 30 %
*   Note A >= 85, B >= 60, C darunter (C = Eskalation)
*----------------------------------------------------------------------*
METHOD wddoinit .
* Letzte Bewertungen als Historie anzeigen (nur eigene Einkaufsgruppe
* war geplant, siehe Ticket EK-311 - nie umgesetzt)
  SELECT lifnr, von, bis, gesamt, note, erfasst_von, erfasst_am
    FROM zmm_lief_bew
    ORDER BY erfasst_am DESCENDING
    INTO TABLE @DATA(lt_hist)
    UP TO 20 ROWS.

  wd_context->get_child_node( name = wd_this->wdctx_historie )->bind_table(
    new_items = lt_hist ).

  wd_context->get_child_node( name = wd_this->wdctx_selektion )->bind_structure(
    new_item = VALUE wd_this->element_selektion( von = sy-datum - 365 bis = sy-datum ) ).
ENDMETHOD.


METHOD berechnen .
* IMPORTING iv_lifnr TYPE lifnr  iv_von TYPE d  iv_bis TYPE d
  DATA: ls_kennz  TYPE zcl_mm_lb_assist=>ty_kennzahlen,
        lv_qual   TYPE zmm_lb_punkte,
        lo_msg    TYPE REF TO if_wd_message_manager.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).
  wd_this->mv_berechnet = abap_false.

  ls_kennz = wd_assist->lieferkennzahlen( iv_lifnr = iv_lifnr
                                          iv_von   = iv_von
                                          iv_bis   = iv_bis ).
  IF ls_kennz-anzahl = 0.
    lo_msg->report_t100_message( msgid = 'ZMM_LB' msgno = '001' msgty = 'I' p1 = iv_lifnr ).
    RETURN.
  ENDIF.

  lv_qual = wd_assist->qualitaetsquote( iv_lifnr = iv_lifnr
                                        iv_von   = iv_von
                                        iv_bis   = iv_bis ).

  wd_this->ms_bewertung = VALUE #(
    lifnr       = iv_lifnr
    von         = iv_von
    bis         = iv_bis
    liefertreue = ls_kennz-puenktlich * 100 / ls_kennz-anzahl
    mengentreue = ls_kennz-mengentreu * 100 / ls_kennz-anzahl
    qualitaet   = lv_qual ).

  wd_this->ms_bewertung-gesamt = ( wd_this->ms_bewertung-liefertreue * 40
                                 + wd_this->ms_bewertung-mengentreue * 30
                                 + wd_this->ms_bewertung-qualitaet   * 30 ) / 100.

  IF wd_this->ms_bewertung-gesamt >= 85.
    wd_this->ms_bewertung-note = 'A'.
  ELSEIF wd_this->ms_bewertung-gesamt >= 60.
    wd_this->ms_bewertung-note = 'B'.
  ELSE.
    wd_this->ms_bewertung-note = 'C'.
  ENDIF.

  wd_context->get_child_node( name = wd_this->wdctx_ergebnis )->bind_structure(
    new_item = wd_this->ms_bewertung ).
  wd_this->mv_berechnet = abap_true.
ENDMETHOD.


METHOD speichern .
  DATA lo_msg TYPE REF TO if_wd_message_manager.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).

  TRY.
      wd_assist->speichern( wd_this->ms_bewertung ).
    CATCH zcx_mm_lb INTO DATA(lx_lb).
      lo_msg->report_exception( message_object = lx_lb ).
      RETURN.
  ENDTRY.

  IF wd_this->ms_bewertung-note = 'C'.
    wd_assist->eskalieren( wd_this->ms_bewertung-lifnr ).
    lo_msg->report_t100_message( msgid = 'ZMM_LB' msgno = '011' msgty = 'W'
                                 p1 = wd_this->ms_bewertung-lifnr ).
  ENDIF.

  lo_msg->report_t100_message( msgid = 'ZMM_LB' msgno = '010' msgty = 'S'
                               p1 = wd_this->ms_bewertung-lifnr ).
  wd_this->mv_berechnet = abap_false.
ENDMETHOD.
