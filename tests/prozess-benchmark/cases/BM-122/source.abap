REPORT zre_vertraege_auslauf.
*----------------------------------------------------------------------*
* RE-FX: Mietverträge, deren erstes Vertragsende in den nächsten
* n Tagen liegt - ersetzt die Excel-Liste des Objektmanagements
* 03/2016 TWE
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE vicncn-bukrs OBLIGATORY,
            p_tage  TYPE i DEFAULT 90.
DATA gv_bis TYPE d.

INITIALIZATION.
  GET PARAMETER ID 'BUK' FIELD p_bukrs.

START-OF-SELECTION.
  gv_bis = sy-datum + p_tage.
  SELECT recnnr, recntxt, recntype, recnend1st
    FROM vicncn
    WHERE bukrs = @p_bukrs
      AND recnend1st BETWEEN @sy-datum AND @gv_bis
    INTO TABLE @DATA(lt_cn).
  SORT lt_cn BY recnend1st.
  LOOP AT lt_cn INTO DATA(ls_cn).
    DATA(lv_ampel) = COND char4( WHEN ls_cn-recnend1st - sy-datum <= 30 THEN 'ROT'
                                 WHEN ls_cn-recnend1st - sy-datum <= 60 THEN 'GELB'
                                 ELSE 'GRÜN' ).
*   Kündigungsfristen berücksichtigen - offen seit 2017
*   IF ls_cn-recntype = 'Z010'. ... ENDIF.
    WRITE: / ls_cn-recnnr, ls_cn-recntxt, ls_cn-recnend1st, lv_ampel.
  ENDLOOP.
