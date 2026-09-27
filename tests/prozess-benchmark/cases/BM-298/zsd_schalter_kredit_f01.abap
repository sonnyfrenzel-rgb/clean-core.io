*&---------------------------------------------------------------------*
*&  Include           ZSD_SCHALTER_KREDIT_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  QUITTUNG_DRUCKEN
*&---------------------------------------------------------------------*
*       Quittung fuer den Kunden auf dem Schalterdrucker (Report mit
*       Smartform, eigener Druckparameter-Dialog unterdrueckt)
*----------------------------------------------------------------------*
FORM quittung_drucken USING iv_vbeln  TYPE vbeln_va
                            iv_betrag TYPE netwr_ak.

  DATA lv_ldest TYPE rspopname.

  SELECT SINGLE ldest FROM zsd_schalter_dru INTO lv_ldest
    WHERE kasse = p_kasse.
  IF sy-subrc <> 0.
*   ohne Druckerzuordnung keine Quittung - nur Hinweis, Freigabe bleibt
    MESSAGE i610(zsd_kr) WITH p_kasse.
    RETURN.
  ENDIF.

  SUBMIT zsd_bar_quittung
    WITH p_vbeln  = iv_vbeln
    WITH p_betrag = iv_betrag
    WITH p_kunnr  = p_kunnr
    WITH p_ldest  = lv_ldest
    AND RETURN.

ENDFORM.
