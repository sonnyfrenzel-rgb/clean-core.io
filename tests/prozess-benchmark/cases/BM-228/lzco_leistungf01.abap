*----------------------------------------------------------------------*
***INCLUDE LZCO_LEISTUNGF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  KOSTL_PRUEFEN
*&---------------------------------------------------------------------*
*       Sender und Empfaenger muessen zur Periode gueltig sein
*----------------------------------------------------------------------*
FORM kostl_pruefen USING    ps_leist TYPE gty_leist
                   CHANGING cv_ok    TYPE xfeld.
  DATA lv_cnt TYPE i.

  CLEAR cv_ok.
  SELECT COUNT(*) FROM csks INTO lv_cnt
    WHERE kokrs = ps_leist-kokrs
      AND kostl IN (ps_leist-skostl, ps_leist-ekostl)
      AND datbi >= sy-datum
      AND datab <= sy-datum.
  IF lv_cnt < 2.
    PERFORM return_add USING 'W' '030' ps_leist-lfdnr.
    RETURN.
  ENDIF.
  cv_ok = 'X'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LSTAR_PRUEFEN
*&---------------------------------------------------------------------*
FORM lstar_pruefen USING    ps_leist TYPE gty_leist
                   CHANGING cv_ok    TYPE xfeld.
  DATA lv_leinh TYPE leinh.

  CLEAR cv_ok.
  SELECT SINGLE leinh FROM csla INTO lv_leinh
    WHERE kokrs = ps_leist-kokrs
      AND lstar = ps_leist-lstar
      AND datbi >= sy-datum.
  IF sy-subrc <> 0.
    PERFORM return_add USING 'W' '031' ps_leist-lfdnr.
    RETURN.
  ENDIF.
* Mengeneinheit aus dem Ticketsystem muss passen - abgeschaltet,
* Ticketsystem liefert seit 2019 immer STD (Ticket 88213)
* IF lv_leinh <> ps_leist-meinh.
*   PERFORM return_add USING 'W' '032' ps_leist-lfdnr.
*   RETURN.
* ENDIF.
  cv_ok = 'X'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  RETURN_ADD
*&---------------------------------------------------------------------*
*       sammelt Meldungen fuer den Aufrufer (Job-Protokoll)
*----------------------------------------------------------------------*
FORM return_add USING pv_type TYPE bapi_mtype
                      pv_nr   TYPE symsgno
                      pv_v1   TYPE any.
  DATA ls_ret TYPE bapiret2.
  ls_ret-type       = pv_type.
  ls_ret-id         = 'ZCO_LV'.
  ls_ret-number     = pv_nr.
  ls_ret-message_v1 = pv_v1.
  APPEND ls_ret TO gt_return.
ENDFORM.
