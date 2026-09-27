REPORT zle_transport_abfertigen.
*----------------------------------------------------------------------*
* Transporte mit Status "Laden Ende" automatisch abfertigen
* Job ZLE_ABF alle 30 Minuten je Transportdispostelle
* 2017 PHO: Wiederholung bei Sperre durch Disponenten (VT02N offen)
*----------------------------------------------------------------------*
TABLES vttk.
SELECT-OPTIONS: s_tplst FOR vttk-tplst OBLIGATORY,
                s_shtyp FOR vttk-shtyp.
PARAMETERS      p_heute AS CHECKBOX DEFAULT 'X'.

DATA: lt_where TYPE STANDARD TABLE OF string,
      lt_tknum TYPE STANDARD TABLE OF vttk-tknum,
      ls_head  TYPE bapishipmentheader,
      ls_act   TYPE bapishipmentheaderaction,
      lt_ret   TYPE STANDARD TABLE OF bapiret2,
      lv_ok    TYPE i,
      lv_err   TYPE i.

START-OF-SELECTION.
  APPEND `tplst IN s_tplst AND shtyp IN s_shtyp` TO lt_where.
  APPEND `AND stlad = 'X' AND stabf = ' '` TO lt_where.
  IF p_heute = 'X'.
    APPEND `AND dalen = sy-datum` TO lt_where.
  ENDIF.

  SELECT tknum FROM vttk INTO TABLE lt_tknum
    WHERE (lt_where).
  IF lt_tknum IS INITIAL.
    WRITE: / 'Keine Transporte zum Abfertigen.'.
    RETURN.
  ENDIF.

  LOOP AT lt_tknum INTO DATA(lv_tknum).
    CLEAR: ls_head, ls_act.
    ls_head-shipment_num = lv_tknum.
    ls_head-status_compl = 'X'.
    ls_act-status_compl  = 'C'.
    DO 3 TIMES.
      CLEAR lt_ret.
      CALL FUNCTION 'BAPI_SHIPMENT_CHANGE'
        EXPORTING
          headerdata       = ls_head
          headerdataaction = ls_act
        TABLES
          return           = lt_ret.
      IF NOT line_exists( lt_ret[ type = 'E' ] ) AND NOT line_exists( lt_ret[ type = 'A' ] ).
        EXIT.
      ENDIF.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
*     Transport vom Disponenten gesperrt? kurz warten, nochmal
      IF line_exists( lt_ret[ id = 'VW' number = '022' ] ).
        WAIT UP TO 2 SECONDS.
      ELSE.
        EXIT.
      ENDIF.
    ENDDO.
    IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
      lv_err = lv_err + 1.
      WRITE: / lv_tknum, 'Fehler:', lt_ret[ type = 'E' ]-message.
      CONTINUE.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    lv_ok = lv_ok + 1.
  ENDLOOP.

END-OF-SELECTION.
  WRITE: / 'Abgefertigt:', lv_ok, 'Fehler:', lv_err.
  IF lv_err > 0.
    MESSAGE e004(zle) WITH lv_err.       "Job abbrechen -> Monitoring
  ENDIF.
