*---------------------------------------------------------------------*
*       Include RV64A901 - Konditionswertformel 901                   *
*       Nettopreis nach Z-Preisstrategie je Kundengruppe (ZNET)       *
*---------------------------------------------------------------------*
FORM frm_kondi_wert_901.
*{   INSERT         DEVK912345                                        1
  DATA: lo_strategy TYPE REF TO zcl_sd_price_base,
        lx_price    TYPE REF TO zcx_sd_pricing,
        lv_net      TYPE kbetr.

* nur Positionen, nur Kunden mit gepflegter Kundengruppe
  CHECK komp-kposn IS NOT INITIAL.
  CHECK komk-kdgrp IS NOT INITIAL.

  TRY.
      lo_strategy = zcl_sd_price_factory=>get_strategy( komk-kdgrp ).
      lv_net = lo_strategy->calculate( is_komk = komk
                                       is_komp = komp ).
      xkwert = lv_net * komp-mglme / 1000.
    CATCH zcx_sd_pricing INTO lx_price.
*     Kondition inaktiv setzen, Preisfindung laeuft mit PR00 weiter
      xkomv-kinak = 'Y'.
      MESSAGE lx_price TYPE 'S'.
  ENDTRY.
*}   INSERT
ENDFORM.
