*&---------------------------------------------------------------------*
*& Include MZPP_WERKERF01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Barcode zerlegen, Auftrag und Vorgang lesen und pruefen
*&---------------------------------------------------------------------*
FORM auftrag_lesen.
  DATA: lv_aufnr TYPE aufnr,
        lv_vornr TYPE vornr,
        lv_mgvrg TYPE mgvrg,
        lv_lmnga TYPE ru_lmnga,
        lv_arbid TYPE cr_objid,
        lv_maxvo TYPE vornr.

  gv_ok = abap_false.
  CLEAR zpp_s_rm.

  SPLIT gv_scan AT '/' INTO lv_aufnr lv_vornr.
  lv_aufnr = |{ lv_aufnr ALPHA = IN }|.
  lv_vornr = |{ lv_vornr ALPHA = IN }|.

  SELECT SINGLE k~aufpl p~matnr p~psmng p~amein p~pwerk p~lgort a~objnr
    INTO (gv_aufpl, zpp_s_rm-matnr, gv_psmng,
          zpp_s_rm-meinh, gv_werks, gv_lgort, gv_objnr)
    FROM afko AS k
    INNER JOIN afpo AS p ON p~aufnr = k~aufnr
    INNER JOIN aufk AS a ON a~aufnr = k~aufnr
    WHERE k~aufnr = lv_aufnr.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  zpp_s_rm-aufnr = lv_aufnr.

* nur freigegebene, nicht technisch abgeschlossene Auftraege
  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = gv_objnr
      status            = 'I0002'
    EXCEPTIONS
      object_not_found  = 1
      status_not_active = 2
      OTHERS            = 3.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  SELECT SINGLE c~aplzl c~arbid v~mgvrg v~lmnga
    INTO (gv_aplzl, lv_arbid, lv_mgvrg, lv_lmnga)
    FROM afvc AS c
    INNER JOIN afvv AS v ON v~aufpl = c~aufpl AND v~aplzl = c~aplzl
    WHERE c~aufpl = gv_aufpl
      AND c~vornr = lv_vornr.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  zpp_s_rm-vornr = lv_vornr.
  zpp_s_rm-offen = lv_mgvrg - lv_lmnga.

  SELECT SINGLE arbpl FROM crhd INTO zpp_s_rm-arbpl
    WHERE objty = 'A'
      AND objid = lv_arbid.
  SELECT SINGLE maktx FROM makt INTO zpp_s_rm-maktx
    WHERE matnr = zpp_s_rm-matnr
      AND spras = sy-langu.

* letzter Vorgang = hoechste Vorgangsnummer im Plan
  SELECT MAX( vornr ) FROM afvc INTO lv_maxvo
    WHERE aufpl = gv_aufpl.
  gv_letzter = xsdbool( lv_maxvo = lv_vornr ).

  gv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Retrograd zu entnehmende Komponenten des Vorgangs
*&---------------------------------------------------------------------*
FORM komponenten_lesen.
  CLEAR gt_komp.

  SELECT rsnum rspos matnr werks lgort charg bdmng meins
    INTO CORRESPONDING FIELDS OF TABLE gt_komp
    FROM resb
    WHERE aufnr = zpp_s_rm-aufnr
      AND vornr = zpp_s_rm-vornr
      AND rgekz = 'X'
      AND xloek = space.
ENDFORM.

