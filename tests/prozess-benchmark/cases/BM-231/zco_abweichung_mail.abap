*&---------------------------------------------------------------------*
*& Report  ZCO_ABWEICHUNG_MAIL
*&
*& Plan/Ist-Abweichung je Kostenstelle kumuliert bis Periode;
*& bei Ueberschreiten der Schwelle Mail an den Verantwortlichen.
*& Job monatlich am 5. Arbeitstag.
*&---------------------------------------------------------------------*
REPORT zco_abweichung_mail MESSAGE-ID zco_abw.

TABLES: csks.

PARAMETERS:     p_kokrs TYPE kokrs OBLIGATORY DEFAULT '1000',
                p_gjahr TYPE gjahr OBLIGATORY,
                p_perbi TYPE monat OBLIGATORY,
                p_versn TYPE versn DEFAULT '000'.
SELECT-OPTIONS: s_kostl FOR csks-kostl.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_ks,
         kostl      TYPE kostl,
         verak_user TYPE verak_user,
       END OF ty_ks.

TYPES: BEGIN OF ty_abw,
         kostl TYPE kostl,
         plan  TYPE wkgxxx,
         ist   TYPE wkgxxx,
         proz  TYPE p LENGTH 8 DECIMALS 1,
       END OF ty_abw.

DATA: gt_ks       TYPE STANDARD TABLE OF ty_ks,
      gs_ks       TYPE ty_ks,
      gt_abw      TYPE STANDARD TABLE OF ty_abw,
      gs_abw      TYPE ty_abw,
      gv_schwelle TYPE p LENGTH 8 DECIMALS 1.

INCLUDE zco_abweichung_mail_f01.

START-OF-SELECTION.
* Schwelle in Prozent je Kostenrechnungskreis (Pflege SM30)
  SELECT SINGLE schwelle FROM zco_abw_schwelle INTO gv_schwelle
    WHERE kokrs = p_kokrs.
  IF sy-subrc <> 0.
    gv_schwelle = 10.
    MESSAGE i400 WITH gv_schwelle.
  ENDIF.

  SELECT kostl verak_user
    FROM csks
    INTO TABLE gt_ks
    WHERE kokrs = p_kokrs
      AND kostl IN s_kostl
      AND datbi >= sy-datum
      AND datab <= sy-datum.

  LOOP AT gt_ks INTO gs_ks.
    PERFORM abweichung_ermitteln USING gs_ks CHANGING gs_abw.
    CHECK abs( gs_abw-proz ) > gv_schwelle.
    APPEND gs_abw TO gt_abw.

    IF gs_ks-verak_user IS INITIAL.
      WRITE: / gs_ks-kostl, 'kein verantwortlicher Benutzer - keine Mail'.
      CONTINUE.
    ENDIF.

    IF p_test IS INITIAL.
      PERFORM mail_senden USING gs_ks gs_abw.
    ENDIF.
  ENDLOOP.

  PERFORM liste_ausgeben.
