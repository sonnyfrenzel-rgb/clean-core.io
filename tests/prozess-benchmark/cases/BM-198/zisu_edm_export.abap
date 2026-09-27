*&---------------------------------------------------------------------*
*& Report ZISU_EDM_EXPORT
*&---------------------------------------------------------------------*
*& Lastgangübermittlung (RLM, Viertelstundenwerte) an den Messstellen-
*& betreiber bzw. Netzbetreiber ueber das HTTP-Gateway (RFC-Destination
*& Typ G). Laeuft als Schritt 1 der Jobkette aus ZISU_EDM_SCHEDULER.
*&
*& Profilwerte kommen aus ZISU_EDM_PROF (Befuellung durch den EDM-Import
*& ZISU_EDM_IMPORT), Empfaengerzuordnung aus ZISU_EDM_MPO, Versandstatus
*& je Zaehlpunkt und Tag in ZISU_EDM_STAT.
*&---------------------------------------------------------------------*
REPORT zisu_edm_export MESSAGE-ID zisu_edm LINE-SIZE 132.

TABLES: euitrans.

TYPES: tt_pod TYPE STANDARD TABLE OF zisu_s_edm_pod WITH DEFAULT KEY.

DATA: gt_pod     TYPE tt_pod,               " alle selektierten Zaehlpunkte
      gt_open    TYPE tt_pod,               " davon noch nicht gesendet
      gt_prof    TYPE zisu_edm_prof_tt,     " Profilwerte des Stichtags
      gv_log     TYPE balloghndl,
      gv_evtparm TYPE btcevtparm,
      gv_sent    TYPE i,
      gv_failed  TYPE i,
      gv_skipped TYPE i.

DATA: gv_http   TYPE i,
      gv_tries  TYPE i,
      gv_len    TYPE i,
      gv_cnt    TYPE i,
      gv_status TYPE char1,
      gv_text   TYPE string.

DATA: gv_stat_upd  TYPE i,
      gv_msgcnt    TYPE i,
      gv_lognumber TYPE balognr,
      gs_balmsg    TYPE bal_s_msg,
      gs_log       TYPE bal_s_log,
      gt_handle    TYPE bal_t_logh,
      gt_lognum    TYPE bal_t_lgnm.

SELECT-OPTIONS: s_intui FOR euitrans-int_ui.
PARAMETERS: p_date   TYPE sy-datum OBLIGATORY,
            p_mode   TYPE char1 DEFAULT 'X',
            p_dest   TYPE rfcdest DEFAULT 'ZEDM_MPO_GATEWAY',
            p_maxtry TYPE i DEFAULT 3,
            p_test   AS CHECKBOX.

*----------------------------------------------------------------------*
* Makro: Meldung ins Anwendungsprotokoll  (&1 Typ, &2 Nr, &3/&4 Var.)
*----------------------------------------------------------------------*
DEFINE log_msg.
  CLEAR gs_balmsg.
  gs_balmsg-msgty     = &1.
  gs_balmsg-msgid     = 'ZISU_EDM'.
  gs_balmsg-msgno     = &2.
  gs_balmsg-msgv1     = &3.
  gs_balmsg-msgv2     = &4.
  gs_balmsg-probclass = COND #( WHEN &1 = 'E' THEN '1' ELSE '3' ).
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = gs_balmsg
    EXCEPTIONS
      OTHERS       = 4.
  gv_msgcnt = gv_msgcnt + 1.
END-OF-DEFINITION.

INCLUDE zisu_edm_export_f01.

START-OF-SELECTION.
* Entwicklertest: Umleitung auf Q-Gateway (TS 2020-02, "nur kurz")
  IF sy-uname = 'TSCHNEIDER'.
    p_dest = 'ZEDM_MPO_GATEWAY_Q'.
  ENDIF.

* Anwendungsprotokoll ZISU / EDM_EXPORT
  gs_log-object     = 'ZISU'.
  gs_log-subobject  = 'EDM_EXPORT'.
  gs_log-extnumber  = |Lastgang { p_date DATE = ISO }|.
  gs_log-aldate_del = sy-datum + 90.
  gs_log-del_before = abap_true.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log                 = gs_log
    IMPORTING
      e_log_handle            = gv_log
    EXCEPTIONS
      log_header_inconsistent = 1
      OTHERS                  = 2.
  IF sy-subrc <> 0.
*   ohne Protokoll kein Versand - Nachweispflicht gegenueber BNetzA
    MESSAGE a020.
  ENDIF.

