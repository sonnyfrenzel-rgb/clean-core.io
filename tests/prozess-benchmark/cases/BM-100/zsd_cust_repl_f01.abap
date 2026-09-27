*&---------------------------------------------------------------------*
*& Include ZSD_CUST_REPL_F01 - Änderungszeiger und Stammdaten
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form COLLECT_CUSTOMERS
*&---------------------------------------------------------------------*
*& Je Kunde eine Übertragung. Alle Zeiger des Kunden werden gemerkt,
*& um sie nach erfolgreicher Übertragung zu schließen.
*&---------------------------------------------------------------------*
FORM collect_customers.
  DATA: ls_cp    TYPE bdcp,
        ls_cpmap TYPE ty_cpmap.

  LOOP AT gt_cp INTO ls_cp.
    ls_cpmap-kunnr   = ls_cp-cdobjid.
    ls_cpmap-cpident = ls_cp-cpident.
    APPEND ls_cpmap TO gt_cpmap.
    INSERT ls_cpmap-kunnr INTO TABLE gt_kunnr.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form READ_MASTER_DATA
*&---------------------------------------------------------------------*
FORM read_master_data.
  SELECT kunnr, name1, name2, land1, pstlz, ort01, stras, adrnr,
         loevm, aufsd
    FROM kna1
    FOR ALL ENTRIES IN @gt_kunnr
    WHERE kunnr = @gt_kunnr-table_line
    INTO TABLE @gt_kna1.
  IF gt_kna1 IS INITIAL.
    RETURN.
  ENDIF.

  SELECT kunnr, kdgrp, bzirk, vkbur
    FROM knvv
    FOR ALL ENTRIES IN @gt_kna1
    WHERE kunnr = @gt_kna1-kunnr
      AND vkorg = @p_vkorg
    INTO TABLE @gt_knvv.

  SELECT addrnumber, smtp_addr
    FROM adr6
    FOR ALL ENTRIES IN @gt_kna1
    WHERE addrnumber = @gt_kna1-adrnr
      AND flgdefault = @abap_true
    INTO TABLE @gt_adr6.

* Geschäftspartnernummer über CVI (falls bereits synchronisiert)
  SELECT customer, partner_guid
    FROM cvi_cust_link
    FOR ALL ENTRIES IN @gt_kna1
    WHERE customer = @gt_kna1-kunnr
    INTO TABLE @gt_link.
  IF gt_link IS INITIAL.
    RETURN.
  ENDIF.

  SELECT partner, partner_guid
    FROM but000
    FOR ALL ENTRIES IN @gt_link
    WHERE partner_guid = @gt_link-partner_guid
    INTO TABLE @gt_bp.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_PACKAGES
*&---------------------------------------------------------------------*
*& Übertragungssatz je Kunde, Pakete zu P_PACK Kunden
*&---------------------------------------------------------------------*
FORM build_packages.
  DATA: ls_rec  TYPE zcrm_s_customer,
        ls_knvv TYPE ty_knvv,
        ls_adr6 TYPE ty_adr6,
        ls_link TYPE ty_link,
        ls_bp   TYPE ty_bp.
  FIELD-SYMBOLS <ls_kna1> TYPE ty_kna1.

  CLEAR: gs_pack, gt_pack.
  gs_pack-no = 1.

  LOOP AT gt_kna1 ASSIGNING <ls_kna1>.
*   ohne Vertriebsbereich P_VKORG nicht CRM-relevant -> gilt als erledigt
    READ TABLE gt_knvv INTO ls_knvv WITH KEY kunnr = <ls_kna1>-kunnr.
    IF sy-subrc <> 0.
      INSERT <ls_kna1>-kunnr INTO TABLE gt_done.
      CONTINUE.
    ENDIF.

    CLEAR: ls_rec, ls_adr6, ls_link, ls_bp.
    ls_rec-kunnr       = <ls_kna1>-kunnr.
    ls_rec-name        = |{ <ls_kna1>-name1 } { <ls_kna1>-name2 }|.
    ls_rec-street      = <ls_kna1>-stras.
    ls_rec-postcode    = <ls_kna1>-pstlz.
    ls_rec-city        = <ls_kna1>-ort01.
    ls_rec-country     = <ls_kna1>-land1.
    ls_rec-custgroup   = ls_knvv-kdgrp.
    ls_rec-district    = ls_knvv-bzirk.
    ls_rec-salesoffice = ls_knvv-vkbur.
    ls_rec-blocked     = xsdbool( <ls_kna1>-aufsd IS NOT INITIAL ).

    READ TABLE gt_adr6 INTO ls_adr6
         WITH TABLE KEY addrnumber = <ls_kna1>-adrnr.
    ls_rec-email = ls_adr6-smtp_addr.
    READ TABLE gt_link INTO ls_link
         WITH TABLE KEY customer = <ls_kna1>-kunnr.
    READ TABLE gt_bp INTO ls_bp
         WITH TABLE KEY partner_guid = ls_link-partner_guid.
    ls_rec-bpartner = ls_bp-partner.

    IF <ls_kna1>-loevm = 'X'.
      ls_rec-action = 'D'.
    ELSE.
      ls_rec-action = 'U'.
    ENDIF.

    APPEND ls_rec TO gs_pack-recs.
    IF lines( gs_pack-recs ) >= p_pack.
      APPEND gs_pack TO gt_pack.
      CLEAR gs_pack-recs.
      gs_pack-no = gs_pack-no + 1.
    ENDIF.
  ENDLOOP.

  IF gs_pack-recs IS NOT INITIAL.
    APPEND gs_pack TO gt_pack.
  ENDIF.
ENDFORM.
