*&---------------------------------------------------------------------*
*& Report ZMM_STO_REPLENISH
*&---------------------------------------------------------------------*
*& Filialnachschub ueber Umlagerungsbestellungen (UB) aus dem Zentrallager
*& 1. Bedarf je Filialwerk/Material (Zielbestand = 2 x Sicherheitsbestand)
*& 2. UB je Filialwerk parallel in eigenen Tasks anlegen (aRFC)
*& 3. Auslieferung je UB anlegen und an das EWM des Zentrallagers melden
*&---------------------------------------------------------------------*
*& 2016-03 SLO  Ersterstellung
*& 2018-08 SLO  Parallelisierung (Laufzeit > 3h bei 140 Filialen)
*& 2021-10 TKR  EWM-Anbindung Zentrallager, Wiederholtabelle
*&---------------------------------------------------------------------*
REPORT zmm_sto_replenish.

INCLUDE zmm_sto_replenish_top.
INCLUDE zmm_sto_replenish_c01.
INCLUDE zmm_sto_replenish_f01.

START-OF-SELECTION.
  SELECT SINGLE rfcdest FROM zmm_ewm_dest INTO gv_ewm_dest
    WHERE lgnum = p_lgnum.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Keine RFC-Destination fuer Lagernummer' p_lgnum.
  ENDIF.

  gt_need = lcl_need_calculator=>calculate( it_werks  = s_werks[]
                                            iv_supply = p_supply ).
  IF gt_need IS INITIAL.
    MESSAGE s398(00) WITH 'Kein Nachschubbedarf'.
    RETURN.
  ENDIF.

  go_tasks = NEW lcl_task_manager( ).
  go_deliv = NEW lcl_delivery_creator( gv_ewm_dest ).
  SET HANDLER lcl_protocol=>on_delivery_created FOR go_deliv.

* je Filialwerk eine Umlagerungsbestellung, parallel
  LOOP AT gt_need INTO DATA(ls_need) GROUP BY ls_need-werks INTO DATA(lv_werks).
    gt_items = VALUE #( FOR n IN GROUP lv_werks ( matnr = n-matnr menge = n-menge meins = n-meins ) ).
    go_tasks->submit( iv_werks  = lv_werks
                      iv_supply = p_supply
                      it_items  = gt_items ).
  ENDLOOP.

  WAIT FOR ASYNCHRONOUS TASKS UNTIL go_tasks->mv_done >= go_tasks->mv_sent
       UP TO 600 SECONDS.
  IF sy-subrc <> 0.
    MESSAGE i398(00) WITH 'Zeitueberschreitung - nicht alle UB zurueckgemeldet'.
  ENDIF.

  LOOP AT go_tasks->mt_created INTO DATA(ls_sto).
    TRY.
        go_deliv->create_for_sto( ls_sto ).
      CATCH lcx_sto INTO gx_sto.
        WRITE: / ls_sto-ebeln, gx_sto->mv_text COLOR COL_NEGATIVE.
    ENDTRY.
  ENDLOOP.

  PERFORM write_summary.
