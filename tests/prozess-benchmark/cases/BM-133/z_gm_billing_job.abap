REPORT z_gm_billing_job.
*----------------------------------------------------------------------*
* PSM Grants Management: kostenbasierte Sponsorenabrechnung
* Monatsjob - erzeugt je Förderung eine Lastschriftanforderung (ZGMA)
* über die förderfähigen Ausgaben seit der letzten Abrechnung.
* 2020 GMT  (Ablösung der Excel-Abrechnung der Drittmittelstelle)
*----------------------------------------------------------------------*
TABLES gmgr.
SELECT-OPTIONS s_grant FOR gmgr-grant_nbr.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_bis   TYPE datum DEFAULT sy-datum,
            p_test  AS CHECKBOX DEFAULT 'X'.

START-OF-SELECTION.
  DATA(lo_bill) = NEW zcl_gm_sponsor_billing( iv_bukrs = p_bukrs
                                              iv_bis   = p_bis
                                              iv_test  = p_test ).
  TRY.
      DATA(lt_result) = lo_bill->run( it_grant = s_grant[] ).
    CATCH zcx_gm_billing INTO DATA(lx_err).
      MESSAGE lx_err TYPE 'E'.
  ENDTRY.

  LOOP AT lt_result INTO DATA(ls_res).
    WRITE: / ls_res-grant_nbr, ls_res-betrag, ls_res-vbeln, ls_res-text.
  ENDLOOP.
