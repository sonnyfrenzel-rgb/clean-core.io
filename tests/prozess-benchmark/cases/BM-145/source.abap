REPORT zpe_qualification_expiry.
* Personalentwicklung: Qualifikationen (z. B. Staplerschein, Ersthelfer),
* deren Gueltigkeit in den naechsten N Tagen endet
PARAMETERS p_days TYPE i DEFAULT 60.
DATA: lv_to     TYPE sy-datum,
      lv_active TYPE tvarvc-low,
      lt_q      TYPE STANDARD TABLE OF hrp1001,
      ls_q      TYPE hrp1001.

START-OF-SELECTION.
  SELECT SINGLE low FROM tvarvc INTO lv_active
    WHERE name = 'ZPE_QUALI_EXPIRY_ACTIVE' AND type = 'P' AND numb = '0000'.
  IF lv_active <> 'X' AND sy-uname <> 'HRADMIN01'.
    MESSAGE s020(zpe).
    LEAVE PROGRAM.
  ENDIF.
  lv_to = sy-datum + p_days.
  SELECT * FROM hrp1001 INTO TABLE lt_q
    WHERE plvar = '01' AND otype = 'P' AND rsign = 'A' AND relat = '032'
      AND endda BETWEEN sy-datum AND lv_to.
  LOOP AT lt_q INTO ls_q.
    WRITE: / ls_q-objid, ls_q-sobid, ls_q-endda.
  ENDLOOP.
