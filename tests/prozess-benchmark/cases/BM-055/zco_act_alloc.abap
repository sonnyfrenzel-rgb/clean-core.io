REPORT zco_act_alloc.
*----------------------------------------------------------------------*
* Leistungsverrechnung aus Zeiterfassung (ZCO_TIMESHEET) - Monatsjob
* Job ZCO_ACT_ALLOC_MONAT, Variante je Kostenrechnungskreis
*----------------------------------------------------------------------*
PARAMETERS: p_kokrs TYPE kokrs DEFAULT '1000' OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_perio TYPE co_perio OBLIGATORY,
            p_budat TYPE budat OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: go_alloc TYPE REF TO zcl_co_act_alloc,
      gt_log   TYPE zcl_co_act_alloc=>tt_log,
      gs_log   TYPE zcl_co_act_alloc=>ty_log.

START-OF-SELECTION.
  CREATE OBJECT go_alloc.
  gt_log = go_alloc->run( iv_kokrs = p_kokrs
                          iv_gjahr = p_gjahr
                          iv_perio = p_perio
                          iv_budat = p_budat
                          iv_test  = p_test ).

  LOOP AT gt_log INTO gs_log.
    WRITE: / gs_log-sender, gs_log-lstar, gs_log-receiver,
             gs_log-menge, gs_log-status, gs_log-text.
  ENDLOOP.
