REPORT zco_ks_ist.
* Ist-Kosten Kostenstelle je Kostenart (Summe P01-P12)
PARAMETERS: p_kokrs TYPE kokrs DEFAULT '1000',
            p_kostl TYPE kostl OBLIGATORY,
            p_gjahr TYPE gjahr.

DATA: lv_objnr TYPE j_objnr,
      lt_cosp  TYPE STANDARD TABLE OF cosp,
      ls_cosp  TYPE cosp,
      lv_jahr  TYPE wkgxxx.

INITIALIZATION.
  p_gjahr = sy-datum(4).

START-OF-SELECTION.
  CONCATENATE 'KS' p_kokrs p_kostl INTO lv_objnr.
  SELECT * FROM cosp INTO TABLE lt_cosp
    WHERE objnr = lv_objnr
      AND gjahr = p_gjahr
      AND wrttp = '04'
      AND versn = '000'.
  IF sy-subrc <> 0.
    MESSAGE s398(00) WITH 'Keine Istkosten fuer' p_kostl.
    RETURN.
  ENDIF.

  LOOP AT lt_cosp INTO ls_cosp.
    lv_jahr = ls_cosp-wkg001 + ls_cosp-wkg002 + ls_cosp-wkg003
            + ls_cosp-wkg004 + ls_cosp-wkg005 + ls_cosp-wkg006
            + ls_cosp-wkg007 + ls_cosp-wkg008 + ls_cosp-wkg009
            + ls_cosp-wkg010 + ls_cosp-wkg011 + ls_cosp-wkg012.
    WRITE: / ls_cosp-kstar, ls_cosp-beknz, lv_jahr.
  ENDLOOP.
