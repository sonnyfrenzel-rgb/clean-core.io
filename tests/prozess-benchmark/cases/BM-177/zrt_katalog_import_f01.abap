*&---------------------------------------------------------------------*
*& Include ZRT_KATALOG_IMPORT_F01 - Verarbeitung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  MAPPING_LESEN
*&---------------------------------------------------------------------*
FORM mapping_lesen.
  SELECT quelle ziel konv_klasse konv_methode FROM zrt_katmap
    INTO TABLE gt_map
    WHERE lifnr = p_lifnr.
  IF sy-subrc <> 0.
*   kein lieferantenspezifisches Mapping -> Standardmapping
    SELECT quelle ziel konv_klasse konv_methode FROM zrt_katmap
      INTO TABLE gt_map
      WHERE lifnr = space.
  ENDIF.
  IF gt_map IS INITIAL.
    MESSAGE e002 WITH p_lifnr.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DATEI_LESEN
*&---------------------------------------------------------------------*
FORM datei_lesen.
  DATA lv_xml TYPE xstring.

  OPEN DATASET p_file FOR INPUT IN BINARY MODE.
  IF sy-subrc <> 0.
    MESSAGE e003 WITH p_file.
  ENDIF.
  READ DATASET p_file INTO lv_xml.
  CLOSE DATASET p_file.

  TRY.
      CALL TRANSFORMATION zrt_katalog
        SOURCE XML lv_xml
        RESULT katalog = gt_kat.
    CATCH cx_transformation_error INTO DATA(lx_trafo).
      MESSAGE lx_trafo->get_text( ) TYPE 'E'.
  ENDTRY.

  IF gt_kat IS INITIAL.
    MESSAGE s004 DISPLAY LIKE 'W'.
    LEAVE LIST-PROCESSING.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  WIEDERAUFSETZEN
*&---------------------------------------------------------------------*
*       Stand des letzten Laufs aus INDX(ZK), Schluessel = Lieferant
*----------------------------------------------------------------------*
FORM wiederaufsetzen.
  DATA: lv_idx  TYPE i,
        lv_text TYPE char120.

  IF p_neu = abap_true.
    DELETE FROM DATABASE indx(zk) ID p_lifnr.
    gv_start_idx = 1.
    RETURN.
  ENDIF.

  IMPORT idx = lv_idx FROM DATABASE indx(zk) ID p_lifnr.
  IF sy-subrc = 0 AND lv_idx < lines( gt_kat ).
    gv_start_idx = lv_idx + 1.
    lv_text = |Wiederaufsetzen ab Katalogzeile { gv_start_idx }|.
    prot space space 'I' lv_text.
  ELSE.
    gv_start_idx = 1.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  VERARBEITEN
*&---------------------------------------------------------------------*
FORM verarbeiten.
  DATA: lv_matnr TYPE matnr,
        lv_ok    TYPE abap_bool.

  LOOP AT gt_kat INTO DATA(ls_kat) FROM gv_start_idx.
    DATA(lv_idx) = sy-tabix.
    CLEAR: lv_matnr, lv_ok.

    CASE ls_kat-status.
      WHEN 'N' OR 'A'.
        PERFORM artikel_pflegen USING ls_kat CHANGING lv_matnr lv_ok.
      WHEN 'D'.
        PERFORM auslauf_setzen USING ls_kat.
        CONTINUE.
      WHEN OTHERS.
        prot ls_kat-lief_artnr space 'E' 'Unbekannter Katalogstatus'.
        CONTINUE.
    ENDCASE.

    IF lv_ok = abap_true AND p_list = abap_true AND ls_kat-status = 'N'.
      PERFORM listen USING lv_matnr.
    ENDIF.

*   Wiederaufsetzpunkt
    IF lv_idx MOD 100 = 0 AND p_test = abap_false.
      EXPORT idx = lv_idx TO DATABASE indx(zk) ID p_lifnr.
      COMMIT WORK.
    ENDIF.
  ENDLOOP.

  IF p_test = abap_false.
    DELETE FROM DATABASE indx(zk) ID p_lifnr.
    COMMIT WORK.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ARTIKEL_PFLEGEN
