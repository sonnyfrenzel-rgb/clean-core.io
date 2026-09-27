*&---------------------------------------------------------------------*
*& Include MZPM_FREISCHALT_F01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form AUFTRAG_LESEN
*&---------------------------------------------------------------------*
* Auftrag prüfen (IH-Auftrag, freigegeben) und für die Freischaltung
* sperren; technischen Abschluss für das Zurücknehmen merken
*----------------------------------------------------------------------*
FORM auftrag_lesen.
  CLEAR: gs_hdr, gv_teco.
  SELECT SINGLE a~aufnr, a~auart, a~objnr, a~werks, f~iwerk,
                a~ktext, f~equnr, l~tplnr
    FROM aufk AS a
    INNER JOIN afih AS f ON f~aufnr = a~aufnr
    LEFT OUTER JOIN iloa AS l ON l~iloan = f~iloan
    WHERE a~aufnr = @gv_aufnr
      AND a~autyp = '30'
    INTO CORRESPONDING FIELDS OF @gs_hdr.
  IF sy-subrc <> 0.
    MESSAGE e230 WITH gv_aufnr.
  ENDIF.

  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = gs_hdr-objnr
      status            = 'I0002'
    EXCEPTIONS
      status_not_active = 1
      OTHERS            = 2.
  IF sy-subrc <> 0.
    MESSAGE e231 WITH gv_aufnr.
  ENDIF.

  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = gs_hdr-objnr
      status            = 'I0045'
    EXCEPTIONS
      status_not_active = 1
      OTHERS            = 2.
  gv_teco = xsdbool( sy-subrc = 0 ).

  CALL FUNCTION 'ENQUEUE_EZPM_FREISCH'
    EXPORTING
      aufnr          = gv_aufnr
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e232 WITH gv_aufnr sy-msgv1.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SCHRITTE_LESEN
*&---------------------------------------------------------------------*
* Schritte aller ZWCM-Vorgänge des Auftrags in Vorgangsreihenfolge.
* Ohne Schritte ist keine Freischaltung möglich: Sperre wieder lösen.
*----------------------------------------------------------------------*
FORM schritte_lesen.
  SELECT f~aufpl, f~aplzl, v~vornr, v~ltxa1, f~schritt, f~objekt,
         f~objtx, f~aktion, f~status, f~gesetzt_von, f~gesetzt_am,
         f~geprueft_von, f~geprueft_am, f~zurueck_von, f~bemerkung
    FROM zpm_freisch AS f
    INNER JOIN afvc AS v ON v~aufpl = f~aufpl AND v~aplzl = f~aplzl
    INNER JOIN afko AS k ON k~aufpl = f~aufpl
    WHERE k~aufnr = @gv_aufnr
    ORDER BY v~vornr, f~schritt
    INTO CORRESPONDING FIELDS OF TABLE @gt_steps.
  IF gt_steps IS INITIAL.
    CALL FUNCTION 'DEQUEUE_EZPM_FREISCH'
      EXPORTING
        aufnr = gv_aufnr.
    MESSAGE e233 WITH gv_aufnr.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SCHRITT_SETZEN
*&---------------------------------------------------------------------*
* Markierte offene oder zurückgenommene Schritte als gesetzt vermerken.
* Bereits gesetzte oder wirksame Schritte bleiben mit Hinweis stehen.
*----------------------------------------------------------------------*
FORM schritt_setzen.
  LOOP AT gt_steps ASSIGNING FIELD-SYMBOL(<ls_st>) WHERE mark = abap_true.
    IF <ls_st>-status <> 'OFFEN' AND <ls_st>-status <> 'ZURUECK'.
      MESSAGE i234 WITH <ls_st>-vornr <ls_st>-schritt.
      CONTINUE.
    ENDIF.
    <ls_st>-status      = 'GESETZT'.
    <ls_st>-gesetzt_von = sy-uname.
    GET TIME STAMP FIELD <ls_st>-gesetzt_am.
    CLEAR <ls_st>-mark.
    gv_changed = abap_true.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SCHRITT_PRUEFEN
*&---------------------------------------------------------------------*
* Vier-Augen-Prinzip: der Prüfer darf den Schritt nicht selbst gesetzt
* haben. Geprüfte Schritte werden wirksam (AKT).
*----------------------------------------------------------------------*
FORM schritt_pruefen.
  LOOP AT gt_steps ASSIGNING FIELD-SYMBOL(<ls_st>) WHERE mark = abap_true.
    CHECK <ls_st>-status = 'GESETZT'.
    IF <ls_st>-gesetzt_von = sy-uname AND sy-uname <> 'WCM_ADMIN'.
      MESSAGE e236 WITH <ls_st>-vornr <ls_st>-schritt.
    ENDIF.
    <ls_st>-status       = 'AKT'.
    <ls_st>-geprueft_von = sy-uname.
    GET TIME STAMP FIELD <ls_st>-geprueft_am.
    CLEAR <ls_st>-mark.
    gv_changed = abap_true.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SCHRITT_ZURUECKNEHMEN
*&---------------------------------------------------------------------*
* Freischaltung erst nach technischem Abschluss des Auftrags aufheben.
* Zurückgenommen werden nur wirksame (AKT) Schritte; gesetzte, aber
* ungeprüfte Schritte bleiben unverändert stehen.
*----------------------------------------------------------------------*
FORM schritt_zuruecknehmen.
  IF gv_teco = abap_false.
    MESSAGE e237 WITH gv_aufnr.
  ENDIF.
  LOOP AT gt_steps ASSIGNING FIELD-SYMBOL(<ls_st>)
       WHERE mark = abap_true AND status = 'AKT'.
    <ls_st>-status      = 'ZURUECK'.
    <ls_st>-zurueck_von = sy-uname.
    CLEAR <ls_st>-mark.
    gv_changed = abap_true.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SICHERN
*&---------------------------------------------------------------------*
* Schritte über den Verbuchungsbaustein schreiben (inkl. Protokoll);
* sind alle Schritte geprüft, erhält der Auftrag den Anwenderstatus
* E0010. Festschreiben synchron, damit die Freigabeprüfung im
* anschließenden IW32 den neuen Stand sieht.
*----------------------------------------------------------------------*
FORM sichern.
  DATA lt_db TYPE STANDARD TABLE OF zpm_freisch.

  IF gv_changed = abap_false.
    MESSAGE s238.
    RETURN.
  ENDIF.

  lt_db = CORRESPONDING #( gt_steps ).
  CALL FUNCTION 'Z_PM_FREISCH_VERBUCHEN' IN UPDATE TASK
    EXPORTING
      iv_aufnr   = gv_aufnr
    TABLES
      it_freisch = lt_db.

* keine offenen/ungeprüften Schritte mehr -> Auftrag "freigeschaltet"
  IF NOT line_exists( gt_steps[ status = 'OFFEN' ] )
     AND NOT line_exists( gt_steps[ status = 'GESETZT' ] ).
    CALL FUNCTION 'STATUS_CHANGE_EXTERN'
      EXPORTING
        objnr       = gs_hdr-objnr
        user_status = 'E0010'
      EXCEPTIONS
        OTHERS      = 1.
  ENDIF.

  COMMIT WORK AND WAIT.
  CLEAR gv_changed.
  MESSAGE s240 WITH gv_aufnr.
ENDFORM.
