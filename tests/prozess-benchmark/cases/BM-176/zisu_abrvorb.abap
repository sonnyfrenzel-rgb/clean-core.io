REPORT zisu_abrvorb MESSAGE-ID zisu LINE-SIZE 160.
*----------------------------------------------------------------------*
* Abrechnungsvorbereitung Turnusportion
*----------------------------------------------------------------------*
* Laeuft als Job vor dem Abrechnungslauf einer Portion:
*  - Anlagen der Portion mit aktivem Vertrag zum Soll-Ablesedatum
*  - fehlt die Turnusablesung: schaetzen (Z-Baustein) oder
*    Abrechnungssperre am Vertrag setzen
*  - Protokoll ueber Ereignis MELDUNG, Anzeige als ALV bzw. Jobliste
*----------------------------------------------------------------------*
* 2012 Ersterstellung (Projekt Abrechnung 2.0)
* 2015 Mail an Abrechnungsteam (inzwischen abgeschaltet)
* 2018 Paketweises COMMIT, Sperrobjekt EZISU_ANLAGE
* 2020 RLM-Kunden nie schaetzen
*----------------------------------------------------------------------*

CLASS lcl_lauf DEFINITION DEFERRED.

INCLUDE zisu_abrvorb_top.
INCLUDE zisu_abrvorb_cls.
INCLUDE zisu_abrvorb_f01.

INITIALIZATION.
  GET PARAMETER ID 'ZPORT' FIELD p_port.
  p_adat = sy-datum.

AT SELECTION-SCREEN ON p_port.
  SELECT SINGLE termschl FROM te420 INTO @DATA(lv_termschl)
    WHERE termschl = @p_port.
  IF sy-subrc <> 0.
    MESSAGE e050 WITH p_port.              "Portion & nicht vorhanden
  ENDIF.

AT SELECTION-SCREEN.
  IF p_test = abap_false AND sy-batch = abap_false AND p_paket > 2000.
    MESSAGE e051.                          "grosse Echtlaeufe nur im Job
  ENDIF.

START-OF-SELECTION.
  SET PARAMETER ID 'ZPORT' FIELD p_port.

  go_lauf = NEW lcl_lauf( iv_portion = p_port
                          iv_adat    = p_adat
                          iv_test    = p_test ).
  DATA(lo_prot) = NEW lcl_protokoll( ).
  SET HANDLER lo_prot->on_meldung FOR go_lauf.

  TRY.
      go_lauf->ausfuehren( ).
    CATCH lcx_abbruch INTO DATA(lx_abbruch).
      MESSAGE lx_abbruch->get_text( ) TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
  gt_prot = lo_prot->mt_prot.

END-OF-SELECTION.
  PERFORM protokoll_anzeigen.
