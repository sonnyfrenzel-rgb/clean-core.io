REPORT zbd_cp_backlog.
* Überwachung: offene Änderungszeiger je Nachrichtentyp
* 2014-03 MK: Schwelle als Parameter statt fix 10000
PARAMETERS: p_mestyp TYPE edi_mestyp DEFAULT 'ZMATMAS',
            p_limit  TYPE i DEFAULT 5000.
DATA lv_count TYPE i.

START-OF-SELECTION.
  SELECT COUNT(*) FROM bdcp2 INTO lv_count
    WHERE mestype = p_mestyp
      AND process = space.
  IF lv_count = 0.
    WRITE: / 'Keine offenen Änderungszeiger für', p_mestyp.
    RETURN.
  ENDIF.
  IF lv_count > p_limit.
*   Jobabbruch -> Alarm in der Jobüberwachung
    MESSAGE e398(00) WITH 'Rückstau' p_mestyp lv_count 'Änderungszeiger'.
  ENDIF.
  WRITE: / p_mestyp, lv_count, 'offene Änderungszeiger'.
