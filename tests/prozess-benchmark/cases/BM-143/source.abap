REPORT zom_orgeh_without_chief.
* OM-Datenqualitaet: Organisationseinheiten ohne Leiterplanstelle (B012)
TABLES hrp1000.
PARAMETERS: p_plvar TYPE plvar DEFAULT '01',
            p_date  TYPE sy-datum DEFAULT sy-datum.
SELECT-OPTIONS s_orgeh FOR hrp1000-objid.
TYPES: BEGIN OF ty_rel,
         objid TYPE hrobjid,
       END OF ty_rel.
DATA: lt_org TYPE STANDARD TABLE OF hrp1000,
      lt_rel TYPE STANDARD TABLE OF ty_rel,
      ls_org TYPE hrp1000.

START-OF-SELECTION.
  SELECT * FROM hrp1000 INTO TABLE lt_org
    WHERE plvar = p_plvar AND otype = 'O' AND objid IN s_orgeh
      AND istat = '1' AND begda <= p_date AND endda >= p_date
      AND langu = sy-langu.
  SELECT objid FROM hrp1001 INTO TABLE lt_rel
    FOR ALL ENTRIES IN lt_org
    WHERE plvar = p_plvar AND otype = 'O' AND objid = lt_org-objid
      AND rsign = 'B' AND relat = '012'
      AND begda <= p_date AND endda >= p_date.
  SORT lt_rel BY objid.
  LOOP AT lt_org INTO ls_org.
    READ TABLE lt_rel WITH KEY objid = ls_org-objid BINARY SEARCH
         TRANSPORTING NO FIELDS.
    CHECK sy-subrc <> 0.
    WRITE: / ls_org-objid, ls_org-stext.
  ENDLOOP.
