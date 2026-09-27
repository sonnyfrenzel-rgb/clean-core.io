REPORT zpm_equi_am_platz.
*----------------------------------------------------------------------*
* Eingebaute Equipments an einem Technischen Platz (nur gültige Zeitsegmente)
* 2009-11 RSC  Erstellung
*----------------------------------------------------------------------*
PARAMETERS: p_tplnr TYPE iflot-tplnr OBLIGATORY,
            p_max   TYPE i DEFAULT 200.
DATA: gv_equnr TYPE equz-equnr,
      gv_heqnr TYPE equz-heqnr,
      gv_count TYPE i.

INITIALIZATION.
  GET PARAMETER ID 'IFL' FIELD p_tplnr.

START-OF-SELECTION.
  SELECT z~equnr z~heqnr INTO (gv_equnr, gv_heqnr)
    FROM equz AS z INNER JOIN iloa AS i ON i~iloan = z~iloan
    WHERE i~tplnr = p_tplnr
      AND z~datbi = '99991231'.
    gv_count = gv_count + 1.
    IF gv_count > p_max.
      EXIT.
    ENDIF.
    WRITE: / gv_equnr, gv_heqnr.
  ENDSELECT.
