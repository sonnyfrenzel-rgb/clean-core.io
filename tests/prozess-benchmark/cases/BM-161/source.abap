REPORT zisu_ablesung_verbrauch.
*----------------------------------------------------------------------*
* Ablesungen je Zaehler mit Verbrauch seit der Vorablesung
* 05.2009 Ersterstellung / 2014 JKL: nur plausibilisierte Ablesungen
*----------------------------------------------------------------------*
TABLES eabl.
SELECT-OPTIONS s_equnr FOR eabl-equnr.
SELECT-OPTIONS s_adat  FOR eabl-adat OBLIGATORY.
TYPES: BEGIN OF ty_abl,
         equnr     TYPE eabl-equnr,
         adat      TYPE eabl-adat,
         v_zwstand TYPE eabl-v_zwstand,
         ablstat   TYPE eabl-ablstat,
       END OF ty_abl.
DATA: gt_abl      TYPE STANDARD TABLE OF ty_abl,
      gs_abl      TYPE ty_abl,
      gv_vorstand TYPE eabl-v_zwstand,
      gv_verbr    TYPE eabl-v_zwstand.

START-OF-SELECTION.
  SELECT equnr adat v_zwstand ablstat
    FROM eabl
    INTO TABLE gt_abl
    WHERE equnr IN s_equnr
      AND adat  IN s_adat.
  SORT gt_abl BY equnr adat.
  LOOP AT gt_abl INTO gs_abl.
    AT NEW equnr.
      CLEAR gv_vorstand.
    ENDAT.
*   nur plausibilisierte Ablesungen (Status 1) - 2014 JKL
    CHECK gs_abl-ablstat = '1'.
    IF gv_vorstand IS NOT INITIAL.
      gv_verbr = gs_abl-v_zwstand - gv_vorstand.
      WRITE: / gs_abl-equnr, gs_abl-adat, gs_abl-v_zwstand, gv_verbr.
    ENDIF.
    gv_vorstand = gs_abl-v_zwstand.
  ENDLOOP.
