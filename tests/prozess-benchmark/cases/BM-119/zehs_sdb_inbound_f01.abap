*----------------------------------------------------------------------*
***INCLUDE ZEHS_SDB_INBOUND_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form DATEI_VERARBEITEN
*&---------------------------------------------------------------------*
* Ein SDB: lesen, transformieren, Stoff zuordnen, Kataster verbuchen
* PV_OK = X  -> Datei darf archiviert werden
* PV_XML     -> Dateiinhalt für die Archivierung
* Nicht zuordenbare SDB bleiben im Eingang liegen und werden beim
* nächsten Lauf erneut gelesen (Stoff inzwischen angelegt?).
*----------------------------------------------------------------------*
FORM datei_verarbeiten USING    pv_name TYPE eps2filnam
                       CHANGING pv_ok   TYPE abap_bool
                                pv_xml  TYPE xstring.
  DATA: lv_path TYPE string,
        ls_sdb  TYPE zehs_s_sdb,
        ls_kat  TYPE zehs_kataster.

  pv_ok   = abap_false.
  CLEAR pv_xml.
  lv_path = |{ p_dir }{ pv_name }|.

  OPEN DATASET lv_path FOR INPUT IN BINARY MODE.
  IF sy-subrc <> 0.
    PERFORM prot USING pv_name 'E' 'Datei nicht lesbar'.
    RETURN.
  ENDIF.
  READ DATASET lv_path INTO pv_xml.
  CLOSE DATASET lv_path.

  TRY.
      CALL TRANSFORMATION zehs_sdb_to_abap
        SOURCE XML pv_xml
        RESULT sdb = ls_sdb.
    CATCH cx_transformation_error INTO DATA(lx_trans).
      gv_text = lx_trans->get_text( ).
      PERFORM prot USING pv_name 'E' gv_text.
      RETURN.
  ENDTRY.

* Stoff über CAS-Nummer (Identifikator NUM/CAS)
  SELECT SINGLE h~recn, h~subid
    FROM estri AS i
    INNER JOIN estrh AS h ON h~recnroot = i~recnroot
    WHERE i~idtype = 'NUM'
      AND i~idcat  = 'CAS'
      AND i~ident  = @ls_sdb-cas
      AND i~delflg = @space
    INTO @DATA(ls_spec).
  IF sy-subrc <> 0.
    gv_text = |CAS { ls_sdb-cas } keinem Stoff zugeordnet|.
    PERFORM prot USING pv_name 'W' gv_text.
    RETURN.
  ENDIF.

* nur neuere SDB-Stände übernehmen
  SELECT SINGLE sdb_datum FROM zehs_kataster
    WHERE werks = @p_werks
      AND subid = @ls_spec-subid
    INTO @DATA(lv_alt).
  IF sy-subrc = 0 AND lv_alt >= ls_sdb-datum.
    PERFORM prot USING pv_name 'I' 'SDB nicht neuer als Katasterstand'.
    pv_ok = abap_true.
    RETURN.
  ENDIF.

  IF p_test = abap_true.
    gv_text = |Testlauf: { ls_spec-subid } LGK { ls_sdb-lgk } WGK { ls_sdb-wgk }|.
    PERFORM prot USING pv_name 'I' gv_text.
    RETURN.
  ENDIF.

  ls_kat-werks     = p_werks.
  ls_kat-subid     = ls_spec-subid.
  ls_kat-lgk       = ls_sdb-lgk.
  ls_kat-wgk       = ls_sdb-wgk.
  ls_kat-sdb_datum = ls_sdb-datum.
  ls_kat-lifnr     = ls_sdb-lifnr.
  CALL FUNCTION 'Z_EHS_KATASTER_UPDATE' IN UPDATE TASK
    EXPORTING
      is_kataster = ls_kat.

  gv_text = |Kataster { ls_spec-subid } vorgemerkt (LGK { ls_sdb-lgk })|.
  PERFORM prot USING pv_name 'S' gv_text.
  pv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DATEI_ARCHIVIEREN
*&---------------------------------------------------------------------*
* Datei nach <verzeichnis>/archiv/ verschieben: Inhalt schreiben,
* dann Original löschen. Das Archiv ist die Nachweisablage für die
* Gefährdungsbeurteilung (Aufbewahrung 10 Jahre).
*----------------------------------------------------------------------*
FORM datei_archivieren USING pv_name TYPE eps2filnam
                             pv_bin  TYPE xstring.
  DATA: lv_src TYPE string,
        lv_dst TYPE string.

  lv_src = |{ p_dir }{ pv_name }|.
  lv_dst = |{ p_dir }archiv/{ pv_name }|.

  OPEN DATASET lv_dst FOR OUTPUT IN BINARY MODE.
  IF sy-subrc <> 0.
    PERFORM prot USING pv_name 'W' 'Archivierung nicht möglich'.
    RETURN.
  ENDIF.
  TRANSFER pv_bin TO lv_dst.
  CLOSE DATASET lv_dst.
  DELETE DATASET lv_src.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LAGERPRUEFUNG
*&---------------------------------------------------------------------*
* Zusammenlagerung nach TRGS 510 je Lagerort des Werks
*----------------------------------------------------------------------*
FORM lagerpruefung.
  DATA: lo_check TYPE REF TO zcl_ehs_lagerklasse,
        lt_lgk   TYPE zehs_t_lgk.

  SELECT lgort, subid, lgk FROM zehs_kataster
    WHERE werks = @p_werks
      AND lgk  <> @space
    INTO TABLE @DATA(lt_kat).

  lo_check = NEW #( p_werks ).

  LOOP AT lt_kat INTO DATA(ls_kat)
       GROUP BY ( lgort = ls_kat-lgort ) ASSIGNING FIELD-SYMBOL(<ls_lo>).
    lt_lgk = VALUE #( FOR ls_m IN GROUP <ls_lo> ( ls_m-lgk ) ).
    SORT lt_lgk.
    DELETE ADJACENT DUPLICATES FROM lt_lgk.

    TRY.
        lo_check->pruefen( lt_lgk ).
      CATCH zcx_ehs_zusammenlagerung INTO DATA(lx_zl).
        gv_text = lx_zl->get_text( ).
        PERFORM prot USING <ls_lo>-lgort 'E' gv_text.
        IF p_test IS INITIAL.
          INSERT zehs_aufgabe FROM @( VALUE #( werks  = p_werks
                                               lgort  = <ls_lo>-lgort
                                               art    = 'ZUSLAG'
                                               text   = gv_text
                                               status = 'OFFEN'
                                               erdat  = sy-datum ) ).
        ENDIF.
    ENDTRY.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROT
*&---------------------------------------------------------------------*
FORM prot USING pv_objekt TYPE clike
                pv_msgty  TYPE symsgty
                pv_text   TYPE clike.
  APPEND VALUE #( objekt = pv_objekt msgty = pv_msgty text = pv_text )
         TO gt_prot.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROTOKOLL_ANZEIGEN
*&---------------------------------------------------------------------*
FORM protokoll_anzeigen.
  DATA lo_alv TYPE REF TO cl_salv_table.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_prot ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE s802(zehs).
  ENDTRY.
ENDFORM.
