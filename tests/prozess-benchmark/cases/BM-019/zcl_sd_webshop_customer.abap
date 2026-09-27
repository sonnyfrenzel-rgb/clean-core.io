CLASS zcl_sd_webshop_customer DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Auftraggeber für Webshop-Bestellungen ermitteln oder anlegen
*  - Shopkonto mit hinterlegter Kundennummer -> Bestandskunde
*  - sonst Suche über die E-Mail-Adresse (Kontengruppe ZWEB)
*  - sonst Neuanlage nach Vorlagekunde WEBVORLAGE
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING is_header TYPE zsd_s_web_header.
    METHODS get_or_create
      RETURNING VALUE(rv_kunnr) TYPE kunnr
      RAISING   zcx_sd_webshop.

  PRIVATE SECTION.
    CONSTANTS: c_ref_kunnr TYPE kunnr VALUE 'WEBVORLAGE',
               c_bukrs     TYPE bukrs VALUE '1000',
               c_vkorg     TYPE vkorg VALUE '1000',
               c_vtweg     TYPE vtweg VALUE '30',
               c_spart     TYPE spart VALUE '00',
               c_ktokd     TYPE ktokd VALUE 'ZWEB'.

    DATA ms_header TYPE zsd_s_web_header.

    METHODS find_by_email
      RETURNING VALUE(rv_kunnr) TYPE kunnr.
    METHODS check_sales_area
      IMPORTING iv_kunnr TYPE kunnr
      RAISING   zcx_sd_webshop.
    METHODS create_customer
      RETURNING VALUE(rv_kunnr) TYPE kunnr
      RAISING   zcx_sd_webshop.
ENDCLASS.



CLASS zcl_sd_webshop_customer IMPLEMENTATION.

  METHOD constructor.
    ms_header = is_header.
  ENDMETHOD.


  METHOD get_or_create.
    IF ms_header-kunnr IS NOT INITIAL.
      rv_kunnr = ms_header-kunnr.
    ELSE.
      rv_kunnr = find_by_email( ).
    ENDIF.

    IF rv_kunnr IS INITIAL.
      rv_kunnr = create_customer( ).
    ELSE.
      check_sales_area( rv_kunnr ).
    ENDIF.
  ENDMETHOD.


  METHOD find_by_email.
    DATA lv_such TYPE ad_smtp_srch.

*   Suchfeld SMTP_SRCH: Großbuchstaben, 20 Stellen
    lv_such = to_upper( ms_header-email ).

    SELECT k~kunnr
      FROM kna1 AS k
      INNER JOIN adr6 AS a ON a~addrnumber = k~adrnr
      INTO rv_kunnr
      UP TO 1 ROWS
      WHERE a~smtp_srch = lv_such
        AND k~ktokd     = c_ktokd
        AND k~loevm     = space.
    ENDSELECT.
  ENDMETHOD.


  METHOD check_sales_area.
    DATA lv_aufsd TYPE knvv-aufsd.

    SELECT SINGLE aufsd FROM knvv INTO lv_aufsd
      WHERE kunnr = iv_kunnr
        AND vkorg = c_vkorg
        AND vtweg = c_vtweg
        AND spart = c_spart.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_webshop
        EXPORTING textid = zcx_sd_webshop=>no_sales_area
                  kunnr  = iv_kunnr.
    ENDIF.

    IF lv_aufsd IS NOT INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_webshop
        EXPORTING textid = zcx_sd_webshop=>customer_blocked
                  kunnr  = iv_kunnr.
    ENDIF.
  ENDMETHOD.


  METHOD create_customer.
    DATA: ls_kna1 TYPE kna1,
          ls_knb1 TYPE knb1,
          ls_knvv TYPE knvv,
          ls_addr TYPE bapiaddr1.

*   Vorlagekunde liefert Kontengruppe, Buchungskreis- und Vertriebsdaten
    SELECT SINGLE * FROM kna1 INTO ls_kna1 WHERE kunnr = c_ref_kunnr.
    SELECT SINGLE * FROM knb1 INTO ls_knb1
      WHERE kunnr = c_ref_kunnr
        AND bukrs = c_bukrs.
    SELECT SINGLE * FROM knvv INTO ls_knvv
      WHERE kunnr = c_ref_kunnr
        AND vkorg = c_vkorg
        AND vtweg = c_vtweg
        AND spart = c_spart.
    IF ls_kna1 IS INITIAL OR ls_knb1 IS INITIAL OR ls_knvv IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_webshop
        EXPORTING textid = zcx_sd_webshop=>template_missing.
    ENDIF.

    CLEAR: ls_kna1-kunnr, ls_kna1-adrnr, ls_knb1-kunnr, ls_knvv-kunnr.
    ls_kna1-name1 = ms_header-name.
    ls_kna1-stras = ms_header-street.
    ls_kna1-pstlz = ms_header-postcode.
    ls_kna1-ort01 = ms_header-city.
    ls_kna1-land1 = ms_header-country.

    ls_addr-name       = ms_header-name.
    ls_addr-street     = ms_header-street.
    ls_addr-postl_cod1 = ms_header-postcode.
    ls_addr-city       = ms_header-city.
    ls_addr-country    = ms_header-country.
    ls_addr-e_mail     = ms_header-email.
    ls_addr-langu      = sy-langu.

    CALL FUNCTION 'SD_CUSTOMER_MAINTAIN_ALL'
      EXPORTING
        i_kna1      = ls_kna1
        i_knb1      = ls_knb1
        i_knvv      = ls_knvv
        i_bapiaddr1 = ls_addr
        pi_postflag = abap_true
      IMPORTING
        e_kunnr     = rv_kunnr
      EXCEPTIONS
        OTHERS      = 1.
    IF sy-subrc <> 0 OR rv_kunnr IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_webshop
        EXPORTING textid = zcx_sd_webshop=>customer_create_failed.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
