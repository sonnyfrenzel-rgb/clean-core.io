*&---------------------------------------------------------------------*
*& Include ZPP_MASS_RELEASE_F02 - Verteilung (aRFC) und seriell
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Pakete per aRFC auf die Servergruppe verteilen
*&---------------------------------------------------------------------*
FORM verteilen.
  CALL FUNCTION 'SPBT_INITIALIZE'
    EXPORTING
      group_name                     = p_group
    IMPORTING
      max_pbt_wps                    = gv_max
      free_pbt_wps                   = gv_free
    EXCEPTIONS
      invalid_group_name             = 1
      internal_error                 = 2
      pbt_env_already_initialized    = 3
      currently_no_resources_avail   = 4
      no_pbt_resources_found         = 5
      cant_init_different_pbt_groups = 6
      OTHERS                         = 7.
  IF sy-subrc <> 0 AND sy-subrc <> 3.
*   Servergruppe nicht da -> seriell weiter (seit 2020-03)
    MESSAGE s204 WITH p_group.
    PERFORM seriell.
    RETURN.
  ENDIF.

  IF gv_free > p_maxt.
    gv_free = p_maxt.
  ENDIF.

  LOOP AT gt_pakete INTO gs_paket.
    gv_task = |REL{ gs_paket-nr WIDTH = 5 ALIGN = RIGHT PAD = '0' }|.

    DO.
      CALL FUNCTION 'Z_PP_RELEASE_PACKAGE'
        STARTING NEW TASK gv_task
        DESTINATION IN GROUP p_group
        PERFORMING empfangen ON END OF TASK
        EXPORTING
          iv_test               = p_test
        TABLES
          it_orders             = gs_paket-orders
        EXCEPTIONS
          communication_failure = 1 MESSAGE gv_msg
          system_failure        = 2 MESSAGE gv_msg
          resource_failure      = 3.

      CASE sy-subrc.
        WHEN 0.
          gv_sent = gv_sent + 1.
          EXIT.
        WHEN 3.
*         keine freien Prozesse: auf Rueckmeldungen warten, dann nochmal
          WAIT UNTIL gv_recv >= gv_sent UP TO 5 SECONDS.
        WHEN OTHERS.
          PERFORM paket_fehler USING gs_paket gv_msg.
          EXIT.
      ENDCASE.
    ENDDO.
  ENDLOOP.

* auf alle gestarteten Pakete warten
  WAIT UNTIL gv_recv >= gv_sent.
ENDFORM.

*&---------------------------------------------------------------------*
*& Rueckmeldung eines Pakets (ON END OF TASK)
*&---------------------------------------------------------------------*
FORM empfangen USING iv_task TYPE clike.
  DATA: lt_result TYPE STANDARD TABLE OF zpp_s_rel_result,
        lv_msg    TYPE c LENGTH 80.

  RECEIVE RESULTS FROM FUNCTION 'Z_PP_RELEASE_PACKAGE'
    TABLES
      et_result             = lt_result
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg.

  gv_recv = gv_recv + 1.

  IF sy-subrc <> 0.
    APPEND VALUE #( aufnr = space status = gc_st_err
                    text  = |Task { iv_task } abgebrochen: { lv_msg }| ) TO gt_result.
    RETURN.
  ENDIF.

  APPEND LINES OF lt_result TO gt_result.
ENDFORM.

*&---------------------------------------------------------------------*
*& Paket konnte nicht gestartet werden: alle Auftraege als Fehler
*&---------------------------------------------------------------------*
FORM paket_fehler USING is_paket TYPE ty_paket
                        iv_msg   TYPE clike.
  DATA ls_aufnr TYPE zpp_s_aufnr.

  LOOP AT is_paket-orders INTO ls_aufnr.
    APPEND VALUE #( aufnr = ls_aufnr-aufnr status = gc_st_err
                    text  = |nicht gestartet: { iv_msg }| ) TO gt_result.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Serielle Verarbeitung im eigenen Prozess
*&---------------------------------------------------------------------*
FORM seriell.
  DATA lt_result TYPE STANDARD TABLE OF zpp_s_rel_result.

  LOOP AT gt_pakete INTO gs_paket.
    CLEAR lt_result.
    CALL FUNCTION 'Z_PP_RELEASE_PACKAGE'
      EXPORTING
        iv_test   = p_test
      TABLES
        it_orders = gs_paket-orders
        et_result = lt_result.
    APPEND LINES OF lt_result TO gt_result.
  ENDLOOP.
ENDFORM.
