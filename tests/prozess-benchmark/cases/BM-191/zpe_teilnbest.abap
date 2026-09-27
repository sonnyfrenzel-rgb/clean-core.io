*&---------------------------------------------------------------------*
*& Report ZPE_TEILNBEST
*&---------------------------------------------------------------------*
*& Massendruck Teilnahmebestaetigungen Veranstaltungsmanagement (PE)
*& Adobe Form ZPE_TEILNAHMEBEST, laeuft taeglich als Job (Variante
*& TAGESLAUF) fuer Veranstaltungen, die in den letzten Tagen endeten.
*&
*& 2011-03  M.Keller   Erstellung (Smart Form ZPE_TEILNBEST_SF)
*& 2016-08  T.Brandt   Umstellung auf Adobe Form (Ticket HR-4471)
*& 2019-11  T.Brandt   Externe Personen (H) ergaenzt
*& 2021-02  extern     Wiederholungsdruck P_REPT, Druckprotokoll ZPE_TB_LOG
*&---------------------------------------------------------------------*
REPORT zpe_teilnbest MESSAGE-ID zpe_corr LINE-SIZE 120.

INCLUDE zpe_teilnbest_top.
INCLUDE zpe_teilnbest_f01.

START-OF-SELECTION.

  PERFORM select_data.

* Druckauftrag oeffnen - alle Bestaetigungen in einen Spoolauftrag
  gs_outpar-nodialog = abap_true.
  gs_outpar-preview  = p_prev.
  gs_outpar-dest     = p_dest.
  gs_outpar-reqimm   = xsdbool( p_prev = abap_false ).
  CALL FUNCTION 'FP_JOB_OPEN'
    CHANGING
      ie_outputparams = gs_outpar
    EXCEPTIONS
      cancel          = 1
      usage_error     = 2
      system_error    = 3
      internal_error  = 4
      OTHERS          = 5.
  IF sy-subrc <> 0.
    MESSAGE e020 WITH sy-subrc.
  ENDIF.

* Name des generierten Formularbausteins ermitteln
  TRY.
      CALL FUNCTION 'FP_FUNCTION_MODULE_NAME'
        EXPORTING
          i_name     = gc_form
        IMPORTING
          e_funcname = gv_fm_name.
    CATCH cx_fp_api INTO DATA(lx_fp).
      MESSAGE lx_fp TYPE 'E'.
  ENDTRY.

  LOOP AT gt_rel INTO gs_rel.

    READ TABLE gt_events INTO gs_event
         WITH KEY objid = gs_rel-objid BINARY SEARCH.
    CHECK sy-subrc = 0.

    CLEAR gs_attendee.
    gs_attendee-sclas = gs_rel-sclas.
    gs_attendee-sobid = gs_rel-sobid.

    CASE gs_rel-sclas.
      WHEN 'P'.
*       interne Mitarbeiter - Name aus Infotyp 0002
        SELECT SINGLE vorna, nachn, anred FROM pa0002
          INTO @DATA(ls_p0002)
          WHERE pernr = @gs_rel-sobid(8)
            AND begda <= @gs_event-endda
            AND endda >= @gs_event-endda.
        IF sy-subrc = 0.
          gs_attendee-name  = |{ ls_p0002-vorna } { ls_p0002-nachn }|.
          gs_attendee-anred = ls_p0002-anred.
        ELSE.
          gs_attendee-name  = gs_rel-sobid.
        ENDIF.
      WHEN 'H'.
*       externe Personen (seit 2019)
        SELECT SINGLE stext FROM hrp1000 INTO gs_attendee-name
          WHERE plvar = p_plvar
            AND otype = 'H'
            AND objid = gs_rel-sobid(8)
            AND begda <= gs_event-endda
            AND endda >= gs_event-endda
            AND langu = sy-langu.
      WHEN OTHERS.
*       Firmen (U) / Kunden (KU): Sammelbestaetigung kommt aus ZPE_FIRMBEST
        CONTINUE.
    ENDCASE.

*   schon gedruckt? Nur mit Wiederholungskennzeichen erneut
    SELECT SINGLE @abap_true FROM zpe_tb_log INTO @DATA(lv_done)
      WHERE plvar = @p_plvar
        AND evtid = @gs_rel-objid
        AND sclas = @gs_rel-sclas
        AND sobid = @gs_rel-sobid.
    CHECK sy-subrc <> 0 OR p_rept = abap_true.

    PERFORM print_confirmation.

    AT END OF objid.
      WRITE: / gs_event-objid, gs_event-stext(40), gs_event-endda, gv_evt_cnt.
      CLEAR gv_evt_cnt.
    ENDAT.

  ENDLOOP.

  CALL FUNCTION 'FP_JOB_CLOSE'
    EXCEPTIONS
      usage_error    = 1
      system_error   = 2
      internal_error = 3
      OTHERS         = 4.
  IF sy-subrc <> 0.
    MESSAGE s021 DISPLAY LIKE 'W'.
  ENDIF.

  ULINE.
  WRITE: / 'Bestaetigungen gedruckt:'(t01), gv_ok.
  WRITE: / 'Fehlerhafte Ausgaben:'(t02), gv_err.
