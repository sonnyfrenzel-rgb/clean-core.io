REPORT zpp_plaf_umsetzen MESSAGE-ID zpp.
*&---------------------------------------------------------------------*
*& Planauftraege in Fertigungsauftraege umsetzen (Ersatz fuer CO41)
*& - nur Eigenfertigung, Lagerauftraege, Eckstart bis Horizont
*& - Material im Werk nicht gesperrt
*& - alle Komponenten im Werk ausreichend am Lager (einfache Pruefung)
*& - optional sofortige Freigabe
*& Job ZPP_PLAF_UMSETZEN_<Werk> taeglich 05:00
*&---------------------------------------------------------------------*
INCLUDE zpp_plaf_umsetzen_top.
INCLUDE zpp_plaf_umsetzen_f01.

AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'C_AFKO_AWK'
    ID 'WERKS'  FIELD p_werks
    ID 'AUFART' FIELD p_auart.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH p_werks p_auart.
  ENDIF.

START-OF-SELECTION.
  PERFORM lese_planauftraege.
  IF gt_plaf IS INITIAL.
    MESSAGE s011.
    RETURN.
  ENDIF.

  LOOP AT gt_plaf INTO gs_plaf.
    PERFORM pruefe_material USING gs_plaf CHANGING gv_ok.
    IF gv_ok = abap_false.
      CONTINUE.
    ENDIF.

    PERFORM pruefe_komponenten USING gs_plaf CHANGING gv_ok.
    IF gv_ok = abap_false.
      CONTINUE.
    ENDIF.

    PERFORM umsetzen USING gs_plaf.
  ENDLOOP.

END-OF-SELECTION.
  PERFORM ausgabe.
