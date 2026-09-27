*----------------------------------------------------------------------*
* Include ZMM_STO_NACHSCHUB_F01 - Plan, Bedarf, Anlage
*----------------------------------------------------------------------*

FORM route_lesen.
  DATA lv_wotag TYPE p.

  CALL FUNCTION 'DAY_IN_WEEK'
    EXPORTING
      datum = p_date
    IMPORTING
      wotnr = lv_wotag.

  SELECT * FROM zmm_sto_route INTO TABLE gt_route
    WHERE werks IN s_werks
      AND wotag = lv_wotag
      AND aktiv = 'X'.
ENDFORM.

*----------------------------------------------------------------------*
FORM bedarf_ermitteln USING    ps_route TYPE zmm_sto_route
                      CHANGING pt_need  TYPE tt_need.
  TYPES: BEGIN OF ty_sales,
           matnr TYPE matnr,
           menge TYPE menge_d,
         END OF ty_sales.
  DATA: lt_sales TYPE STANDARD TABLE OF ty_sales,
        lv_best  TYPE menge_d,
        lv_offen TYPE menge_d,
        lv_verf  TYPE menge_d,
        lv_menge TYPE menge_d,
        lv_msg   TYPE char80,
        lv_text  TYPE bapi_msg.

  CLEAR pt_need.

* Nachschubrelevante Materialien der Filiale (Dispomerkmal ZN)
  SELECT matnr, minbe, mabst, bstrf, ausme
    FROM marc
    WHERE werks = @ps_route-werks
      AND dismm = 'ZN'
      AND lvorm = @space
      AND mmsta = @space
    INTO TABLE @DATA(lt_marc).
  IF lt_marc IS INITIAL.
    RETURN.
  ENDIF.

* Heutige Abverkaeufe aus dem Kassensystem (noch nicht als WA gebucht)
  CALL FUNCTION 'Z_POS_TODAY_SALES'
    DESTINATION p_dest
    EXPORTING
      iv_werks              = ps_route-werks
    TABLES
      et_sales              = lt_sales
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc <> 0.
    CLEAR lt_sales.
    lv_text = |POS { ps_route-werks }: { lv_msg }|.
    PERFORM log_meldung USING 'W' lv_text ps_route-werks.
  ENDIF.

  LOOP AT lt_marc INTO DATA(ls_marc).
*   Bestand aus Infostruktur S032 (aktueller Bestand)
    SELECT SUM( mbwbest ) FROM s032 INTO lv_best
      WHERE werks = ps_route-werks
        AND matnr = ls_marc-matnr.
*   offene Umlagerungsbestellungen aus dem Zentrallager
    SELECT SUM( p~menge ) FROM ekpo AS p
      INNER JOIN ekko AS k ON k~ebeln = p~ebeln
      INTO lv_offen
      WHERE k~bsart = 'UB'
        AND k~reswk = ps_route-reswk
        AND p~werks = ps_route-werks
        AND p~matnr = ls_marc-matnr
        AND p~elikz = space
        AND p~loekz = space.

    READ TABLE lt_sales INTO DATA(ls_sale) WITH KEY matnr = ls_marc-matnr.
    IF sy-subrc <> 0.
      CLEAR ls_sale.
    ENDIF.
    lv_verf = lv_best + lv_offen - ls_sale-menge.

    IF lv_verf >= ls_marc-minbe.
      CONTINUE.
    ENDIF.
*   auf Hoechstbestand auffuellen, auf Rundungswert aufrunden
    lv_menge = ls_marc-mabst - lv_verf.
    IF ls_marc-bstrf > 0.
      lv_menge = ceil( lv_menge / ls_marc-bstrf ) * ls_marc-bstrf.
    ENDIF.
    IF lv_menge <= 0.
      CONTINUE.
    ENDIF.
    APPEND VALUE #( matnr = ls_marc-matnr menge = lv_menge meins = ls_marc-ausme ) TO pt_need.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM nachschub_anlegen USING ps_route TYPE zmm_sto_route
                             pt_need  TYPE tt_need.
  DATA ls_res TYPE ty_result.

  ls_res-werks = ps_route-werks.
  ls_res-reswk = ps_route-reswk.
  ls_res-anz   = lines( pt_need ).

  ls_res-ebeln = go_creator->create_sto( is_route = ps_route it_need = pt_need ).
  IF ls_res-ebeln IS INITIAL.
    ls_res-text = go_creator->last_error( ).
    PERFORM log_meldung USING 'E' ls_res-text ps_route-werks.
    APPEND ls_res TO gt_result.
    RETURN.
  ENDIF.

  IF p_test = abap_true.
    ls_res-text = 'Testlauf: UB simuliert'.
    APPEND ls_res TO gt_result.
    RETURN.
  ENDIF.

  ls_res-vbeln = go_creator->create_delivery( iv_ebeln = ls_res-ebeln
                                              iv_vstel = ps_route-vstel ).
  IF ls_res-vbeln IS INITIAL.
    ls_res-text = go_creator->last_error( ).
    PERFORM log_meldung USING 'E' ls_res-text ps_route-werks.
    APPEND ls_res TO gt_result.
    RETURN.
  ENDIF.

* Sofort-WA nur fuer Filialen ohne eigene Warenannahme (Kennz. im Plan)
  IF p_wa = abap_true AND ps_route-sofort_wa = abap_true.
    ls_res-wa = go_creator->post_goods_issue( ls_res-vbeln ).
    IF ls_res-wa = abap_false.
      ls_res-text = go_creator->last_error( ).
      PERFORM log_meldung USING 'E' ls_res-text ps_route-werks.
    ENDIF.
  ENDIF.

  ls_res-text = |UB { ls_res-ebeln }, Lieferung { ls_res-vbeln }|.
  PERFORM log_meldung USING 'S' ls_res-text ps_route-werks.
  APPEND ls_res TO gt_result.
ENDFORM.
