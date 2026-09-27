*&---------------------------------------------------------------------*
*& Report ZMM_ABC_ANALYSE
*&---------------------------------------------------------------------*
*& ABC-Analyse des Verbrauchswerts je Werk (Monatsjob, Variante MONAT)
*& Rechenkern: AMDP ZCL_MM_ABC_AMDP, Verteilung ueber RFC-Gruppe
*& PARALLEL_GENERATORS. Ergebnis: ZMM_ABC_ERGEBNIS, optional MARC-MAABC.
*&
*& 2017-05 HK  Erstellung (ABAP, LOOP ueber MSEG - Laufzeit 9 h)
*& 2020-11 HK  AMDP + Parallelisierung (Laufzeit 25 min)
*& 2023-02 JL  Schalter P_MARC (Einkauf will MAABC nicht immer)
*&---------------------------------------------------------------------*
REPORT zmm_abc_analyse.

INCLUDE zmm_abc_top.

INITIALIZATION.
* Vorjahreszeitraum als Vorschlag
  p_bis = sy-datum.
  p_von = sy-datum - 365.

AT SELECTION-SCREEN.
  IF p_grza >= p_grzb OR p_grzb > 100.
    MESSAGE e010(zmm_abc).        "Grenzen A < B <= 100 %
  ENDIF.

START-OF-SELECTION.
  SELECT werks FROM t001w
    WHERE werks IN @s_werks
    INTO TABLE @gt_werke.
  IF gt_werke IS INITIAL.
    MESSAGE s011(zmm_abc) DISPLAY LIKE 'E'.   "keine Werke
    RETURN.
  ENDIF.

  go_runner = NEW #( iv_von     = p_von
                     iv_bis     = p_bis
                     iv_grenz_a = p_grza
                     iv_grenz_b = p_grzb
                     iv_marc    = p_marc ).

  IF p_par = abap_true AND lines( gt_werke ) > 1.
    go_runner->parallel( gt_werke ).
  ELSE.
    go_runner->seriell( gt_werke ).
  ENDIF.

END-OF-SELECTION.
  CHECK go_runner IS BOUND.
  PERFORM ausgabe.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA lo_alv TYPE REF TO cl_salv_table.

  gt_ausgabe = CORRESPONDING #( go_runner->mt_summe ).
  SORT gt_ausgabe BY werks.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_ausgabe ).
      lo_alv->get_columns( )->set_optimize( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
*     im Hintergrund ohne Liste - Ergebnis steht in ZMM_ABC_ERGEBNIS
      LOOP AT gt_ausgabe INTO DATA(ls_aus).
        WRITE: / ls_aus-werks, ls_aus-anz_a, ls_aus-anz_b, ls_aus-anz_c, ls_aus-status.
      ENDLOOP.
  ENDTRY.
ENDFORM.
