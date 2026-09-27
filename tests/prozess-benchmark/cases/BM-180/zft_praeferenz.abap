REPORT zft_praeferenz MESSAGE-ID zft LINE-SIZE 160.
*----------------------------------------------------------------------*
* Praeferenzkalkulation Fertigerzeugnisse (Warenursprung EU)
*----------------------------------------------------------------------*
* Ermittelt je Fertigerzeugnis eines Werks, ob es praeferenzbeguenstigten
* Ursprung hat (Grundlage fuer Langzeit-Lieferantenerklaerungen an Kunden
* und Ursprungsnachweise EUR.1 / Erklaerung auf der Rechnung):
*  - Zukaufteile: Ursprung nur mit gueltiger Lieferantenerklaerung
*    (ZFT_LE) ALLER Lieferanten
*  - Eigenfertigung: Stueckliste rekursiv, Anteil Vormaterial ohne
*    Ursprung am Wert <= Hoechstanteil der Listenregel (ZFT_REGEL,
*    je Kapitel der Warennummer, Standard 40 %)
*  - Ergebnis in ZFT_PRAEF_ERG, Verlust des Ursprungs -> Workflow Zoll
*----------------------------------------------------------------------*
* 2015 Neuentwicklung (Ersatz Kumulierungsprogramm von 2009)
* 2018 Cache fuer Baugruppen, Zyklenschutz
* 2020 Workflow-Ereignis PRAEFERENZ_VERLOREN
*----------------------------------------------------------------------*

INCLUDE zft_praeferenz_top.
INCLUDE zft_praeferenz_c01.
INCLUDE zft_praeferenz_f01.
INCLUDE zft_praeferenz_f02.

INITIALIZATION.
  p_stich = sy-datum.

START-OF-SELECTION.
  PERFORM schalter_pruefen.
  PERFORM materialien_lesen.
  IF gt_mat IS INITIAL.
    MESSAGE s001.                          "keine Fertigerzeugnisse
    RETURN.
  ENDIF.

  go_kalk = NEW lcl_kalkulation( iv_werks    = p_werks
                                 iv_stichtag = p_stich ).

  LOOP AT gt_mat INTO DATA(ls_mat).
    TRY.
        DATA(ls_bew) = go_kalk->bewerten( ls_mat-matnr ).
      CATCH lcx_zyklus.
        ls_bew = VALUE #( matnr    = ls_mat-matnr
                          ursprung = abap_false
                          grund    = 'Zyklische Stueckliste' ).
    ENDTRY.

    DATA(lv_alt) = VALUE #( gt_alt[ matnr = ls_mat-matnr ]-ursprung OPTIONAL ).
    APPEND VALUE #( stawn    = ls_mat-stawn
                    matnr    = ls_mat-matnr
                    ursprung = ls_bew-ursprung
                    alt      = lv_alt
                    anteil   = COND #( WHEN ls_bew-wert > 0
                                       THEN ls_bew-nu_wert * 100 / ls_bew-wert )
                    grund    = ls_bew-grund
                    verloren = xsdbool( lv_alt = abap_true AND ls_bew-ursprung = abap_false ) )
           TO gt_erg.
  ENDLOOP.

  IF p_upd = abap_true.
    PERFORM ergebnisse_sichern.
  ENDIF.

END-OF-SELECTION.
  PERFORM ausgabe.
