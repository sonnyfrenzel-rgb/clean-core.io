*---------------------------------------------------------------------*
*       Wertformel 901 (VOFM) - Mindermengenzuschlag                    *
*       Include RV64A901, angelegt 2009 durch Fa. Berater             *
*---------------------------------------------------------------------*
FORM frm_kondi_wert_901.
* Zuschlag nur, wenn die Positionsmenge unter der Mindestmenge
* der Warengruppe liegt (Pflege in SM30 / ZSD_MINMENGE)
  DATA ls_minm TYPE zsd_minmenge.

  xkwert = 0.

  SELECT SINGLE * FROM zsd_minmenge INTO ls_minm
    WHERE vkorg = komk-vkorg
      AND matkl = komp-matkl.
  CHECK sy-subrc = 0.

  IF komp-mglme < ls_minm-minmenge.
    xkwert = ls_minm-zuschlag.
*   xkwert = ls_minm-zuschlag * komp-mglme.   "bis 2012 mengenabhängig
  ENDIF.
ENDFORM.
