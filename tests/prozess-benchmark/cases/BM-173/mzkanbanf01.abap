*----------------------------------------------------------------------*
***INCLUDE MZKANBANF01 - Unterprogramme
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  BEHAELTER_LESEN
*&---------------------------------------------------------------------*
*       Behaelter und Regelkreis lesen, Versorgungsbereich und
*       Berechtigung pruefen. Fehler -> E-Meldung, Dynpro bleibt stehen
*----------------------------------------------------------------------*
FORM behaelter_lesen.
  SELECT SINGLE * FROM pkps INTO gs_pkps
    WHERE pkkey = gv_pkkey.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH gv_pkkey.              "Behaelter & unbekannt
  ENDIF.

  SELECT SINGLE * FROM pkhd INTO gs_pkhd
    WHERE pknum = gs_pkps-pknum.

  IF gs_pkhd-prvbe <> gv_prvbe AND gv_prvbe IS NOT INITIAL.
    MESSAGE e002 WITH gs_pkhd-prvbe gv_prvbe. "gehoert zu Versorgungsber. &
  ENDIF.

  AUTHORITY-CHECK OBJECT 'Z_KANBAN'
    ID 'WERKS' FIELD gs_pkhd-werks
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e003 WITH gs_pkhd-werks.         "keine Berechtigung Werk &
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LEERMELDEN
*&---------------------------------------------------------------------*
FORM leermelden.
  DATA ls_ret TYPE bapiret2.

  CASE gs_pkps-pkbst.
    WHEN gc_voll OR gc_inbenutz.
      CALL FUNCTION 'BAPI_KANBAN_CHANGESTATUS'
        EXPORTING
          kanbanidnumber = gs_pkps-pkkey
          nextstatus     = gc_leer
        IMPORTING
          return         = ls_ret.
      IF ls_ret-type CA 'EA'.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        MESSAGE e010 WITH ls_ret-message(50).
      ENDIF.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      gv_msg = 'Behaelter leer gemeldet'.

    WHEN gc_leer.
*     Doppelscan: Behaelter ist schon leer -> Eil-Nachschub anbieten
      CALL FUNCTION 'POPUP_TO_CONFIRM'
        EXPORTING
          titlebar       = 'Behaelter bereits leer'
          text_question  = 'Eil-Nachschub (Sonderkanban) ausloesen?'
          default_button = '2'
        IMPORTING
          answer         = gv_answer.
      IF gv_answer = '1'.
        PERFORM sonderkanban.
        gv_msg = 'Eil-Nachschub angefordert'.
      ELSE.
        gv_msg = 'Keine Aktion'.
      ENDIF.

    WHEN OTHERS.
      MESSAGE e011 WITH gs_pkps-pkbst.       "Status & erlaubt keine Leermeldung
  ENDCASE.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SONDERKANBAN
*&---------------------------------------------------------------------*
*       Eil-Nachschub in ZKANBAN_EIL, Leitstand holt ihn per Monitor ab
*       Schluessel PKNUM + ERDAT: hoechstens einer je Regelkreis und Tag
*----------------------------------------------------------------------*
FORM sonderkanban.
  DATA ls_eil TYPE zkanban_eil.

  ls_eil-pknum = gs_pkps-pknum.
  ls_eil-erdat = sy-datum.
  ls_eil-uzeit = sy-uzeit.
  ls_eil-matnr = gs_pkhd-matnr.
  ls_eil-werks = gs_pkhd-werks.
  ls_eil-prvbe = gs_pkhd-prvbe.
  ls_eil-ernam = sy-uname.
  INSERT zkanban_eil FROM ls_eil.
  IF sy-subrc <> 0.
    MESSAGE e012 WITH gs_pkps-pknum.         "Eil-Nachschub heute schon angefordert
  ENDIF.
  COMMIT WORK.
ENDFORM.
