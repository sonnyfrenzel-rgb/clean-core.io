REPORT zpm_messbelege_liste.
*----------------------------------------------------------------------*
* Messbelege je Equipment - Ablesungen aller aktiven Messpunkte
* 2014-02 HKL Erstellung
* 2016-10 HKL stornierte Messbelege ausblenden (Ticket 4711)
*----------------------------------------------------------------------*
PARAMETERS: p_equnr TYPE equi-equnr OBLIGATORY,
            p_datab TYPE imrg-idate DEFAULT '20000101'.
DATA: lv_objnr TYPE equi-objnr,
      lt_imptt TYPE STANDARD TABLE OF imptt,
      lt_imrg  TYPE STANDARD TABLE OF imrg,
      ls_imrg  TYPE imrg.

START-OF-SELECTION.
  SELECT SINGLE objnr FROM equi INTO lv_objnr
    WHERE equnr = p_equnr.
  SELECT * FROM imptt INTO TABLE lt_imptt
    WHERE mpobj = lv_objnr
      AND inact = space.
* TODO Leermengenschutz fehlt noch
  SELECT * FROM imrg INTO TABLE lt_imrg
    FOR ALL ENTRIES IN lt_imptt
    WHERE point = lt_imptt-point
      AND idate >= p_datab.
  SORT lt_imrg BY point idate DESCENDING itime DESCENDING.
  LOOP AT lt_imrg INTO ls_imrg.
    CHECK ls_imrg-cancl IS INITIAL.
    WRITE: / ls_imrg-point, ls_imrg-mdocm, ls_imrg-idate,
             ls_imrg-readg, ls_imrg-recdu, ls_imrg-vlcod.
  ENDLOOP.
