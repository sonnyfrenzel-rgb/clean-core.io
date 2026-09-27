REPORT zps_budget_avc LINE-SIZE 132 NO STANDARD PAGE HEADING.
*----------------------------------------------------------------------*
* Budgetausschöpfung je PSP-Element: Ist + Obligo gegen Jahresbudget
* Ampel nach Toleranzprofil (ZPS_AVC_TOL), Mail an Projektleitung bei Rot
* 2011 PSC  Ersterstellung
* 2014 MBR  Obligo aus COOI statt RPSCO
* 2020 TWE  Mailversand in ZPS_MAIL_UTIL ausgelagert
*----------------------------------------------------------------------*
TABLES: proj, prps.

TYPES: BEGIN OF ty_erg,
         pspid  TYPE proj-pspid,
         posid  TYPE prps-posid,
         objnr  TYPE prps-objnr,
         vernr  TYPE prps-vernr,
         budget TYPE bpja-wtjhr,
         ist    TYPE bpja-wtjhr,
         obligo TYPE bpja-wtjhr,
         proz   TYPE p LENGTH 7 DECIMALS 2,
         ampel  TYPE char4,
       END OF ty_erg.

SELECT-OPTIONS s_pspid FOR proj-pspid OBLIGATORY.
PARAMETERS: p_gjahr TYPE gjahr DEFAULT sy-datum(4),
            p_prof  TYPE zps_avc_prof OBLIGATORY DEFAULT 'STD',
            p_mail  AS CHECKBOX.

DATA: gt_erg TYPE STANDARD TABLE OF ty_erg,
      gs_tol TYPE zps_avc_tol,
      gv_rot TYPE i.

AT SELECTION-SCREEN ON p_prof.
  SELECT SINGLE * FROM zps_avc_tol INTO gs_tol
    WHERE profil = p_prof.
  IF sy-subrc <> 0.
    MESSAGE e020(zps) WITH p_prof.
  ENDIF.

TOP-OF-PAGE.
  WRITE: / 'Budgetausschöpfung Geschäftsjahr', p_gjahr,
           'Toleranzprofil', p_prof.
  ULINE.

START-OF-SELECTION.
  PERFORM daten_lesen.
  IF gt_erg IS INITIAL.
    MESSAGE s021(zps) DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  PERFORM ausschoepfung_bewerten.

END-OF-SELECTION.
  PERFORM liste_ausgeben.
  IF p_mail = 'X' AND gv_rot > 0.
    PERFORM mail_an_projektleitung IN PROGRAM zps_mail_util IF FOUND
            USING gt_erg.
  ENDIF.

INCLUDE zps_budget_avc_f01.
