FUNCTION z_mm_po_budget_update.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"  IMPORTING
*"     VALUE(IV_EBELN) TYPE  EBELN
*"  TABLES
*"      IT_NEED TYPE  ZCL_MM_PO_RULES=>TT_NEED
*"----------------------------------------------------------------------
* Budgetverbrauch je Kostenstelle/Jahr fortschreiben + Historie
* ACHTUNG: bei Aenderung einer Bestellung wird der volle Wert erneut
*          addiert (bekannt, Ticket 2231 - Korrektur per Jahresabgleich)
  DATA: ls_need   TYPE zcl_mm_po_rules=>ty_need,
        ls_budget TYPE zmm_po_budget,
        ls_hist   TYPE zmm_po_budget_h.

  LOOP AT it_need INTO ls_need.
    SELECT SINGLE * FROM zmm_po_budget INTO ls_budget
      WHERE kostl = ls_need-kostl
        AND gjahr = ls_need-gjahr
      FOR UPDATE.
    IF sy-subrc <> 0.
      CONTINUE.                            "kein Budget gepflegt
    ENDIF.

    ls_budget-verbraucht = ls_budget-verbraucht + ls_need-netwr.
    ls_budget-aedat = sy-datum.
    ls_budget-aenam = sy-uname.
    UPDATE zmm_po_budget FROM ls_budget.
    IF sy-subrc <> 0.
      MESSAGE a131(zmm) WITH ls_need-kostl.
    ENDIF.

    CLEAR ls_hist.
    ls_hist-kostl = ls_need-kostl.
    ls_hist-gjahr = ls_need-gjahr.
    ls_hist-ebeln = iv_ebeln.
    ls_hist-netwr = ls_need-netwr.
    ls_hist-datum = sy-datum.
    ls_hist-uzeit = sy-uzeit.
    INSERT zmm_po_budget_h FROM ls_hist.
  ENDLOOP.

ENDFUNCTION.
