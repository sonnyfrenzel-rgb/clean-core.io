REPORT zpm_tplatz_baum NO STANDARD PAGE HEADING LINE-SIZE 160.
*----------------------------------------------------------------------*
* Strukturliste Technische Plätze
* Rekursiv über IFLOT-TPLMA (übergeordneter Platz), mit eingebauten
* Equipments und Summen. Doppelklick: IL03 bzw. IE03.
*----------------------------------------------------------------------*
* 2008-10 RSC  Erstellung (IH04 zu langsam bei 40.000 Plätzen)
* 2011-06 RSC  Ebenenbegrenzung, Werks- und Platzartfilter dynamisch
* 2019-03 EXT  inaktive Plätze (Systemstatus INAK) ausblenden
*----------------------------------------------------------------------*
TABLES: iflot, iloa.

TYPES: BEGIN OF ty_node,
         tplnr TYPE iflo-tplnr,
         tplma TYPE iflo-tplma,
         pltxt TYPE iflo-pltxt,
         objnr TYPE iflo-objnr,
       END OF ty_node,
       BEGIN OF ty_equi,
         equnr TYPE equz-equnr,
         eqktx TYPE eqkt-eqktx,
       END OF ty_equi.

CONSTANTS gc_inak TYPE jest-stat VALUE 'I0320'.

DATA: gv_where  TYPE string,
      gv_anz_pl TYPE i,
      gv_anz_eq TYPE i,
      gv_tplnr  TYPE iflot-tplnr,
      gv_equnr  TYPE equz-equnr.

PARAMETERS: p_top  TYPE iflot-tplnr OBLIGATORY,
            p_maxl TYPE i DEFAULT 8,
            p_equi AS CHECKBOX DEFAULT 'X'.
SELECT-OPTIONS: s_swerk FOR iloa-swerk,
                s_fltyp FOR iflot-fltyp.

INCLUDE zpm_tplatz_baum_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON p_top.
  SELECT SINGLE tplnr FROM iflot INTO gv_tplnr
    WHERE tplnr = p_top.
  IF sy-subrc <> 0.
    MESSAGE e020(zpm) WITH p_top.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  CLEAR gv_tplnr.
  PERFORM build_where.
  PERFORM expand USING p_top 0.

*----------------------------------------------------------------------*
END-OF-SELECTION.
  ULINE.
  WRITE: / 'Technische Plätze:', gv_anz_pl,
         / 'Equipments:', gv_anz_eq.
  CLEAR: gv_tplnr, gv_equnr.

*----------------------------------------------------------------------*
AT LINE-SELECTION.
  IF gv_equnr IS NOT INITIAL.
    SET PARAMETER ID 'EQN' FIELD gv_equnr.
    CALL TRANSACTION 'IE03' AND SKIP FIRST SCREEN.
  ELSEIF gv_tplnr IS NOT INITIAL.
    SET PARAMETER ID 'IFL' FIELD gv_tplnr.
    CALL TRANSACTION 'IL03' AND SKIP FIRST SCREEN.
  ENDIF.
  CLEAR: gv_tplnr, gv_equnr.
