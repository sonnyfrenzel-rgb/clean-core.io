*&---------------------------------------------------------------------*
*& Include MZMM_PR_RELEASE_O01 - PBO-Module
*&---------------------------------------------------------------------*

MODULE status_0100 OUTPUT.
  SET PF-STATUS 'S0100'.
  SET TITLEBAR 'T0100' WITH sy-uname.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE liste_laden OUTPUT.
* Liste nur beim ersten Durchlauf oder nach Auffrischen neu lesen
  IF gv_loaded = abap_false.
    PERFORM codes_lesen.
    IF gt_codes IS INITIAL.
      MESSAGE e050 WITH sy-uname.
    ENDIF.
    PERFORM banf_lesen.
    gv_loaded = abap_true.
    tc_list-lines = lines( gt_line ).
    IF gt_line IS INITIAL.
      MESSAGE s051.
    ENDIF.
  ENDIF.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE tc_list_move OUTPUT.
  READ TABLE gt_line INTO gs_line INDEX tc_list-current_line.
  IF sy-subrc = 0.
    MOVE-CORRESPONDING gs_line TO zmm_s_pr_line.
  ENDIF.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'S0200'.
  SET TITLEBAR 'T0200'.
  CLEAR gv_grund.
ENDMODULE.
