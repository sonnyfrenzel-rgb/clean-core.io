*&---------------------------------------------------------------------*
*& Include ZPP_MASS_RELEASE_F01 - Selektion und Paketbildung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Freizugebende Auftraege: Werk, Art, Fertigungssteuerer, Eckstart,
*& Status EROF aktiv, keine Loeschvormerkung
*&---------------------------------------------------------------------*
FORM selektieren.
  DATA: lt_kand   TYPE tt_order,
        ls_kand   TYPE ty_order,
        lt_status TYPE STANDARD TABLE OF jstat,
        lv_erof   TYPE abap_bool,
        lv_lvm    TYPE abap_bool.

  SELECT a~aufnr a~objnr k~gstrp
    INTO TABLE lt_kand
    FROM aufk AS a
    INNER JOIN afko AS k ON k~aufnr = a~aufnr
    WHERE a~werks =  p_werks
      AND a~auart =  p_auart
      AND a~aufnr IN s_aufnr
      AND k~fevor IN s_fevor
      AND k~gstrp <= p_bis.

  LOOP AT lt_kand INTO ls_kand.
    CLEAR: lt_status, lv_erof, lv_lvm.
    CALL FUNCTION 'STATUS_READ'
      EXPORTING
        objnr            = ls_kand-objnr
        only_active      = 'X'
      TABLES
        status           = lt_status
      EXCEPTIONS
        object_not_found = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

    READ TABLE lt_status TRANSPORTING NO FIELDS WITH KEY stat = 'I0001'.
    IF sy-subrc = 0.
      lv_erof = abap_true.
    ENDIF.
*   Ticket 4711: Loeschvormerkung (LOVM) nicht freigeben
    READ TABLE lt_status TRANSPORTING NO FIELDS WITH KEY stat = 'I0076'.
    IF sy-subrc = 0.
      lv_lvm = abap_true.
    ENDIF.

    IF lv_erof = abap_true AND lv_lvm = abap_false.
      APPEND ls_kand TO gt_orders.
    ENDIF.
  ENDLOOP.

  SORT gt_orders BY gstrp aufnr.
ENDFORM.

*&---------------------------------------------------------------------*
*& Pakete zu je P_PAKET Auftraegen bilden
*&---------------------------------------------------------------------*
FORM pakete_bilden.
  DATA: ls_order TYPE ty_order,
        ls_aufnr TYPE zpp_s_aufnr,
        lv_nr    TYPE i.

  CLEAR: gt_pakete, gs_paket.
  LOOP AT gt_orders INTO ls_order.
    ls_aufnr-aufnr = ls_order-aufnr.
    APPEND ls_aufnr TO gs_paket-orders.
    IF lines( gs_paket-orders ) >= p_paket.
      lv_nr = lv_nr + 1.
      gs_paket-nr = lv_nr.
      APPEND gs_paket TO gt_pakete.
      CLEAR gs_paket.
    ENDIF.
  ENDLOOP.

* Rest
  IF gs_paket-orders IS NOT INITIAL.
    lv_nr = lv_nr + 1.
    gs_paket-nr = lv_nr.
    APPEND gs_paket TO gt_pakete.
  ENDIF.
ENDFORM.
