*---------------------------------------------------------------------*
*       Bedingung 905 (VOFM, Preisfindung) - Kampagnenrabatt ZKA1      *
*       Include RV61A905                                              *
*---------------------------------------------------------------------*
*  Kampagnenrabatt nur, wenn eine Kampagne gefunden wurde, nicht für
*  Freilieferungen (ZFD) und nicht für Positionen mit Absagegrund.
*---------------------------------------------------------------------*
FORM kobed_905.
  sy-subrc = 4.
  CHECK komp-zzkampagne IS NOT INITIAL.
  CHECK komk-auart <> 'ZFD'.
  CHECK komp-abgru IS INITIAL.
  sy-subrc = 0.
ENDFORM.

