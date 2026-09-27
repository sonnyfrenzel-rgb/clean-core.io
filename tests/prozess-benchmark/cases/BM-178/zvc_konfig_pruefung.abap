REPORT zvc_konfig_pruefung MESSAGE-ID zvc LINE-SIZE 160.
*----------------------------------------------------------------------*
* Nachpruefung konfigurierter Kabelauftraege
*----------------------------------------------------------------------*
* Nach Aenderung der Trommel-/Kabeltypstammdaten muessen offene Auftraege
* gegen die aktuelle Ableitung geprueft werden (Beziehungswissen laeuft
* erst beim naechsten Oeffnen der Konfiguration).
* Abweichende Auftraege werden gelistet und optional mit Liefersperre
* belegt, damit der Innendienst die Konfiguration neu aufruft.
*----------------------------------------------------------------------*
* 2017 Ersterstellung nach Reklamation Trommelgroesse (8D-Bericht 17/044)
*----------------------------------------------------------------------*

INCLUDE zvc_konfig_pruefung_top.
INCLUDE zvc_konfig_pruefung_f01.

AT SELECTION-SCREEN.
  IF p_sperr = abap_true.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' DUMMY
      ID 'VTWEG' DUMMY
      ID 'SPART' DUMMY
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      MESSAGE e010.                "keine Aenderungsberechtigung Auftraege
    ENDIF.
  ENDIF.

START-OF-SELECTION.
  PERFORM positionen_lesen.
  IF gt_pos IS INITIAL.
    MESSAGE s001.
    RETURN.
  ENDIF.

  LOOP AT gt_pos INTO DATA(ls_pos).
    PERFORM position_pruefen USING ls_pos.
  ENDLOOP.

  IF p_sperr = abap_true.
    PERFORM sperren.
  ENDIF.

END-OF-SELECTION.
  PERFORM ausgabe.
