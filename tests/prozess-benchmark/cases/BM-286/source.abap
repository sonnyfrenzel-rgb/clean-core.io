*&---------------------------------------------------------------------*
*&  Include           MZQM_MESSWERTEI01
*&---------------------------------------------------------------------*
*  Messwerterfassung Endkontrolle (Dynpro 0300, Table Control
*  TC_ERGEBNIS). Ablauflogik PAI:
*    LOOP AT gt_erg.
*      CHAIN. FIELD: gs_erg-istwert, gs_erg-mark.
*        MODULE tc_ergebnis_modify ON CHAIN-REQUEST.
*      ENDCHAIN.
*    ENDLOOP.
*    MODULE user_command_0300.
*----------------------------------------------------------------------*

*----------------------------------------------------------------------*
*  MODULE tc_ergebnis_modify INPUT  - je geaenderter Zeile
*----------------------------------------------------------------------*
MODULE tc_ergebnis_modify INPUT.

* Bewertung aus Toleranz ableiten: A = angenommen, R = zurueckgewiesen
  IF gs_erg-istwert > gs_erg-otol OR gs_erg-istwert < gs_erg-utol.
    gs_erg-bewertung = 'R'.
  ELSE.
    gs_erg-bewertung = 'A'.
  ENDIF.
  gs_erg-erfasst_von = sy-uname.
  MODIFY gt_erg FROM gs_erg INDEX tc_ergebnis-current_line.
  gv_changed = abap_true.

ENDMODULE.                 " TC_ERGEBNIS_MODIFY  INPUT

*----------------------------------------------------------------------*
*  MODULE user_command_0300 INPUT
*----------------------------------------------------------------------*
MODULE user_command_0300 INPUT.

  DATA: lv_lines_before TYPE i,
        lv_deleted      TYPE i.

  CASE ok_code.
    WHEN 'BACK' OR 'CANC'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0.

    WHEN 'DELE'.
*     markierte Messwerte verwerfen (nur im Puffer)
      CLEAR ok_code.
      lv_lines_before = lines( gt_erg ).
      DELETE gt_erg WHERE mark = abap_true.
      lv_deleted = lv_lines_before - lines( gt_erg ).
      MESSAGE s310(zqm) WITH lv_deleted.          "& Messwerte entfernt
      gv_changed = abap_true.

    WHEN 'SAVE'.
      CLEAR ok_code.
*     Messwerte des Loses komplett neu schreiben
      DELETE FROM zqm_messwert WHERE prueflos = gv_prueflos
                                 AND vornr    = gv_vornr.
      gt_db = CORRESPONDING #( gt_erg ).
      INSERT zqm_messwert FROM TABLE gt_db.
      IF sy-subrc <> 0.
        ROLLBACK WORK.
        MESSAGE e311(zqm) WITH gv_prueflos.        "Sichern fehlgeschlagen
      ENDIF.
      COMMIT WORK.
      CLEAR gv_changed.
      lv_lines_before = lines( gt_db ).
      MESSAGE s312(zqm) WITH gv_prueflos lv_lines_before.

*   WHEN 'UD'.  -> Verwendungsentscheid spaeter in QA11, nicht hier
    WHEN OTHERS.
*     Blaettern im Table Control macht das Standard-Coding (SCROLL)
  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0300  INPUT