* Zaehlpunkte mit am Stichtag gueltiger Empfaengerzuordnung
  SELECT t~int_ui, t~ext_ui, h~uistrutyp, m~receiver_id AS receiver
    FROM euitrans AS t
    INNER JOIN euihead AS h ON h~int_ui = t~int_ui
    INNER JOIN zisu_edm_mpo AS m ON m~int_ui = t~int_ui
    WHERE t~int_ui   IN @s_intui
      AND t~datefrom <= @p_date
      AND t~dateto   >= @p_date
      AND m~datefrom <= @p_date
      AND m~dateto   >= @p_date
    INTO CORRESPONDING FIELDS OF TABLE @gt_pod.
  IF gt_pod IS INITIAL.
    MESSAGE s010 WITH p_date.
    STOP.
  ENDIF.

  PERFORM select_profiles.

* Je Zaehlpunkt ein Lastgang = eine Nachricht
  LOOP AT gt_prof INTO DATA(ls_prof)
       GROUP BY ls_prof-int_ui INTO DATA(lg_pod).

    READ TABLE gt_pod INTO DATA(ls_pod) WITH KEY int_ui = lg_pod.
    CHECK sy-subrc = 0.

    DATA(lt_values) = VALUE zisu_edm_prof_tt( FOR m IN GROUP lg_pod ( m ) ).

*   Vollstaendigkeit: 96 Viertelstunden je Tag
*   TODO Zeitumstellung (92/100 Werte) - offen seit 2018
    gv_cnt = lines( lt_values ).
    IF gv_cnt < 96.
      gv_skipped = gv_skipped + 1.
      log_msg 'W' '011' ls_pod-ext_ui gv_cnt.
      PERFORM write_status USING ls_pod 'L' 0 0.
      CONTINUE.
    ENDIF.

    TRY.
        DATA(lo_payload) = NEW zcl_isu_edm_payload( ).
        DATA(lv_body) = lo_payload->build( iv_format = p_mode
                                           is_pod    = ls_pod
                                           it_values = lt_values ).
      CATCH zcx_isu_edm INTO DATA(lx_edm).
        gv_failed = gv_failed + 1.
        gv_text = lx_edm->get_text( ).
        log_msg 'E' '012' ls_pod-ext_ui gv_text.
        PERFORM write_status USING ls_pod 'E' 0 0.
        CONTINUE.
    ENDTRY.

    IF p_test = 'X'.
      gv_len = lo_payload->mv_last_size.
      WRITE: / ls_pod-ext_ui, gv_len, 'Testlauf - nicht gesendet'(t01).
      CONTINUE.
    ENDIF.

    PERFORM send_payload USING    lv_body lo_payload->mv_content_type
                         CHANGING gv_http gv_tries.
    IF gv_http BETWEEN 200 AND 299.
      gv_sent   = gv_sent + 1.
      gv_status = 'S'.
    ELSE.
      gv_failed = gv_failed + 1.
      gv_status = 'F'.
      log_msg 'E' '013' ls_pod-ext_ui gv_http.
    ENDIF.
    PERFORM write_status USING ls_pod gv_status gv_http gv_tries.
*   je Zaehlpunkt festschreiben - ein Abbruch soll Gesendetes nicht verlieren
    COMMIT WORK.
  ENDLOOP.

END-OF-SELECTION.
  APPEND gv_log TO gt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle   = gt_handle
    IMPORTING
      e_new_lognumbers = gt_lognum
    EXCEPTIONS
      log_not_found    = 1
      save_not_allowed = 2
      numbering_error  = 3
      OTHERS           = 4.
  READ TABLE gt_lognum INTO DATA(ls_lognum) INDEX 1.
  gv_lognumber = ls_lognum-lognumber.

  IF p_test IS INITIAL.
*   Folgejob ZISU_EDM_RECON wartet auf dieses Ereignis (Stichtag als Parameter)
    gv_evtparm = p_date.
    CALL FUNCTION 'BP_EVENT_RAISE'
      EXPORTING
        eventid                = 'ZISU_EDM_EXPORT_DONE'
        eventparm              = gv_evtparm
      EXCEPTIONS
        bad_eventid            = 1
        eventid_does_not_exist = 2
        eventid_missing        = 3
        raise_failed           = 4
        OTHERS                 = 5.
*   IF sy-subrc <> 0.
*     MESSAGE s014 WITH sy-subrc DISPLAY LIKE 'W'.
*   ENDIF.
  ENDIF.
  WRITE: / 'Gesendet:'(t02),     gv_sent,
         / 'Fehlerhaft:'(t03),   gv_failed,
         / 'Lueckenhaft:'(t04),  gv_skipped,
         / 'Statussaetze:'(t05), gv_stat_upd,
         / 'Protokoll:'(t06),    gv_lognumber, gv_msgcnt, 'Meldungen'(t07).
