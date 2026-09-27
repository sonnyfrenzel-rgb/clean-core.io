*&---------------------------------------------------------------------*
*&  Include           ZFI_USTVA_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DOPPELMELDUNG_PRUEFEN
*&---------------------------------------------------------------------*
* Wurde der Monat schon gemeldet? + naechste laufende Nummer
FORM doppelmeldung_pruefen.
  DATA: ls_prot TYPE zfi_ustva_prot.

  SELECT SINGLE * FROM zfi_ustva_prot INTO ls_prot
    WHERE bukrs  = p_bukrs
      AND gjahr  = p_gjahr
      AND monat  = p_monat
      AND status = 'S'.
  IF sy-subrc = 0 AND p_korr = abap_false AND p_test = abap_false.
*   Monat bereits gemeldet - erneut nur als Berichtigung (P_KORR)
    MESSAGE e002 WITH p_monat p_gjahr ls_prot-erdat.
  ENDIF.

* laufende Nummer = hoechste bisherige + 1
  CLEAR gv_lfdnr.
  SELECT MAX( lfdnr ) FROM zfi_ustva_prot INTO gv_lfdnr
    WHERE bukrs = p_bukrs
      AND gjahr = p_gjahr
      AND monat = p_monat.
  gv_lfdnr = gv_lfdnr + 1.
ENDFORM.                    "doppelmeldung_pruefen

*&---------------------------------------------------------------------*
*&      Form  STEUERZEILEN_LESEN
*&---------------------------------------------------------------------*
* Belegkoepfe des Meldemonats und deren Steuerzeilen (BSET)
FORM steuerzeilen_lesen.
  REFRESH: gt_bkpf, gt_bset.

  SELECT bukrs belnr gjahr budat blart
    FROM bkpf
    INTO TABLE gt_bkpf
    WHERE bukrs =  p_bukrs
      AND budat IN gr_budat
      AND bstat =  space.
*     AND stblg = space.     "Stornos muessen rein - Abstimmung! KLE
  IF sy-subrc <> 0.
    MESSAGE s003 WITH p_monat p_gjahr DISPLAY LIKE 'E'.
    LEAVE LIST-PROCESSING.
  ENDIF.

* bis 2008 direkt ueber Native SQL (Laufzeit Oracle) - HBE
*  EXEC SQL PERFORMING append_bset.
*    SELECT belnr, buzei, mwskz, shkzg, hwbas, hwste
*      INTO :gs_bset-belnr, :gs_bset-buzei, :gs_bset-mwskz,
*           :gs_bset-shkzg, :gs_bset-hwbas, :gs_bset-hwste
*      FROM bset
*     WHERE mandt = :sy-mandt AND bukrs = :p_bukrs AND gjahr = :p_gjahr
*  ENDEXEC.
  SELECT bukrs belnr gjahr buzei mwskz shkzg hwbas hwste hkont
    FROM bset
    INTO TABLE gt_bset
    FOR ALL ENTRIES IN gt_bkpf
    WHERE bukrs = gt_bkpf-bukrs
      AND belnr = gt_bkpf-belnr
      AND gjahr = gt_bkpf-gjahr.
  DESCRIBE TABLE gt_bset LINES gv_anz_bset.
ENDFORM.                    "steuerzeilen_lesen

*&---------------------------------------------------------------------*
*&      Form  KENNZAHLEN_ZUORDNEN
*&---------------------------------------------------------------------*
* Steuerkennzeichen -> Kennzahl (ZFI_USTVA_MAP), Summen je Kennzahl
FORM kennzahlen_zuordnen.
  DATA: lv_bmg TYPE ty_kz-betrag,
        lv_ste TYPE ty_kz-betrag.

  SELECT * FROM zfi_ustva_map INTO TABLE gt_map
    WHERE land1 = gc_land.
  SORT gt_map BY mwskz.

  LOOP AT gt_bset INTO gs_bset.
    READ TABLE gt_map INTO gs_map
         WITH KEY mwskz = gs_bset-mwskz
         BINARY SEARCH.
    IF sy-subrc <> 0.
*     Steuerkennzeichen ohne Kennzahl -> Fehler, Meldung wird gesperrt
      CLEAR gs_meld.
      gs_meld-typ   = 'E'.
      gs_meld-mwskz = gs_bset-mwskz.
      gs_meld-text  = 'Steuerkennzeichen ohne Kennzahl-Zuordnung'(e01).
      COLLECT gs_meld INTO gt_meld.
      gv_fehler = abap_true.
      CONTINUE.
    ENDIF.

*   Vorzeichen nach Soll/Haben: Haben (Umsatzsteuer) +, Soll (Vorsteuer) -
    lv_bmg = gs_bset-hwbas.
    lv_ste = gs_bset-hwste.
    IF gs_bset-shkzg = 'S'.
      lv_bmg = - lv_bmg.
      lv_ste = - lv_ste.
    ENDIF.

