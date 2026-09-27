*&---------------------------------------------------------------------*
*& Include ZSD_CREDIT_RELEASE_O01 - PBO-Module
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS '0100'.
  SET TITLEBAR '100'.
  CLEAR gv_okcode.
ENDMODULE.

MODULE status_0200 OUTPUT.
  SET PF-STATUS '0200'.
  SET TITLEBAR '200' WITH gv_vbeln.
  gs_disp = go_case->get_display( ).
* Ampel: rot = Limit schon ueberschritten, gelb = Auftrag sprengt Limit
  gs_disp-ampel = COND #( WHEN gs_disp-free < 0            THEN '1'
                          WHEN gs_disp-free < gs_disp-netwr THEN '2'
                          ELSE '3' ).
  CLEAR gv_okcode.
ENDMODULE.
