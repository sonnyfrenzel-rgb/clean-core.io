REPORT zqm_auto_ve.
*&---------------------------------------------------------------------*
*& Automatischer Verwendungsentscheid fuer fehlerfreie Prueflose
*& Einplanung: Job ZQM_AUTO_VE, stuendlich, Variante je Werk
*& Nur Lose, bei denen alle Merkmale bewertet und keines
*& zurueckgewiesen ist. Rest bleibt fuer den Pruefer liegen.
*&---------------------------------------------------------------------*
TABLES qals.
PARAMETERS: p_werk  TYPE werks_d OBLIGATORY,
            p_vcode TYPE qvcode DEFAULT 'A1'.
SELECT-OPTIONS: s_art   FOR qals-art DEFAULT '04',
                s_datum FOR qals-enstehdat.

TYPES: BEGIN OF ty_log,
         prueflos TYPE qplos,
         matnr    TYPE matnr,
         charg    TYPE charg_d,
         ergebnis TYPE c LENGTH 60,
       END OF ty_log.

DATA: gt_lose   TYPE STANDARD TABLE OF qals,
      gs_los    TYPE qals,
      gt_log    TYPE STANDARD TABLE OF ty_log,
      gs_log    TYPE ty_log,
      gv_vcode  TYPE qvcode,
      gv_rej    TYPE i,
      gv_plan   TYPE i,
      gv_bew    TYPE i,
      gs_ud     TYPE bapi2045ud,
      gs_ret    TYPE bapireturn1,
      go_alv    TYPE REF TO cl_salv_table.

START-OF-SELECTION.
  SELECT * FROM qals INTO TABLE gt_lose
    WHERE werk      = p_werk
      AND art       IN s_art
      AND enstehdat IN s_datum
      AND stat35    = space.
  IF gt_lose IS INITIAL.
    MESSAGE 'Keine offenen Prueflose' TYPE 'S'.
    RETURN.
  ENDIF.

  LOOP AT gt_lose INTO gs_los.
    CLEAR gs_log.
    gs_log-prueflos = gs_los-prueflos.
    gs_log-matnr    = gs_los-matnr.
    gs_log-charg    = gs_los-charg.

*   Entscheid schon vorhanden (z.B. manuell parallel)?
    SELECT SINGLE vcode FROM qave INTO gv_vcode
      WHERE prueflos = gs_los-prueflos
        AND kzart    = 'L'.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.

    SELECT COUNT(*) FROM qamr INTO gv_rej
      WHERE prueflos = gs_los-prueflos
        AND mbewertg = 'R'.
    IF gv_rej > 0.
      gs_log-ergebnis = 'Merkmal zurueckgewiesen - manueller VE'.
      APPEND gs_log TO gt_log.
      CONTINUE.
    ENDIF.

    SELECT COUNT(*) FROM qamv INTO gv_plan
      WHERE prueflos = gs_los-prueflos.
    SELECT COUNT(*) FROM qamr INTO gv_bew
      WHERE prueflos = gs_los-prueflos
        AND mbewertg <> space.
    IF gv_bew < gv_plan.
      gs_log-ergebnis = 'Offene Merkmale - kein VE'.
      APPEND gs_log TO gt_log.
      CONTINUE.
    ENDIF.

    CLEAR: gs_ud, gs_ret.
    gs_ud-ud_selected_set     = 'ZFREI'.
    gs_ud-ud_plant            = p_werk.
    gs_ud-ud_code_group       = 'ZFREI'.
    gs_ud-ud_code             = p_vcode.
    gs_ud-ud_recorded_by_user = sy-uname.
    gs_ud-ud_force_completion = 'X'.

    CALL FUNCTION 'BAPI_INSPLOT_SETUSAGEDECISION'
      EXPORTING
        number   = gs_los-prueflos
        ud_data  = gs_ud
        language = sy-langu
      IMPORTING
        return   = gs_ret.

    IF gs_ret-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      gs_log-ergebnis = gs_ret-message.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      gs_log-ergebnis = 'VE gesetzt'.
    ENDIF.
    APPEND gs_log TO gt_log.
  ENDLOOP.

  cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                          CHANGING  t_table      = gt_log ).
  go_alv->display( ).
