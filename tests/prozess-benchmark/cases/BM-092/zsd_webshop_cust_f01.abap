*----------------------------------------------------------------------*
***INCLUDE ZSD_WEBSHOP_CUST_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_DUPLICATE
*& 1. Suchbegriff + PLZ + Land   2. E-Mail-Adresse (ZAV)
*&---------------------------------------------------------------------*
FORM check_duplicate USING    ps_web   TYPE zsd_web_cust
                     CHANGING pv_kunnr TYPE kna1-kunnr.
  DATA lv_mcod1 TYPE kna1-mcod1.

  lv_mcod1 = ps_web-name1.
  TRANSLATE lv_mcod1 TO UPPER CASE.

  SELECT SINGLE kunnr FROM kna1 INTO pv_kunnr
    WHERE mcod1 = lv_mcod1
      AND pstlz = ps_web-pstlz
      AND land1 = ps_web-land1
      AND loevm = space.
  IF sy-subrc = 0.
    RETURN.
  ENDIF.

  IF ps_web-smtp_addr IS NOT INITIAL.
    SELECT SINGLE k~kunnr FROM kna1 AS k
      INNER JOIN adr6 AS a ON a~addrnumber = k~adrnr
      INTO pv_kunnr
      WHERE a~smtp_addr = ps_web-smtp_addr
        AND k~loevm = space.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_BDC - Mappe XD01 (Einstieg, Adresse, Steuer, BuKr, VkOrg)
*&---------------------------------------------------------------------*
FORM build_bdc USING ps_web TYPE zsd_web_cust.
  REFRESH gt_bdc.

  bdc_dynpro 'SAPMF02D' '0100'.
  bdc_field  'RF02D-KTOKD' p_ktokd.
  bdc_field  'RF02D-BUKRS' p_bukrs.
  bdc_field  'RF02D-VKORG' p_vkorg.
  bdc_field  'RF02D-VTWEG' p_vtweg.
  bdc_field  'RF02D-SPART' p_spart.
  bdc_field  'BDC_OKCODE'  '/00'.

  bdc_dynpro 'SAPMF02D' '0111'.
  bdc_field  'ADDR1_DATA-NAME1'      ps_web-name1.
  bdc_field  'ADDR1_DATA-SORT1'      ps_web-name1.
  bdc_field  'ADDR1_DATA-STREET'     ps_web-street.
  bdc_field  'ADDR1_DATA-HOUSE_NUM1' ps_web-house_num.
  bdc_field  'ADDR1_DATA-POST_CODE1' ps_web-pstlz.
  bdc_field  'ADDR1_DATA-CITY1'      ps_web-city.
  bdc_field  'ADDR1_DATA-COUNTRY'    ps_web-land1.
  bdc_field  'ADDR1_DATA-LANGU'      'DE'.
  bdc_field  'SZA1_D0100-SMTP_ADDR'  ps_web-smtp_addr.
  bdc_field  'BDC_OKCODE'            '=VW'.

  bdc_dynpro 'SAPMF02D' '0120'.
  bdc_field  'KNA1-STCEG'  ps_web-stceg.
  bdc_field  'BDC_OKCODE'  '=VW'.

  bdc_dynpro 'SAPMF02D' '0210'.
  bdc_field  'KNB1-AKONT'  p_akont.
  bdc_field  'KNB1-ZUAWA'  '009'.
  bdc_field  'BDC_OKCODE'  '=VW'.

  bdc_dynpro 'SAPMF02D' '0215'.
  bdc_field  'KNB1-ZTERM'  'ZV00'.       "Vorkasse für Webshop-Kunden
  bdc_field  'BDC_OKCODE'  '=VW'.

  bdc_dynpro 'SAPMF02D' '0310'.
  bdc_field  'KNVV-WAERS'  'EUR'.
  bdc_field  'KNVV-KALKS'  '1'.
  bdc_field  'BDC_OKCODE'  '=VW'.

  bdc_dynpro 'SAPMF02D' '1350'.
  bdc_field  'KNVI-TAXKD(01)' '1'.
  bdc_field  'BDC_OKCODE'  '=UPDA'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form GET_ERROR_TEXT - erste Fehlermeldung der Mappe als Text
*&---------------------------------------------------------------------*
FORM get_error_text CHANGING pv_text TYPE c.
  CLEAR pv_text.
  READ TABLE gt_msg INTO gs_msg WITH KEY msgtyp = 'E'.
  IF sy-subrc <> 0.
    READ TABLE gt_msg INTO gs_msg INDEX lines( gt_msg ).
  ENDIF.
  CALL FUNCTION 'FORMAT_MESSAGE'
    EXPORTING
      id        = gs_msg-msgid
      lang      = sy-langu
      no        = gs_msg-msgnr
      v1        = gs_msg-msgv1
      v2        = gs_msg-msgv2
      v3        = gs_msg-msgv3
      v4        = gs_msg-msgv4
    IMPORTING
      msg       = pv_text
    EXCEPTIONS
      not_found = 1
      OTHERS    = 2.
ENDFORM.