*&---------------------------------------------------------------------*
*& Rueckmeldung mit Warenbewegungen buchen
*&---------------------------------------------------------------------*
FORM rueckmelden.
  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
        ls_tt     TYPE bapi_pp_timeticket,
        lt_gm     TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        ls_gm     TYPE bapi2017_gm_item_create,
        lt_link   TYPE STANDARD TABLE OF bapi_link_conf_goodsmov,
        ls_link   TYPE bapi_link_conf_goodsmov,
        ls_return TYPE bapiret1,
        lt_detail TYPE STANDARD TABLE OF bapi_coru_return,
        lv_index  TYPE i.

  gv_ok = abap_false.

  ls_tt-orderid        = zpp_s_rm-aufnr.
  ls_tt-operation      = zpp_s_rm-vornr.
  ls_tt-yield          = zpp_s_rm-gutmenge.
  ls_tt-scrap          = zpp_s_rm-ausschuss.
  ls_tt-conf_quan_unit = zpp_s_rm-meinh.
  ls_tt-dev_reason     = zpp_s_rm-grund.
  ls_tt-fin_conf       = zpp_s_rm-endrm.
  ls_tt-conf_text      = |Terminal PNR { gv_pernr }|.
  ls_tt-pers_no        = gv_pernr.
  APPEND ls_tt TO lt_tt.

* Komponentenverbrauch 261 anteilig zur rueckgemeldeten Menge
  LOOP AT gt_komp INTO gs_komp.
    CLEAR ls_gm.
    ls_gm-material   = gs_komp-matnr.
    ls_gm-plant      = gs_komp-werks.
    ls_gm-stge_loc   = gs_komp-lgort.
    ls_gm-batch      = gs_komp-charg.
    ls_gm-move_type  = '261'.
    ls_gm-orderid    = zpp_s_rm-aufnr.
    ls_gm-reserv_no  = gs_komp-rsnum.
    ls_gm-res_item   = gs_komp-rspos.
    ls_gm-entry_uom  = gs_komp-meins.
    ls_gm-entry_qnt  = gs_komp-bdmng
                     * ( zpp_s_rm-gutmenge + zpp_s_rm-ausschuss ) / gv_psmng.
    APPEND ls_gm TO lt_gm.
    lv_index = lv_index + 1.
    ls_link-index_confirm  = 1.
    ls_link-index_goodsmov = lv_index.
    APPEND ls_link TO lt_link.
  ENDLOOP.

* Wareneingang 101 fuer die Gutmenge nur im letzten Vorgang
  IF gv_letzter = abap_true AND zpp_s_rm-gutmenge > 0.
    CLEAR ls_gm.
    ls_gm-material  = zpp_s_rm-matnr.
    ls_gm-plant     = gv_werks.
    ls_gm-stge_loc  = gv_lgort.
    ls_gm-move_type = '101'.
    ls_gm-mvt_ind   = 'F'.
    ls_gm-orderid   = zpp_s_rm-aufnr.
    ls_gm-entry_qnt = zpp_s_rm-gutmenge.
    ls_gm-entry_uom = zpp_s_rm-meinh.
    APPEND ls_gm TO lt_gm.
    lv_index = lv_index + 1.
    ls_link-index_confirm  = 1.
    ls_link-index_goodsmov = lv_index.
    APPEND ls_link TO lt_link.
  ENDIF.

  CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
    IMPORTING
      return             = ls_return
    TABLES
      timetickets        = lt_tt
      goodsmovements     = lt_gm
      link_conf_goodsmov = lt_link
      detail_return      = lt_detail.

  READ TABLE lt_detail INTO DATA(ls_detail) INDEX 1.
  IF ls_return-type CA 'EA' OR ls_detail-type CA 'EA'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    MESSAGE COND string( WHEN ls_detail-message IS NOT INITIAL
                         THEN ls_detail-message
                         ELSE ls_return-message ) TYPE 'I' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  gv_rueck = ls_detail-conf_no.
  gv_ok    = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Palettenetikett drucken (Formular ZPP_ETIKETT, Drucker aus Terminal)
*&---------------------------------------------------------------------*
FORM etikett_drucken.
  CALL FUNCTION 'Z_PP_ETIKETT_DRUCKEN'
    EXPORTING
      iv_aufnr = zpp_s_rm-aufnr
      iv_matnr = zpp_s_rm-matnr
      iv_menge = zpp_s_rm-gutmenge
      iv_meinh = zpp_s_rm-meinh
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE i040.
  ENDIF.
ENDFORM.