*   Zahllast und Summe je Steuerkonto mit Buchungsvorzeichen
    gv_zahllast = gv_zahllast + lv_ste.
    CLEAR gs_konto.
    gs_konto-hkont       = gs_bset-hkont.
    gs_konto-steuer_bset = lv_ste.
    COLLECT gs_konto INTO gt_konto.

*   Meldevorzeichen, z.B. Vorsteuer Kz66 wird positiv gemeldet
    IF gs_map-umkehr = abap_true.
      lv_bmg = - lv_bmg.
      lv_ste = - lv_ste.
    ENDIF.

    IF gs_map-kz_bmg IS NOT INITIAL.
      kz_add gs_map-kz_bmg 'B' lv_bmg.
    ENDIF.
    IF gs_map-kz_st IS NOT INITIAL.
      kz_add gs_map-kz_st 'S' lv_ste.
    ENDIF.
  ENDLOOP.
ENDFORM.                    "kennzahlen_zuordnen

*&---------------------------------------------------------------------*
*&      Form  STEUERKONTEN_ABSTIMMEN
*&---------------------------------------------------------------------*
* Summe Steuerzeilen je Konto gegen Kontensaldo des Monats
FORM steuerkonten_abstimmen.
  TYPES: BEGIN OF lty_bsis,
           hkont TYPE bsis-hkont,
           shkzg TYPE bsis-shkzg,
           dmbtr TYPE bsis-dmbtr,
         END OF lty_bsis.
  DATA: lt_bsis  TYPE STANDARD TABLE OF lty_bsis,
        ls_bsis  TYPE lty_bsis,
        lt_saldo TYPE STANDARD TABLE OF ty_konto,
        ls_saldo TYPE ty_konto.
  FIELD-SYMBOLS: <ls_konto> TYPE ty_konto.

  CHECK gt_konto IS NOT INITIAL.

* Salden aus BSIS (Steuerkonten sind nicht OP-gefuehrt)
* 2011 KLE: FAGLFLEXT verworfen, Periodensaldo passt nicht bei Nachbuchungen
*  SELECT racct hslvt hsl01 hsl02 hsl03 FROM faglflext INTO TABLE lt_glt
*    WHERE rbukrs = p_bukrs AND ryear = p_gjahr AND rldnr = '0L'.
  SELECT hkont shkzg dmbtr FROM bsis
    INTO TABLE lt_bsis
    FOR ALL ENTRIES IN gt_konto
    WHERE bukrs = p_bukrs
      AND hkont = gt_konto-hkont
      AND gjahr = p_gjahr
      AND monat = p_monat.

  LOOP AT lt_bsis INTO ls_bsis.
    CLEAR ls_saldo.
    ls_saldo-hkont    = ls_bsis-hkont.
    ls_saldo-saldo_hk = COND #( WHEN ls_bsis-shkzg = 'H' THEN ls_bsis-dmbtr
                                ELSE - ls_bsis-dmbtr ).
    COLLECT ls_saldo INTO lt_saldo.
  ENDLOOP.
  SORT lt_saldo BY hkont.

  LOOP AT gt_konto ASSIGNING <ls_konto>.
    CLEAR ls_saldo.
    READ TABLE lt_saldo INTO ls_saldo
         WITH KEY hkont = <ls_konto>-hkont BINARY SEARCH.
    <ls_konto>-saldo_hk  = ls_saldo-saldo_hk.
    <ls_konto>-differenz = <ls_konto>-steuer_bset - <ls_konto>-saldo_hk.
    IF abs( <ls_konto>-differenz ) > p_toler.
*     Differenz nur als Warnung - Meldung laeuft weiter (Vorgabe StB 2011)
      CLEAR gs_meld.
      gs_meld-typ   = 'W'.
      gs_meld-hkont = <ls_konto>-hkont.
      gs_meld-text  = 'Differenz Steuerzeilen zu Kontensaldo'(w01).
      APPEND gs_meld TO gt_meld.
      gv_warnung = abap_true.
    ENDIF.
  ENDLOOP.
ENDFORM.                    "steuerkonten_abstimmen

*&---------------------------------------------------------------------*
*&      Form  RUNDEN_UND_ZAHLLAST
*&---------------------------------------------------------------------*
FORM runden_und_zahllast.
  FIELD-SYMBOLS: <ls_kz> TYPE ty_kz.

* Sondervorauszahlung (Kz39) wird nur in der Dezember-Meldung verrechnet
  IF p_monat = 12 AND p_sovz IS NOT INITIAL.
    kz_add '39' 'S' p_sovz.
    gv_zahllast = gv_zahllast - p_sovz.
  ENDIF.

  LOOP AT gt_kz ASSIGNING <ls_kz>.
    <ls_kz>-betrag_rund = <ls_kz>-betrag.
