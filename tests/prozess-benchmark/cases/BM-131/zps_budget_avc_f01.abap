*----------------------------------------------------------------------*
***INCLUDE ZPS_BUDGET_AVC_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form DATEN_LESEN - PSP-Elemente, Budget, Ist, Obligo
*&---------------------------------------------------------------------*
FORM daten_lesen.
  DATA: lt_cosp TYPE STANDARD TABLE OF cosp,
        lv_feld TYPE string.
  FIELD-SYMBOLS: <ls_erg>  TYPE ty_erg,
                 <ls_cosp> TYPE cosp,
                 <lv_wert> TYPE any.

  SELECT j~pspid p~posid p~objnr p~vernr
    FROM proj AS j INNER JOIN prps AS p ON p~psphi = j~pspnr
    INTO CORRESPONDING FIELDS OF TABLE gt_erg
    WHERE j~pspid IN s_pspid
      AND p~loevm = space.
  CHECK gt_erg IS NOT INITIAL.

* Istkosten Plan/Ist-Version 0
  SELECT * FROM cosp INTO TABLE lt_cosp
    FOR ALL ENTRIES IN gt_erg
    WHERE objnr = gt_erg-objnr
      AND gjahr = p_gjahr
      AND wrttp = '04'
      AND versn = '000'.

  LOOP AT gt_erg ASSIGNING <ls_erg>.
*   Jahresbudget: Ursprung + Nachtrag + Rückgabe (Rückgabe negativ)
    SELECT SUM( wtjhr ) FROM bpja INTO <ls_erg>-budget
      WHERE objnr = <ls_erg>-objnr
        AND gjahr = p_gjahr
        AND wrttp = '41'
        AND vorga IN ('KBUD', 'KBN0', 'KBR0').

*   Istkosten der Perioden 1-16 aufsummieren
    LOOP AT lt_cosp ASSIGNING <ls_cosp> WHERE objnr = <ls_erg>-objnr.
      DO 16 TIMES.
        lv_feld = |WKG{ sy-index WIDTH = 3 ALIGN = RIGHT PAD = '0' }|.
        ASSIGN COMPONENT lv_feld OF STRUCTURE <ls_cosp> TO <lv_wert>.
        <ls_erg>-ist = <ls_erg>-ist + <lv_wert>.
      ENDDO.
    ENDLOOP.

*   Obligo (Bestellungen, Mittelvormerkungen) - über alle Jahre
    SELECT SUM( wkgbtr ) FROM cooi INTO <ls_erg>-obligo
      WHERE objnr = <ls_erg>-objnr.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form AUSSCHOEPFUNG_BEWERTEN - Ampel nach Toleranzprofil
*&---------------------------------------------------------------------*
FORM ausschoepfung_bewerten.
  FIELD-SYMBOLS <ls_erg> TYPE ty_erg.

  LOOP AT gt_erg ASSIGNING <ls_erg>.
    IF <ls_erg>-budget = 0.
      <ls_erg>-ampel = 'OHNE'.
      CONTINUE.
    ENDIF.
    <ls_erg>-proz = ( <ls_erg>-ist + <ls_erg>-obligo ) * 100 / <ls_erg>-budget.
    <ls_erg>-ampel = COND #( WHEN <ls_erg>-proz >= gs_tol-proz_fehler THEN 'ROT'
                             WHEN <ls_erg>-proz >= gs_tol-proz_warn   THEN 'GELB'
                             ELSE 'GRÜN' ).
  ENDLOOP.
  gv_rot = REDUCE i( INIT n = 0
                     FOR ls_e IN gt_erg WHERE ( ampel = 'ROT' )
                     NEXT n = n + 1 ).
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LISTE_AUSGEBEN - Liste mit Projektsummen
*&---------------------------------------------------------------------*
FORM liste_ausgeben.
  DATA ls_erg TYPE ty_erg.

  SORT gt_erg BY pspid posid.
  LOOP AT gt_erg INTO ls_erg.
    WRITE: / ls_erg-posid, ls_erg-budget, ls_erg-ist, ls_erg-obligo,
             ls_erg-proz, ls_erg-ampel.
    AT END OF pspid.
      SUM.
      WRITE: / 'Summe Projekt', ls_erg-pspid,
               ls_erg-budget, ls_erg-ist, ls_erg-obligo.
      ULINE.
    ENDAT.
  ENDLOOP.
  WRITE: / gv_rot, 'PSP-Elemente über der Fehlergrenze'.
ENDFORM.
