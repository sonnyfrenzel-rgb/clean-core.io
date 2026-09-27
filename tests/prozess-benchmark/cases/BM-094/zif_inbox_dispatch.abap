*&---------------------------------------------------------------------*
*& Report ZIF_INBOX_DISPATCH
*&---------------------------------------------------------------------*
*& Generischer Eingangsverteiler für Schnittstellennachrichten
*& (Inbox-Tabelle ZIF_INBOX, Routing in ZIF_ROUTING).
*& Routingarten: F = Funktionsbaustein, P = FORM in Programm,
*&               S = Report per SUBMIT
*& Einplanung: alle 5 Minuten, bis zu 3 Jobs parallel (Sperre je Satz)
*&---------------------------------------------------------------------*
*& 2011-06  AS  Erstellung
*& 2012-01  AS  Wiederholungslogik (Status R)
*& 2015-09  MF  Anwendungslog statt Spoolliste
*&---------------------------------------------------------------------*
REPORT zif_inbox_dispatch.

TABLES zif_inbox.

DATA: gt_route TYPE SORTED TABLE OF zif_routing WITH UNIQUE KEY mestyp,
      gt_inbox TYPE STANDARD TABLE OF zif_inbox,
      gs_inbox TYPE zif_inbox,
      gv_rc    TYPE sy-subrc,
      gv_msg   TYPE bapi_msg,
      gv_log   TYPE balloghndl,
      gs_logh  TYPE bal_s_log,
      gt_logh  TYPE bal_t_logh.

SELECT-OPTIONS s_mestyp FOR zif_inbox-mestyp.
PARAMETERS: p_max   TYPE i DEFAULT 500,
            p_retry TYPE i DEFAULT 3.

INCLUDE zif_inbox_dispatch_f01.

START-OF-SELECTION.
  SELECT * FROM zif_routing INTO TABLE gt_route
    WHERE active = 'X'.

  SELECT * FROM zif_inbox INTO TABLE gt_inbox
    UP TO p_max ROWS
    WHERE mestyp IN s_mestyp
      AND ( status = 'N' OR ( status = 'R' AND retry < p_retry ) )
    ORDER BY created.
  IF gt_inbox IS INITIAL.
    MESSAGE s100(zif).
    RETURN.
  ENDIF.

  gs_logh-object     = 'ZIF'.
  gs_logh-subobject  = 'DISPATCH'.
  gs_logh-extnumber  = sy-repid.
  gs_logh-aldate_del = sy-datum + 30.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = gs_logh
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.

  LOOP AT gt_inbox INTO gs_inbox.
*   parallel laufende Jobs: Satz überspringen, wenn gesperrt
    CALL FUNCTION 'ENQUEUE_EZIF_INBOX'
      EXPORTING
        msgid          = gs_inbox-msgid
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

    CLEAR: gv_rc, gv_msg.
    PERFORM dispatch USING gs_inbox CHANGING gv_rc gv_msg.
    PERFORM finish USING gs_inbox gv_rc gv_msg.

    CALL FUNCTION 'DEQUEUE_EZIF_INBOX'
      EXPORTING
        msgid = gs_inbox-msgid.
  ENDLOOP.

  INSERT gv_log INTO TABLE gt_logh.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = gt_logh
    EXCEPTIONS
      OTHERS         = 1.
  COMMIT WORK.
