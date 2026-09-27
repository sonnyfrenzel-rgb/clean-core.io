*&---------------------------------------------------------------------*
*&  Include           MZPM_STOER_O01
*&---------------------------------------------------------------------*

* STATUS_0100 liegt seit 2012 im Include MZPM_STOER_O00 (Standardstatus)

*&---------------------------------------------------------------------*
*&      Module  STATUS_0200  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'S0200'.
  SET TITLEBAR 'T0200' WITH gs_meld-equnr gs_meld-eqktx.

* Maengelmeldung hat eigenen Subscreen (Objektteil statt Schadensbild)
  gv_subscr = COND #( WHEN gs_meld-qmart = gc_maengel THEN '0220'
                                                      ELSE '0210' ).
*  LOOP AT SCREEN.                       "alt: Felder ausblenden
*    IF screen-group1 = 'M2'.
*      screen-active = 0.
*    ENDIF.
*    MODIFY SCREEN.
*  ENDLOOP.
ENDMODULE.                 " STATUS_0200  OUTPUT
