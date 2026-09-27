REPORT zco_kostl_sperren.
*----------------------------------------------------------------------*
* Kostenstellen fuer Ist-Primaerkosten sperren (Jahresabschluss)
* 11/2011 MKR  Erstellung
* 03/2014 JHO  Testlauf ergaenzt, Berechtigungspruefung K_CSKS
*----------------------------------------------------------------------*
TABLES: csks.

PARAMETERS:     p_kokrs TYPE kokrs OBLIGATORY DEFAULT '1000'.
SELECT-OPTIONS: s_kostl FOR csks-kostl.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_ks,
         kokrs TYPE kokrs,
         kostl TYPE kostl,
         datbi TYPE datbi,
         bkzkp TYPE bkzkp,
       END OF ty_ks.

DATA: gt_ks   TYPE STANDARD TABLE OF ty_ks,
      gs_ks   TYPE ty_ks,
      gv_cnt  TYPE i,
      gv_skip TYPE i.

START-OF-SELECTION.
  SELECT kokrs kostl datbi bkzkp
    FROM csks
    INTO TABLE gt_ks
    WHERE kokrs = p_kokrs
      AND kostl IN s_kostl
      AND datbi >= sy-datum.
  IF gt_ks IS INITIAL.
    MESSAGE e011(zco) WITH p_kokrs.
  ENDIF.

  LOOP AT gt_ks INTO gs_ks.
*   bereits gesperrt -> ueberspringen
    IF gs_ks-bkzkp = 'X'.
      ADD 1 TO gv_skip.
      CONTINUE.
    ENDIF.

    AUTHORITY-CHECK OBJECT 'K_CSKS'
      ID 'KOKRS' FIELD gs_ks-kokrs
      ID 'KOSTL' FIELD gs_ks-kostl
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      PERFORM protokoll USING gs_ks-kostl 'Keine Berechtigung'.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      PERFORM protokoll USING gs_ks-kostl 'Testlauf - wuerde gesperrt'.
    ELSE.
*     direkt in die Stammdatentabelle - KS02 per BDC war zu langsam
      UPDATE csks SET bkzkp = 'X'
        WHERE kokrs = gs_ks-kokrs
          AND kostl = gs_ks-kostl
          AND datbi = gs_ks-datbi.
      ADD 1 TO gv_cnt.
    ENDIF.
  ENDLOOP.

  COMMIT WORK.
  MESSAGE s012(zco) WITH gv_cnt gv_skip.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL
*&---------------------------------------------------------------------*
FORM protokoll USING pv_kostl TYPE kostl
                     pv_text  TYPE c.
  WRITE: / pv_kostl, pv_text.
ENDFORM.
