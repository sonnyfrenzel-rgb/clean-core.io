REPORT zsd_pick_split MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Kommissionierung und Gewichtssplit von Auslieferungen (Nachtjob)
*
*  - liest nicht kommissionierte Auslieferungen je Versandstelle
*  - verarbeitet je Versandstelle ein Paket parallel (aRFC, Servergruppe)
*  - im RFC-Baustein: Split bei Überschreiten des LKW-Maximalgewichts,
*    danach Kommissionierung mit voller Liefermenge
*  - Ergebnisliste je Lieferung
*----------------------------------------------------------------------*
* 2016-02 TSC  Ersterstellung (Werk 2000, Versandstellen 2001-2004)
* 2017-10 TSC  Parallelisierung über Servergruppe PARALLEL_SD
* 2020-05 OKA  lokaler Fallback bei Kommunikationsfehler
*----------------------------------------------------------------------*
TABLES: likp.

TYPES: BEGIN OF ty_lief,
         vstel TYPE likp-vstel,
         vbeln TYPE likp-vbeln,
       END OF ty_lief.

DATA: gt_lief    TYPE STANDARD TABLE OF ty_lief,
      gt_paket   TYPE zsd_t_vbeln,
      gt_result  TYPE zsd_t_pick_result,
      gv_running TYPE i,
      gv_taskno  TYPE n LENGTH 4,
      gv_task    TYPE char32.

SELECT-OPTIONS: s_vstel FOR likp-vstel OBLIGATORY,
                s_lfdat FOR likp-lfdat.
PARAMETERS:     p_maxgw TYPE brgew DEFAULT '24000',   "kg je LKW
                p_tasks TYPE i DEFAULT 4,
                p_group TYPE rzlli_apcl DEFAULT 'PARALLEL_SD',
                p_test  AS CHECKBOX DEFAULT 'X'.

START-OF-SELECTION.
* nicht kommissioniert (KOSTK = A), Warenausgang offen
  SELECT l~vstel l~vbeln
    INTO TABLE gt_lief
    FROM likp AS l
    INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
    WHERE l~vstel IN s_vstel
      AND l~lfdat IN s_lfdat
      AND l~lfart = 'LF'
      AND u~kostk = 'A'
      AND u~wbstk <> 'C'.
  IF sy-subrc <> 0.
    MESSAGE s700.
    RETURN.
  ENDIF.

  SORT gt_lief BY vstel vbeln.

  LOOP AT gt_lief INTO DATA(ls_lief).
    APPEND ls_lief-vbeln TO gt_paket.
    AT END OF vstel.
      PERFORM paket_starten.
      CLEAR gt_paket.
    ENDAT.
  ENDLOOP.

* auf alle Rückmeldungen warten
  WAIT UNTIL gv_running = 0 UP TO 600 SECONDS.
  IF gv_running > 0.
    MESSAGE i701 WITH gv_running.
  ENDIF.

  PERFORM liste_ausgeben.

*&---------------------------------------------------------------------*
*&      Form  PAKET_STARTEN
*&---------------------------------------------------------------------*
*       Paket einer Versandstelle asynchron starten; bei Ressourcen-
*       engpass warten und erneut versuchen, bei Kommunikationsfehler
*       lokal (synchron) verarbeiten
*----------------------------------------------------------------------*
FORM paket_starten.
  DATA lv_msg TYPE char255.

  DO.
    gv_taskno = gv_taskno + 1.
    gv_task   = |PICK{ gv_taskno }|.

    CALL FUNCTION 'Z_SD_PICK_SPLIT_RFC'
      STARTING NEW TASK gv_task
      DESTINATION IN GROUP p_group
      PERFORMING ergebnis_empfangen ON END OF TASK
      EXPORTING
        it_vbeln              = gt_paket
        iv_maxgw              = p_maxgw
        iv_test               = p_test
      EXCEPTIONS
        resource_failure      = 1
        communication_failure = 2 MESSAGE lv_msg
        system_failure        = 3 MESSAGE lv_msg.

    CASE sy-subrc.
      WHEN 0.
        gv_running = gv_running + 1.
        EXIT.
      WHEN 1.
*       keine freien Workprozesse - kurz warten, dann erneut
        WAIT UNTIL gv_running < p_tasks UP TO 5 SECONDS.
      WHEN OTHERS.
        MESSAGE s702 WITH lv_msg.
        PERFORM paket_lokal.
        EXIT.
    ENDCASE.
  ENDDO.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PAKET_LOKAL
*&---------------------------------------------------------------------*
FORM paket_lokal.
  DATA lt_res TYPE zsd_t_pick_result.

  CALL FUNCTION 'Z_SD_PICK_SPLIT_RFC'
    EXPORTING
      it_vbeln  = gt_paket
      iv_maxgw  = p_maxgw
      iv_test   = p_test
    IMPORTING
      et_result = lt_res.
  APPEND LINES OF lt_res TO gt_result.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNIS_EMPFANGEN  (Callback aRFC)
*&---------------------------------------------------------------------*
FORM ergebnis_empfangen USING iv_task TYPE clike.
  DATA lt_res TYPE zsd_t_pick_result.

  RECEIVE RESULTS FROM FUNCTION 'Z_SD_PICK_SPLIT_RFC'
    IMPORTING
      et_result             = lt_res
    EXCEPTIONS
      communication_failure = 1
      system_failure        = 2.
  IF sy-subrc <> 0.
    APPEND VALUE #( vbeln = space status = 'E'
                    text  = |Task { iv_task }: keine Rückmeldung| )
           TO gt_result.
  ELSE.
    APPEND LINES OF lt_res TO gt_result.
  ENDIF.
  gv_running = gv_running - 1.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LISTE_AUSGEBEN
*&---------------------------------------------------------------------*
FORM liste_ausgeben.
  SORT gt_result BY vbeln.
  FORMAT COLOR COL_HEADING.
  WRITE: / 'Lieferung', 15 'Neue Lieferung', 32 'Status', 40 'Text'.
  FORMAT RESET.
  LOOP AT gt_result INTO DATA(ls_res).
    CASE ls_res-status.
      WHEN 'S'.
        FORMAT COLOR COL_POSITIVE.
      WHEN 'W'.
        FORMAT COLOR COL_TOTAL.
      WHEN OTHERS.
        FORMAT COLOR COL_NEGATIVE.
    ENDCASE.
    WRITE: / ls_res-vbeln, 15 ls_res-vbeln_neu, 32 ls_res-status,
             40 ls_res-text.
  ENDLOOP.
  FORMAT RESET.
ENDFORM.