*&---------------------------------------------------------------------*
*       Anlage (N) bzw. Aenderung (A) eines Artikels, Identifikation ueber EAN
*----------------------------------------------------------------------*
FORM artikel_pflegen USING    us_kat   TYPE ty_kat
                     CHANGING cv_matnr TYPE matnr
                              cv_ok    TYPE abap_bool.
  DATA: ls_head    TYPE bapie1mathead,
        ls_client  TYPE bapie1marart,
        ls_clientx TYPE bapie1marartx,
        lt_client  TYPE STANDARD TABLE OF bapie1marart,
        lt_clientx TYPE STANDARD TABLE OF bapie1marartx,
        ls_ret     TYPE bapireturn1,
        lt_nummer  TYPE STANDARD TABLE OF bapimatinr.

  cv_ok = abap_false.
  SELECT SINGLE matnr FROM mean INTO cv_matnr
    WHERE ean11 = us_kat-ean.
  IF sy-subrc <> 0 AND us_kat-status = 'A'.
    prot us_kat-lief_artnr space 'E' 'Aenderung fuer unbekannte EAN'.
    RETURN.
  ENDIF.

  IF p_test = abap_true.
    prot us_kat-lief_artnr cv_matnr 'I' 'Testlauf: Artikel wuerde gepflegt'.
    cv_ok = abap_true.
    RETURN.
  ENDIF.

  IF cv_matnr IS INITIAL.
    CALL FUNCTION 'BAPI_MATERIAL_GETINTNUMBERRET'
      EXPORTING
        material_type   = 'HAWA'
        required_numbers = 1
      TABLES
        material_number = lt_nummer.
    cv_matnr = VALUE #( lt_nummer[ 1 ]-material OPTIONAL ).
  ENDIF.

  go_mapper->abbilden( EXPORTING is_kat     = us_kat
                       IMPORTING es_client  = ls_client
                                 es_clientx = ls_clientx ).
  ls_client-material  = cv_matnr.
  ls_clientx-material = cv_matnr.
  APPEND ls_client  TO lt_client.
  APPEND ls_clientx TO lt_clientx.

  ls_head-material     = cv_matnr.
  ls_head-matl_type    = 'HAWA'.
  ls_head-matl_group   = us_kat-warengruppe.
  ls_head-basic_view   = abap_true.
  ls_head-sales_view   = abap_true.
  ls_head-logdc_view   = abap_true.

  CALL FUNCTION 'BAPI_MATERIAL_MAINTAINDATA_RT'
    EXPORTING
      headdata    = ls_head
    IMPORTING
      return      = ls_ret
    TABLES
      clientdata  = lt_client
      clientdatax = lt_clientx.
  IF ls_ret-type CA 'EA'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    prot us_kat-lief_artnr cv_matnr 'E' ls_ret-message.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  cv_ok = abap_true.
  prot us_kat-lief_artnr cv_matnr 'S' 'Artikel gepflegt'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSLAUF_SETZEN
*&---------------------------------------------------------------------*
FORM auslauf_setzen USING us_kat TYPE ty_kat.
  SELECT SINGLE matnr FROM mean INTO @DATA(lv_matnr)
    WHERE ean11 = @us_kat-ean.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  IF p_test = abap_false.
*   direkt, BAPI kann MSTAE nicht ohne Sichtenpflege (2014)
    UPDATE mara SET mstae = 'AU'
                    laeda = sy-datum
                    aenam = sy-uname
      WHERE matnr = lv_matnr.
    prot us_kat-lief_artnr lv_matnr 'W' 'Auslaufstatus AU gesetzt'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LISTEN
*&---------------------------------------------------------------------*
*       Listung in der Vertriebslinie - asynchron (tRFC) im Listungsserver
*----------------------------------------------------------------------*
FORM listen USING uv_matnr TYPE matnr.
  CALL FUNCTION 'Z_RT_LISTUNG_ANLEGEN' IN BACKGROUND TASK
    EXPORTING
      iv_matnr = uv_matnr
      iv_vkorg = p_vkorg
      iv_vtweg = p_vtweg
      iv_lifnr = p_lifnr.
  COMMIT WORK.
ENDFORM.
