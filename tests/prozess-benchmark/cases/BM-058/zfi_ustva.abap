*&---------------------------------------------------------------------*
*& Report ZFI_USTVA
*&---------------------------------------------------------------------*
*& Umsatzsteuer-Voranmeldung (UStVA) je Buchungskreis und Monat
*& Steuerabteilung - angelegt 2006 HBE
*& 2011-02 KLE  Abstimmung gegen Steuerkonten ergaenzt
*& 2014-11 HBE  Sondervorauszahlung Dezember (Kz39)
*& 2019-07 EXT  XML-Datei ueber ZCL_FI_USTVA_XML statt Flatfile
*& 2021-03 KLE  Berichtigte Meldung (P_KORR), laufende Nummer im Protokoll
*&---------------------------------------------------------------------*
REPORT zfi_ustva LINE-SIZE 132 MESSAGE-ID zfi.

INCLUDE zfi_ustva_top.
INCLUDE zfi_ustva_sel.
INCLUDE zfi_ustva_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
* Berechtigung Buchungskreis (Anzeige Belege)
  AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
           ID 'BUKRS' FIELD p_bukrs
           ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH p_bukrs.
  ENDIF.

* Meldezeitraum = Kalendermonat, abgegrenzt ueber das Buchungsdatum
  CONCATENATE p_gjahr p_monat '01' INTO gv_von.
  gv_bis = gv_von + 31.
  gv_bis+6(2) = '01'.
  gv_bis = gv_bis - 1.
  CLEAR gr_budat.
  gr_budat-sign   = 'I'.
  gr_budat-option = 'BT'.
  gr_budat-low    = gv_von.
  gr_budat-high   = gv_bis.
  APPEND gr_budat.

  PERFORM doppelmeldung_pruefen.
  PERFORM steuerzeilen_lesen.
  PERFORM kennzahlen_zuordnen.
  PERFORM steuerkonten_abstimmen.
  PERFORM runden_und_zahllast.

* Nicht zugeordnete Steuerkennzeichen sperren die Meldung (Vorgabe StB)
  IF gv_fehler = abap_true.
    MESSAGE 'Nicht zugeordnete Steuerkennzeichen - keine Datei erzeugt' TYPE 'I'.
  ELSEIF p_test = abap_false.
*   PERFORM datei_flat.          "alt bis 2019
    PERFORM datei_schreiben.
    PERFORM protokoll_schreiben.
  ENDIF.

  PERFORM ausgabe_alv.
