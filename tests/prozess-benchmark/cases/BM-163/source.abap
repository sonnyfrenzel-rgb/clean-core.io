REPORT zle_hu_inhalt_lieferung.
*----------------------------------------------------------------------*
* Handling Units einer Auslieferung mit Packinhalt (Versand Halle 3)
*----------------------------------------------------------------------*
PARAMETERS p_vbeln TYPE likp-vbeln OBLIGATORY.
DATA: lt_vekp TYPE STANDARD TABLE OF vekp,
      lt_vepo TYPE STANDARD TABLE OF vepo,
      ls_vekp TYPE vekp,
      ls_vepo TYPE vepo.

START-OF-SELECTION.
  SELECT * FROM vekp INTO TABLE lt_vekp
    WHERE vpobjkey = p_vbeln
      AND vpobj    = '01'.
* 2016 MBA: Abbruch stoert bei ungepackten Lieferungen -> raus
* IF lt_vekp IS INITIAL.
*   MESSAGE s004(zle) WITH p_vbeln.
*   LEAVE LIST-PROCESSING.
* ENDIF.
  SELECT * FROM vepo INTO TABLE lt_vepo
    FOR ALL ENTRIES IN lt_vekp
    WHERE venum = lt_vekp-venum.
  SORT lt_vepo BY venum vepos.
  LOOP AT lt_vekp INTO ls_vekp.
    WRITE: / ls_vekp-exidv, ls_vekp-vhilm, ls_vekp-brgew, ls_vekp-gewei.
    LOOP AT lt_vepo INTO ls_vepo WHERE venum = ls_vekp-venum
                                   AND velin = '1'.
      WRITE: /5 ls_vepo-matnr, ls_vepo-charg, ls_vepo-vemng, ls_vepo-vemeh.
    ENDLOOP.
  ENDLOOP.
