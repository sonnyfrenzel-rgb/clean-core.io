REPORT zehs_sdb_fehlend.
*----------------------------------------------------------------------*
* EHS: Stoffe ohne freigegebenes Sicherheitsdatenblatt je Sprache
* Schalter ZEHS_SDB_CHECK in STVARV (Einführung Werk 2000)
*----------------------------------------------------------------------*
TABLES estrh.
SELECT-OPTIONS s_subid FOR estrh-subid.
PARAMETERS p_langu TYPE sy-langu DEFAULT sy-langu.
DATA: lt_spec  TYPE STANDARD TABLE OF estrh,
      ls_spec  TYPE estrh,
      lv_aktiv TYPE tvarvc-low.

START-OF-SELECTION.
  SELECT SINGLE low FROM tvarvc INTO lv_aktiv
    WHERE name = 'ZEHS_SDB_CHECK' AND type = 'P' AND numb = '0000'.
  IF lv_aktiv <> 'X'.
    STOP.
  ENDIF.
  SELECT * FROM estrh AS s INTO TABLE lt_spec
    WHERE s~subid IN s_subid
      AND s~subcat = 'REAL_SUB'
      AND s~delflg = space
      AND NOT EXISTS ( SELECT * FROM cvddh AS d
                         WHERE d~subid = s~subid
                           AND d~langu = p_langu
                           AND d~vstat = 'RE' ).
  LOOP AT lt_spec INTO ls_spec.
    WRITE: / ls_spec-subid, ls_spec-recn, p_langu,
             'kein freigegebenes SDB'.
    IF 1 = 2.
      PERFORM sdb_anfordern USING ls_spec-subid.
    ENDIF.
  ENDLOOP.

FORM sdb_anfordern USING pv_subid TYPE estrh-subid.
  SUBMIT zehs_sdb_generate WITH p_subid = pv_subid AND RETURN.
ENDFORM.
