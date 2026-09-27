*----------------------------------------------------------------------*
***INCLUDE ZISU_EDM_EXPORT_F01.
*----------------------------------------------------------------------*
* Unterprogramme Lastgangübermittlung
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form SELECT_PROFILES - Viertelstundenwerte der offenen Zaehlpunkte
*&   1. bereits erfolgreich gesendete (Status S) aussortieren
*&   2. Profilwerte des Stichtags lesen
*&---------------------------------------------------------------------*
FORM select_profiles.
  DATA lt_stat TYPE STANDARD TABLE OF zisu_edm_stat.

  gt_open = gt_pod.
  SELECT * FROM zisu_edm_stat INTO TABLE lt_stat
    FOR ALL ENTRIES IN gt_pod
    WHERE int_ui  = gt_pod-int_ui
      AND ab_date = p_date
      AND status  = 'S'.
  LOOP AT lt_stat INTO DATA(ls_stat).
    DELETE gt_open WHERE int_ui = ls_stat-int_ui.
  ENDLOOP.

* TS 2021-03: nur noch offene Zaehlpunkte lesen (Performance)
  SELECT * FROM zisu_edm_prof INTO TABLE gt_prof
    FOR ALL ENTRIES IN gt_open
    WHERE int_ui  = gt_open-int_ui
      AND ab_date = p_date.
*  SELECT * FROM zisu_edm_prof INTO TABLE gt_prof
*    FOR ALL ENTRIES IN gt_pod
*    WHERE int_ui  = gt_pod-int_ui
*      AND ab_date = p_date.
  SORT gt_prof BY int_ui ab_date ab_time.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SEND_PAYLOAD - HTTP POST an Gateway, mit Wiederholung
*&   2xx  = angenommen
*&   4xx  = fachlich abgelehnt (Schema, unbekannte MaLo/MeLo) -> kein Retry
*&   sonst Retry mit Wartezeit 5 s, 10 s, 20 s ...
*&---------------------------------------------------------------------*
FORM send_payload USING    iv_body         TYPE string
                           iv_content_type TYPE string
                  CHANGING cv_http         TYPE i
                           cv_tries        TYPE i.
  DATA: lo_client TYPE REF TO if_http_client,
        lv_wait   TYPE i VALUE 5,
        lv_reason TYPE string.

  CLEAR: cv_http, cv_tries.

  cl_http_client=>create_by_destination(
    EXPORTING
      destination              = p_dest
    IMPORTING
      client                   = lo_client
    EXCEPTIONS
      argument_not_found       = 1
      destination_not_found    = 2
      destination_no_authority = 3
      plugin_not_active        = 4
      internal_error           = 5
      OTHERS                   = 6 ).
  IF sy-subrc <> 0.
*   Destination fehlt/gesperrt: Status F mit HTTP-Code 0, Protokoll im Aufrufer
    RETURN.
  ENDIF.

  lo_client->request->set_method( if_http_request=>co_request_method_post ).
  lo_client->request->set_content_type( iv_content_type ).
  lo_client->request->set_header_field( name  = 'X-EDM-Stichtag'
                                        value = |{ p_date DATE = ISO }| ).
  lo_client->request->set_cdata( iv_body ).

  DO p_maxtry TIMES.
    cv_tries = sy-index.
    lo_client->send(
      EXCEPTIONS
        http_communication_failure = 1
        http_invalid_state         = 2
        http_processing_failed     = 3
        http_invalid_timeout       = 4
        OTHERS                     = 5 ).
    lo_client->receive(
      EXCEPTIONS
        http_communication_failure = 1
        http_invalid_state         = 2
        http_processing_failed     = 3
        OTHERS                     = 4 ).
    IF sy-subrc = 0.
      lo_client->response->get_status( IMPORTING code   = cv_http
                                                 reason = lv_reason ).
    ELSE.
      cv_http = 0.
    ENDIF.

    IF cv_http BETWEEN 200 AND 299 OR cv_http BETWEEN 400 AND 499.
      EXIT.
    ENDIF.
    WAIT UP TO lv_wait SECONDS.
    lv_wait = lv_wait * 2.
  ENDDO.

  lo_client->close( ).

* alter FTP-Versand bis 11/2019
*  CALL FUNCTION 'FTP_CONNECT'
*    EXPORTING user = 'EDMUSER' password = lv_pwd host = 'ftp.msb-partner.de'
*    ...
ENDFORM.

*&---------------------------------------------------------------------*
*& Form WRITE_STATUS - Versandstatus je Zaehlpunkt und Stichtag
*&   S = gesendet, F = Versand fehlgeschlagen, E = Aufbereitung fehler-
*&   haft, L = Lastgang lueckenhaft
*&---------------------------------------------------------------------*
FORM write_status USING is_pod    TYPE zisu_s_edm_pod
                        iv_status TYPE char1
                        iv_http   TYPE i
                        iv_tries  TYPE i.
  DATA ls_stat TYPE zisu_edm_stat.

  CHECK p_test IS INITIAL.

  SELECT SINGLE * FROM zisu_edm_stat INTO ls_stat
    WHERE int_ui  = is_pod-int_ui
      AND ab_date = p_date.

  ls_stat-int_ui     = is_pod-int_ui.
  ls_stat-ab_date    = p_date.
  ls_stat-receiver   = is_pod-receiver.
  ls_stat-status     = iv_status.
  ls_stat-http_code  = iv_http.
  ls_stat-attempts   = ls_stat-attempts + iv_tries.
  ls_stat-changed_on = sy-datum.
  ls_stat-changed_at = sy-uzeit.
  ls_stat-changed_by = sy-uname.
  MODIFY zisu_edm_stat FROM ls_stat.
  gv_stat_upd = gv_stat_upd + 1.
ENDFORM.
