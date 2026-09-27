*&---------------------------------------------------------------------*
*& Include ZPP_MES_FILE_F02 - Import Rueckmeldungen/Wareneingaenge
*&---------------------------------------------------------------------*
FORM import.
  DATA: lv_file TYPE string,
        lv_line TYPE string,
        lt_in   TYPE STANDARD TABLE OF string,
        ls_satz TYPE ty_satz.

  lv_file = |{ p_pfad }in/RM_{ p_werks }.csv|.
  OPEN DATASET lv_file FOR INPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    mes_log 'I' 'Import: keine Rueckmeldedatei vorhanden'.
    RETURN.
  ENDIF.

  DO.
    READ DATASET lv_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    APPEND lv_line TO lt_in.
  ENDDO.
  CLOSE DATASET lv_file.

  LOOP AT lt_in INTO lv_line.
    CLEAR ls_satz.
    SPLIT lv_line AT ';' INTO ls_satz-typ ls_satz-mesid ls_satz-aufnr ls_satz-vornr
                              ls_satz-menge ls_satz-aus ls_satz-meinh
                              ls_satz-lgort ls_satz-charg ls_satz-endrm.
    ls_satz-aufnr = |{ ls_satz-aufnr ALPHA = IN }|.

    CASE ls_satz-typ.
      WHEN 'R'.
        PERFORM rueckmeldung USING ls_satz.
      WHEN 'G'.
        PERFORM wareneingang USING ls_satz.
      WHEN OTHERS.
        gv_text = |Import: unbekannte Satzart { ls_satz-typ } ({ ls_satz-mesid })|.
        mes_log 'E' gv_text.
    ENDCASE.
  ENDLOOP.

  PERFORM archivieren USING lv_file lt_in.
ENDFORM.

*&---------------------------------------------------------------------*
*& Satzart R: Vorgangsrueckmeldung
*&---------------------------------------------------------------------*
FORM rueckmeldung USING is_satz TYPE ty_satz.
  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
        ls_tt     TYPE bapi_pp_timeticket,
        ls_return TYPE bapiret1,
        lt_detail TYPE STANDARD TABLE OF bapi_coru_return,
        lv_ltxa1  TYPE co_rtext,
        lv_rueck  TYPE co_rueck.

  lv_ltxa1 = |MES { is_satz-mesid }|.

* Dublette: gleiche MES-ID schon als (nicht stornierte) Rueckmeldung da?
  SELECT SINGLE rueck FROM afru INTO lv_rueck
    WHERE aufnr = is_satz-aufnr
      AND ltxa1 = lv_ltxa1
      AND stokz = space.
  IF sy-subrc = 0.
    gv_text = |R { is_satz-mesid }: bereits gebucht|.
    mes_log 'W' gv_text.
    RETURN.
  ENDIF.

  ls_tt-orderid        = is_satz-aufnr.
  ls_tt-operation      = is_satz-vornr.
  ls_tt-yield          = is_satz-menge.
  ls_tt-scrap          = is_satz-aus.
  ls_tt-conf_quan_unit = is_satz-meinh.
  ls_tt-fin_conf       = is_satz-endrm.
  ls_tt-conf_text      = lv_ltxa1.
  APPEND ls_tt TO lt_tt.

  CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
    IMPORTING
      return        = ls_return
    TABLES
      timetickets   = lt_tt
      detail_return = lt_detail.

  IF ls_return-type CA 'EA' OR line_exists( lt_detail[ type = 'E' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    gv_text = |R { is_satz-mesid }: { ls_return-message }|.
    mes_log 'E' gv_text.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    gv_text = |R { is_satz-mesid }: Auftrag { is_satz-aufnr } Vorgang { is_satz-vornr } gebucht|.
    mes_log 'S' gv_text.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Satzart G: Wareneingang zum Fertigungsauftrag (101)
*&---------------------------------------------------------------------*
FORM wareneingang USING is_satz TYPE ty_satz.
  DATA: ls_head   TYPE bapi2017_gm_head_01,
        ls_code   TYPE bapi2017_gm_code,
        lt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        ls_item   TYPE bapi2017_gm_item_create,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        lv_mblnr  TYPE mblnr,
        lv_mjahr  TYPE mjahr.

* Dublette ueber Referenzbeleg = MES-ID
  SELECT SINGLE m~mblnr
    INTO lv_mblnr
    FROM mkpf AS m
    INNER JOIN mseg AS s ON s~mblnr = m~mblnr AND s~mjahr = m~mjahr
    WHERE m~xblnr = is_satz-mesid
      AND s~aufnr = is_satz-aufnr
      AND s~bwart = '101'.
  IF sy-subrc = 0.
    gv_text = |G { is_satz-mesid }: bereits gebucht ({ lv_mblnr })|.
    mes_log 'W' gv_text.
    RETURN.
  ENDIF.

  ls_head-pstng_date = sy-datum.
  ls_head-doc_date   = sy-datum.
  ls_head-ref_doc_no = is_satz-mesid.
  ls_code-gm_code    = '02'.

  ls_item-orderid   = is_satz-aufnr.
  ls_item-move_type = '101'.
  ls_item-mvt_ind   = 'F'.
  ls_item-plant     = p_werks.
  ls_item-stge_loc  = is_satz-lgort.
  ls_item-batch     = is_satz-charg.
  ls_item-entry_qnt = is_satz-menge.
  ls_item-entry_uom = is_satz-meinh.
  APPEND ls_item TO lt_item.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = ls_code
    IMPORTING
      materialdocument = lv_mblnr
      matdocumentyear  = lv_mjahr
    TABLES
      goodsmvt_item    = lt_item
      return           = lt_return.

  IF lv_mblnr IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    READ TABLE lt_return INTO DATA(ls_ret) WITH KEY type = 'E'.
    gv_text = |G { is_satz-mesid }: { ls_ret-message }|.
    mes_log 'E' gv_text.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    gv_text = |G { is_satz-mesid }: Materialbeleg { lv_mblnr }/{ lv_mjahr }|.
    mes_log 'S' gv_text.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Eingangsdatei ins Archiv verschieben
*&---------------------------------------------------------------------*
FORM archivieren USING iv_file TYPE string
                       it_in   TYPE STANDARD TABLE.
  DATA: lv_arch TYPE string,
        lv_line TYPE string.

  lv_arch = |{ p_pfad }archiv/RM_{ p_werks }_{ sy-datum }{ sy-uzeit }.csv|.
  OPEN DATASET lv_arch FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    mes_log 'E' 'Import: Archivdatei nicht schreibbar - Eingang bleibt liegen'.
    RETURN.
  ENDIF.

  LOOP AT it_in INTO lv_line.
    TRANSFER lv_line TO lv_arch.
  ENDLOOP.
  CLOSE DATASET lv_arch.

  DELETE DATASET iv_file.
  IF sy-subrc <> 0.
    mes_log 'W' 'Import: Eingangsdatei konnte nicht geloescht werden'.
  ENDIF.
ENDFORM.
