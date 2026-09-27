REPORT zrt_aktion_aufteilung MESSAGE-ID zrt.
*----------------------------------------------------------------------*
* Aufteilung einer Aktionsmenge auf die Filialen eines Verteilzentrums
* nach Filialquote - Ersatz fuer Aufteiler (WA01) in Region Sued, 2013
* 2018 SKR: Rest geht an die Filiale mit der groessten Zuteilung
*----------------------------------------------------------------------*
PARAMETERS: p_matnr TYPE mara-matnr OBLIGATORY,
            p_menge TYPE menge_d OBLIGATORY,
            p_vz    TYPE t001w-werks OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_filq,
         filiale TYPE werks_d,
         quote   TYPE zrt_quote_wert,
       END OF ty_filq,
       BEGIN OF ty_auft,
         filiale TYPE werks_d,
         menge   TYPE menge_d,
       END OF ty_auft.
DATA: lt_filq TYPE STANDARD TABLE OF ty_filq,
      lt_auft TYPE STANDARD TABLE OF ty_auft,
      lt_db   TYPE STANDARD TABLE OF zrt_aufteil,
      lv_rest TYPE menge_d.

AT SELECTION-SCREEN ON p_vz.
  SELECT SINGLE werks FROM t001w INTO @DATA(lv_werks)
    WHERE werks = @p_vz
      AND vlfkz = 'B'.
  IF sy-subrc <> 0.
    MESSAGE e020 WITH p_vz.          "kein Verteilzentrum
  ENDIF.

START-OF-SELECTION.
  SELECT q~filiale, q~quote
    FROM zrt_quote AS q
    INNER JOIN t001w AS w ON w~werks = q~filiale
    WHERE q~vz    = @p_vz
      AND w~vlfkz = 'A'
    INTO TABLE @lt_filq.
  IF lt_filq IS INITIAL.
    MESSAGE s021 WITH p_vz DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  DATA(lv_summe) = REDUCE zrt_quote_wert( INIT s = 0
                     FOR f IN lt_filq WHERE ( quote > 0 )
                     NEXT s = s + f-quote ).

  lv_rest = p_menge.
  LOOP AT lt_filq INTO DATA(ls_filq).
    CHECK ls_filq-quote > 0.
    DATA(lv_anteil) = CONV menge_d( trunc( p_menge * ls_filq-quote / lv_summe ) ).
    APPEND VALUE #( filiale = ls_filq-filiale menge = lv_anteil ) TO lt_auft.
    lv_rest = lv_rest - lv_anteil.
  ENDLOOP.

* Rundungsrest an die Filiale mit der groessten Zuteilung
  SORT lt_auft BY menge DESCENDING.
  READ TABLE lt_auft ASSIGNING FIELD-SYMBOL(<ls_auft>) INDEX 1.
  IF sy-subrc = 0.
    <ls_auft>-menge = <ls_auft>-menge + lv_rest.
  ENDIF.

  IF p_test = abap_false.
    lt_db = VALUE #( FOR a IN lt_auft ( mandt   = sy-mandt
                                        matnr   = p_matnr
                                        vz      = p_vz
                                        filiale = a-filiale
                                        menge   = a-menge
                                        erdat   = sy-datum
                                        ernam   = sy-uname ) ).
    MODIFY zrt_aufteil FROM TABLE lt_db.
    COMMIT WORK.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                              CHANGING  t_table      = lt_auft ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO DATA(lx_salv).
      MESSAGE lx_salv TYPE 'I'.
  ENDTRY.