*   Bemessungsgrundlagen auf volle Euro: Cent abschneiden, Steuer centgenau
    IF <ls_kz>-art = 'B'.
      <ls_kz>-betrag_rund = trunc( <ls_kz>-betrag ).
*     <ls_kz>-betrag_rund = round( val = <ls_kz>-betrag dec = 0 ). "bis 2015
    ENDIF.
  ENDLOOP.

* Kz83: verbleibende Vorauszahlung bzw. Ueberschuss (negativ)
  CLEAR gs_kz.
  gs_kz-kennz       = '83'.
  gs_kz-art         = 'S'.
  gs_kz-betrag      = gv_zahllast.
  gs_kz-betrag_rund = gv_zahllast.
  APPEND gs_kz TO gt_kz.
ENDFORM.                    "runden_und_zahllast

*&---------------------------------------------------------------------*
*&      Form  DATEI_SCHREIBEN
*&---------------------------------------------------------------------*
* XML-Datei fuer das Meldeprogramm der Steuerabteilung
FORM datei_schreiben.
  DATA: lo_xml    TYPE REF TO zcl_fi_ustva_xml,
        lt_zeilen TYPE zcl_fi_ustva_xml=>tt_zeilen,
        lv_ok     TYPE abap_bool.

  CONCATENATE p_datei 'UStVA_' p_bukrs '_' p_gjahr p_monat '.xml'
         INTO gv_datei.
  CREATE OBJECT lo_xml.

  CALL METHOD lo_xml->erzeugen
    EXPORTING
      iv_bukrs  = p_bukrs
      iv_gjahr  = p_gjahr
      iv_monat  = p_monat
      it_kz     = gt_kz
    RECEIVING
      rt_zeilen = lt_zeilen.
  IF lt_zeilen IS INITIAL.
*   keine Steuernummer zum Buchungskreis gepflegt
    MESSAGE e004 WITH p_bukrs.
  ENDIF.

  lv_ok = lo_xml->schreiben( iv_datei = gv_datei it_zeilen = lt_zeilen ).
  IF lv_ok = abap_false.
    MESSAGE e005 WITH gv_datei.
  ENDIF.
ENDFORM.                    "datei_schreiben

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_SCHREIBEN
*&---------------------------------------------------------------------*
FORM protokoll_schreiben.
  DATA: ls_prot TYPE zfi_ustva_prot.

  ls_prot-bukrs    = p_bukrs.
  ls_prot-gjahr    = p_gjahr.
  ls_prot-monat    = p_monat.
  ls_prot-lfdnr    = gv_lfdnr.
  ls_prot-status   = 'S'.
  ls_prot-korr     = p_korr.
  ls_prot-zahllast = gv_zahllast.
  ls_prot-datei    = gv_datei.
  ls_prot-warnung  = gv_warnung.
  ls_prot-ernam    = sy-uname.
  ls_prot-erdat    = sy-datum.
  ls_prot-erzet    = sy-uzeit.

  INSERT zfi_ustva_prot FROM ls_prot.
  IF sy-subrc <> 0.
*   Schluessel schon da (parallel gestartet?) - Datei liegt trotzdem
    MESSAGE 'Protokolleintrag existiert bereits - bitte pruefen' TYPE 'I'.
  ELSE.
    COMMIT WORK.
  ENDIF.
ENDFORM.                    "protokoll_schreiben

*&---------------------------------------------------------------------*
*&      Form  AUSGABE_ALV
*&---------------------------------------------------------------------*
FORM ausgabe_alv.
  DATA: ls_layout   TYPE slis_layout_alv,
        lt_alv_meld TYPE tt_alv.

  gt_alv      = CORRESPONDING #( gt_kz ).
  lt_alv_meld = CORRESPONDING #( gt_meld ).
  APPEND LINES OF lt_alv_meld TO gt_alv.

  REFRESH gt_fcat.
  fcat 'TYP'         'Typ'          3.
  fcat 'KENNZ'       'Kennzahl'     8.
  fcat 'ART'         'Art'          4.
  fcat 'BETRAG'      'Betrag'      18.
  fcat 'BETRAG_RUND' 'Meldebetrag' 18.
  fcat 'MWSKZ'       'StKz'         5.
  fcat 'HKONT'       'Steuerkonto' 10.
  fcat 'TEXT'        'Hinweis'     50.
  ls_layout-colwidth_optimize = 'X'.
  ls_layout-zebra             = 'X'.
  CONCATENATE 'UStVA' p_bukrs p_monat '/' p_gjahr INTO gv_titel SEPARATED BY space.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      is_layout          = ls_layout
      it_fieldcat        = gt_fcat
      i_grid_title       = gv_titel
    TABLES
      t_outtab           = gt_alv
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.
ENDFORM.                    "ausgabe_alv
