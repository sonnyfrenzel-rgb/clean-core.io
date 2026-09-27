*&---------------------------------------------------------------------*
*& Report  ZFI_ABGRENZUNG
*&
*& Periodenabgrenzungen aus ZFI_ABGRENZ als Abgrenzungsbelege (FBS1)
*& mit Stornodatum buchen. Fehlerhafte Buchungen optional in eine
*& Batch-Input-Mappe zur manuellen Nacharbeit.
*&---------------------------------------------------------------------*
*& 10/2007 HFE  Erstellung
*& 01/2010 HFE  Mappe fuer Fehlerfaelle
*& 06/2018 PMA  Modus als Parameter (vorher fest 'N')
*&---------------------------------------------------------------------*
REPORT zfi_abgrenzung MESSAGE-ID zfi_abg LINE-SIZE 132.

INCLUDE zfi_abgrenzung_top.
INCLUDE zfi_abgrenzung_sel.
INCLUDE zfi_abgrenzung_f01.

START-OF-SELECTION.
  PERFORM abgrenzungen_lesen.
  IF gt_abg IS INITIAL.
    MESSAGE s001 WITH p_bukrs.
    RETURN.
  ENDIF.

  LOOP AT gt_abg INTO gs_abg.
    PERFORM bdc_aufbauen USING gs_abg.
    PERFORM buchen USING gs_abg.
  ENDLOOP.

  IF gv_mappe_offen = 'X'.
    CALL FUNCTION 'BDC_CLOSE_GROUP'.
    MESSAGE i003 WITH p_group.
  ENDIF.

  SKIP.
  WRITE: / 'Gebucht:', gv_ok, 'Fehler:', gv_err.
