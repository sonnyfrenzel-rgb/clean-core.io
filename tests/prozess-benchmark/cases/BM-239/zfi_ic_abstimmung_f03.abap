*&---------------------------------------------------------------------*
*&  Include           ZFI_IC_ABSTIMMUNG_F03
*&  Vergleich und Ausgabe
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  VERGLEICHEN
*&---------------------------------------------------------------------*
*       unsere Forderung  <-> Verbindlichkeit des Partners
*       unsere Verbindl.  <-> Forderung des Partners
*       (gleiche Hauswaehrung vorausgesetzt - Konzernwaehrung EUR)
*----------------------------------------------------------------------*
FORM vergleichen.
  DATA: lv_diff1 TYPE dmbtr,
        lv_diff2 TYPE dmbtr,
        ls_diff  TYPE zfi_ic_diff.
  FIELD-SYMBOLS <ls_saldo> TYPE ty_saldo.

  LOOP AT gt_saldo ASSIGNING <ls_saldo>.
*   Partner ohne Antwort nicht vergleichen
    IF <ls_saldo>-status = 'F'.
      CONTINUE.
    ENDIF.

    lv_diff1 = <ls_saldo>-eig_ford - <ls_saldo>-par_verb.
    lv_diff2 = <ls_saldo>-eig_verb - <ls_saldo>-par_ford.

    IF abs( lv_diff1 ) <= p_toler AND abs( lv_diff2 ) <= p_toler.
      <ls_saldo>-status = 'O'.
      CONTINUE.
    ENDIF.

    <ls_saldo>-status = 'D'.
    CHECK p_test IS INITIAL.

    CLEAR ls_diff.
    ls_diff-bukrs         = p_bukrs.
    ls_diff-partner_bukrs = <ls_saldo>-partner_bukrs.
    ls_diff-stichtag      = p_datum.
    ls_diff-diff_ford     = lv_diff1.
    ls_diff-diff_verb     = lv_diff2.
    ls_diff-ernam         = sy-uname.
    ls_diff-status        = 'O'.          "offen, Klaerung durch IC-Team
    MODIFY zfi_ic_diff FROM ls_diff.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lt_out TYPE STANDARD TABLE OF ty_saldo,
        lx_msg TYPE REF TO cx_salv_msg.

  lt_out = gt_saldo.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = lt_out ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO lx_msg.
      MESSAGE lx_msg TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.
