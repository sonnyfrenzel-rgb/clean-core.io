*---------------------------------------------------------------------*
*       Auszug MV45AFZZ - Preisfindungs-Exits                          *
*---------------------------------------------------------------------*
*  Projekt PREIS2015: Kundenkategorie und Kampagne als zusätzliche
*  Felder der Konditionsfindung (Zugriffsfolge ZKAM, Kondition ZKA1)
*---------------------------------------------------------------------*

*---------------------------------------------------------------------*
*       FORM USEREXIT_PRICING_PREPARE_TKOMK                           *
*---------------------------------------------------------------------*
*       This userexit can be used to move additional fields into the  *
*       communication table which is used for pricing: TKOMK Header  *
*---------------------------------------------------------------------*
FORM userexit_pricing_prepare_tkomk.
  DATA lv_katr1 TYPE kna1-katr1.

* Kundenkategorie des Auftraggebers (Attribut 1 im Kundenstamm)
  SELECT SINGLE katr1 FROM kna1 INTO lv_katr1
    WHERE kunnr = vbak-kunnr.
  IF sy-subrc = 0.
    tkomk-zzkatr = lv_katr1.
  ENDIF.
* 2016-03 KWE: Kategorie aus ZSD_KUNDATTR nicht mehr verwendet
*  SELECT SINGLE katr FROM zsd_kundattr INTO tkomk-zzkatr
*    WHERE kunnr = vbak-kunnr
*      AND vkorg = vbak-vkorg.

* Aufträge aus dem Webshop (Auftragsart ZWEB) bekommen Kategorie W
  IF vbak-auart = 'ZWEB'.
    tkomk-zzkatr = 'W'.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
*       FORM USEREXIT_PRICING_PREPARE_TKOMP                           *
*---------------------------------------------------------------------*
*       This userexit can be used to move additional fields into the  *
*       communication table which is used for pricing: TKOMP Item    *
*---------------------------------------------------------------------*
FORM userexit_pricing_prepare_tkomp.
  DATA: lv_prodh TYPE mvke-prodh,
        ls_kamp  TYPE zsd_kampagne.

* Produkthierarchie Stufe 1 aus den Vertriebsdaten des Materials
* (MARA-PRDHA wird bewusst nicht verwendet - abweichende Pflege je VKORG)
  SELECT SINGLE prodh FROM mvke INTO lv_prodh
    WHERE matnr = vbap-matnr
      AND vkorg = vbak-vkorg
      AND vtweg = vbak-vtweg.
  tkomp-zzprodh1 = lv_prodh(5).

* aktive Kampagne zur Produkthierarchie am Preisdatum
  CLEAR tkomp-zzkampagne.
  SELECT * FROM zsd_kampagne INTO ls_kamp
    UP TO 1 ROWS
    WHERE vkorg  = vbak-vkorg
      AND prodh1 = tkomp-zzprodh1
      AND datab <= vbkd-prsdt
      AND datbi >= vbkd-prsdt
    ORDER BY prio DESCENDING.
  ENDSELECT.
  IF sy-subrc = 0.
    tkomp-zzkampagne = ls_kamp-kampagne.
  ENDIF.
ENDFORM.
