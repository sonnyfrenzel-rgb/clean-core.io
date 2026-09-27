FUNCTION z_fm_mvb_verbuchen.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_KOPF) TYPE  ZFM_MVB_KOPF
*"     VALUE(IV_MODUS) TYPE  CHAR1
*"----------------------------------------------------------------------
* Schreibt den Antrag auf Mittelvormerkung (I = neu, U = Entscheidung)
* und einen Protokollsatz je Statuswechsel.
* Aufruf nur IN UPDATE TASK aus SAPMZFM_MVB (Formen ANTRAG_SICHERN und
* ENTSCHEIDEN). Ein Fehler beim Schreiben bricht die Verbuchung ab (A),
* der auslösende Benutzer erhält dann eine Express-Meldung.
* 2017 KOM  Ersterstellung
* 2019 KOM  Protokoll ZFM_MVB_LOG
*----------------------------------------------------------------------
  CASE iv_modus.
    WHEN 'I'.
      INSERT zfm_mvb_kopf FROM is_kopf.
    WHEN 'U'.
      UPDATE zfm_mvb_kopf FROM is_kopf.
  ENDCASE.
  IF sy-subrc <> 0.
    MESSAGE a033 WITH is_kopf-antrag iv_modus.
  ENDIF.

  INSERT zfm_mvb_log FROM @( VALUE zfm_mvb_log( antrag = is_kopf-antrag
                                                datum  = sy-datum
                                                zeit   = sy-uzeit
                                                status = is_kopf-status
                                                uname  = sy-uname ) ).
ENDFUNCTION.
