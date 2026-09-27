REPORT zpy_netpay_deviation.
************************************************************************
* Plausibilitaetspruefung nach dem Abrechnungslauf (DE):
* Auszahlungsbetrag (Lohnart /559) der gewaehlten Periode gegen die
* Vorperiode. Abweichung ueber Schwelle -> Liste fuer Entgeltabrechnung
* 2013-11 HR-IT  LDB PNP -> PNPCE umgestellt
* 2019-01 HR-IT  REDUCE statt LOOP AT rt
************************************************************************
NODES: peras.
PARAMETERS: p_pabrj TYPE pabrj OBLIGATORY,
            p_pabrp TYPE pabrp OBLIGATORY,
            p_pct   TYPE p DECIMALS 1 DEFAULT '20.0'.
DATA: gt_rgdir  TYPE STANDARD TABLE OF pc261,
      gs_rgdir  TYPE pc261,
      gs_result TYPE pay99_result,
      gv_fpper  TYPE fpper,
      gv_curr   TYPE maxbt,
      gv_prev   TYPE maxbt,
      gv_dev    TYPE p DECIMALS 1,
      gv_molga  TYPE molga,
      gv_hits   TYPE i.

GET peras.
  CONCATENATE p_pabrj p_pabrp INTO gv_fpper.
  CLEAR: gv_curr, gv_prev, gt_rgdir.
  CALL FUNCTION 'CU_READ_RGDIR'
    EXPORTING
      persnr          = peras-pernr
    IMPORTING
      molga           = gv_molga
    TABLES
      in_rgdir        = gt_rgdir
    EXCEPTIONS
      no_record_found = 1
      OTHERS          = 2.
  IF sy-subrc <> 0.
    REJECT.
  ENDIF.

  SORT gt_rgdir BY fpend DESCENDING.
  LOOP AT gt_rgdir INTO gs_rgdir.
    CHECK gs_rgdir-srtza = 'A'.
    CALL FUNCTION 'PYXX_READ_PAYROLL_RESULT'
      EXPORTING
        clusterid      = 'RD'
        employeenumber = peras-pernr
        sequencenumber = gs_rgdir-seqnr
      CHANGING
        payroll_result = gs_result
      EXCEPTIONS
        OTHERS         = 1.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    IF gs_rgdir-fpper = gv_fpper.
      gv_curr = REDUCE maxbt( INIT s = 0
                              FOR wa IN gs_result-inter-rt
                              WHERE ( lgart = '/559' )
                              NEXT s = s + wa-betrg ).
    ELSEIF gs_rgdir-fpper < gv_fpper.
      gv_prev = REDUCE maxbt( INIT s = 0
                              FOR wa IN gs_result-inter-rt
                              WHERE ( lgart = '/559' )
                              NEXT s = s + wa-betrg ).
*     erste aeltere Periode reicht
      EXIT.
    ENDIF.
  ENDLOOP.

  CHECK gv_prev <> 0.
  gv_dev = abs( gv_curr - gv_prev ) * 100 / gv_prev.
  IF gv_dev > p_pct.
    gv_hits = gv_hits + 1.
    WRITE: / peras-pernr, gv_prev, gv_curr, gv_dev, '%'.
  ENDIF.

END-OF-SELECTION.
  IF gv_hits = 0.
    MESSAGE s398(00) WITH 'Keine Abweichung ueber' p_pct '%'.
  ENDIF.
