REPORT zre_mietkond_aenderungen.
* Änderungshistorie der Mietkonditionen eines Mietvertrags
* (Änderungsbelegobjekt ZMIETVERTR, Tabelle ZRE_MIETKOND)
PARAMETERS: p_recnnr TYPE recnnr OBLIGATORY,
            p_datab  TYPE sy-datum.
DATA gt_cdred TYPE STANDARD TABLE OF cdred.

START-OF-SELECTION.
  CALL FUNCTION 'CHANGEDOCUMENT_READ'
    EXPORTING
      objectclass       = 'ZMIETVERTR'
      objectid          = CONV cdobjectv( p_recnnr )
      date_of_change    = p_datab
      tablename         = 'ZRE_MIETKOND'
    TABLES
      editpos           = gt_cdred
    EXCEPTIONS
      no_position_found = 1
      OTHERS            = 2.
* IF sy-subrc <> 0.
*   WRITE / 'Keine Änderungen'(001).
*   RETURN.
* ENDIF.

  SORT gt_cdred BY changenr fname.
  LOOP AT gt_cdred INTO DATA(ls_cd).
    AT NEW changenr.
      WRITE: / ls_cd-changenr, ls_cd-udate, ls_cd-username.
    ENDAT.
    WRITE: /5 ls_cd-ftext, ls_cd-f_old, '->', ls_cd-f_new.
  ENDLOOP.
