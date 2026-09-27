REPORT zpp_rueckstand_fauf.
* Rueckstandsliste Fertigungsauftraege je Werk - angelegt 2009 (MK)
* 2014-03 TR: nur Auftraege ohne Endlieferkennzeichen
TABLES afko.
PARAMETERS p_werks TYPE werks_d OBLIGATORY.
SELECT-OPTIONS s_dispo FOR afko-dispo.

TYPES: BEGIN OF ty_auf,
         aufnr TYPE aufnr,
         matnr TYPE matnr,
         gltrp TYPE co_gltrp,
         psmng TYPE co_psmng,
         wemng TYPE co_wemng,
       END OF ty_auf.
DATA: lt_auf  TYPE STANDARD TABLE OF ty_auf,
      ls_auf  TYPE ty_auf,
      lv_rest TYPE co_psmng.

START-OF-SELECTION.
  SELECT k~aufnr p~matnr k~gltrp p~psmng p~wemng
    INTO TABLE lt_auf
    FROM afko AS k INNER JOIN afpo AS p ON p~aufnr = k~aufnr
    WHERE p~pwerk = p_werks
      AND k~dispo IN s_dispo
      AND k~gltrp < sy-datum
      AND p~elikz = space
      AND p~wemng < p~psmng.
  IF sy-subrc <> 0.
    MESSAGE 'Kein Rueckstand im Werk' TYPE 'S'.
    EXIT.
  ENDIF.
*  SORT lt_auf BY matnr.
  SORT lt_auf BY gltrp.
  LOOP AT lt_auf INTO ls_auf.
    lv_rest = ls_auf-psmng - ls_auf-wemng.
    WRITE: / ls_auf-aufnr, ls_auf-matnr, ls_auf-gltrp, lv_rest.
  ENDLOOP.
