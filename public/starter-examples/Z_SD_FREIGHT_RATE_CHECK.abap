*&---------------------------------------------------------------------*
*& Report  Z_SD_FREIGHT_RATE_CHECK
*& Freight charge check before goods issue
*&---------------------------------------------------------------------*
*& Fictional but realistic SD/LE example for Clean-Core.io:
*& outbound deliveries of one shipping point are weighed, the freight
*& charge is calculated from the internal rate card and compared with
*& the quote of the external carrier system (RFC destination).
*& Deliveries whose quote deviates too far are blocked for review.
*& Synthetic input only - not for productive SAP import.
*&---------------------------------------------------------------------*
REPORT z_sd_freight_rate_check.

TABLES: likp, lips, kna1, mara, zsd_freight_rate, zsd_freight_log.

TYPE-POOLS: abap.

CONSTANTS: c_carrier_dest   TYPE rfcdest VALUE 'CARRIER_GATEWAY',
           c_home_country   TYPE land1   VALUE 'DE',
           c_home_currency  TYPE waers   VALUE 'EUR',
           c_express_cond   TYPE vsbed   VALUE '01',
           c_volume_factor  TYPE p LENGTH 7 DECIMALS 2 VALUE '250.00',
           c_fuel_pct       TYPE p LENGTH 5 DECIMALS 2 VALUE '12.50',
           c_express_pct    TYPE p LENGTH 5 DECIMALS 2 VALUE '35.00',
           c_dg_surcharge   TYPE p LENGTH 9 DECIMALS 2 VALUE '45.00',
           c_parcel_max_kg  TYPE p LENGTH 9 DECIMALS 3 VALUE '2500.000',
           c_tolerance_ok   TYPE p LENGTH 5 DECIMALS 2 VALUE '5.00',
           c_tolerance_max  TYPE p LENGTH 5 DECIMALS 2 VALUE '15.00'.

TYPES: BEGIN OF ty_delivery,
         vbeln TYPE likp-vbeln,
         vstel TYPE likp-vstel,
         kunnr TYPE likp-kunnr,
         wadat TYPE likp-wadat,
         vsbed TYPE likp-vsbed,
         btgew TYPE likp-btgew,
         gewei TYPE likp-gewei,
         volum TYPE likp-volum,
         voleh TYPE likp-voleh,
       END OF ty_delivery.

TYPES: BEGIN OF ty_result,
         vbeln         TYPE likp-vbeln,
         zone          TYPE char3,
         service       TYPE char3,
         dangerous     TYPE abap_bool,
         gross_kg      TYPE p LENGTH 13 DECIMALS 3,
         volume_kg     TYPE p LENGTH 13 DECIMALS 3,
         chargeable_kg TYPE p LENGTH 13 DECIMALS 3,
         expected      TYPE p LENGTH 13 DECIMALS 2,
         quote         TYPE p LENGTH 13 DECIMALS 2,
         quote_curr    TYPE waers,
         deviation_pct TYPE p LENGTH 7 DECIMALS 2,
         status        TYPE char10,
         reason        TYPE char80,
       END OF ty_result.

DATA: gt_deliveries TYPE STANDARD TABLE OF ty_delivery WITH DEFAULT KEY,
      gt_results    TYPE STANDARD TABLE OF ty_result WITH DEFAULT KEY,
      gv_date_to    TYPE likp-wadat,
      gv_blocked    TYPE i,
      gv_review     TYPE i.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE text-001.
PARAMETERS: p_vstel TYPE likp-vstel OBLIGATORY DEFAULT '1000',
            p_carr  TYPE char10 OBLIGATORY DEFAULT 'FWD-0042',
            p_days  TYPE i OBLIGATORY DEFAULT 3,
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECT-OPTIONS: s_vbeln FOR likp-vbeln.
SELECTION-SCREEN END OF BLOCK b01.

START-OF-SELECTION.
  PERFORM check_authority.
  PERFORM read_deliveries.
  IF gt_deliveries IS INITIAL.
    MESSAGE 'No open deliveries for this shipping point' TYPE 'S'.
    RETURN.
  ENDIF.
  PERFORM check_deliveries.
  IF p_test = abap_false.
    PERFORM save_log.
  ENDIF.
  PERFORM write_result_list.

*&---------------------------------------------------------------------*
*&      Form  CHECK_AUTHORITY
*&---------------------------------------------------------------------*
FORM check_authority.
  "Shipping clerks may only check their own shipping point
  AUTHORITY-CHECK OBJECT 'V_LIKP_VST'
    ID 'VSTEL' FIELD p_vstel
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    MESSAGE 'No authorization for this shipping point' TYPE 'E'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  READ_DELIVERIES
*&---------------------------------------------------------------------*
FORM read_deliveries.
  gv_date_to = sy-datum + p_days.

  SELECT vbeln vstel kunnr wadat vsbed btgew gewei volum voleh
    FROM likp
    INTO TABLE gt_deliveries
    WHERE vstel = p_vstel
      AND vbeln IN s_vbeln
      AND wadat <= gv_date_to
      AND wbstk <> 'C'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_DELIVERIES
*&---------------------------------------------------------------------*
FORM check_deliveries.
  DATA ls_result TYPE ty_result.
  FIELD-SYMBOLS <ls_delivery> TYPE ty_delivery.

  LOOP AT gt_deliveries ASSIGNING <ls_delivery>.
    CLEAR ls_result.
    ls_result-vbeln = <ls_delivery>-vbeln.

    PERFORM determine_zone USING <ls_delivery> CHANGING ls_result.
    PERFORM determine_service USING <ls_delivery> CHANGING ls_result.
    PERFORM check_dangerous_goods USING <ls_delivery> CHANGING ls_result.
    PERFORM calculate_weight USING <ls_delivery> CHANGING ls_result.

    "Above the parcel limit the carrier does not quote - full truck load
    IF ls_result-chargeable_kg > c_parcel_max_kg.
      ls_result-status = 'MANUAL'.
      ls_result-reason = 'Above parcel limit - book a full truck load'.
      APPEND ls_result TO gt_results.
      CONTINUE.
    ENDIF.

    PERFORM calculate_expected_charge CHANGING ls_result.
    IF ls_result-status IS NOT INITIAL.
      APPEND ls_result TO gt_results.
      CONTINUE.
    ENDIF.

    PERFORM request_carrier_quote CHANGING ls_result.
    PERFORM rate_deviation CHANGING ls_result.
    APPEND ls_result TO gt_results.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DETERMINE_ZONE
*&---------------------------------------------------------------------*
FORM determine_zone USING is_delivery TYPE ty_delivery
                 CHANGING cs_result TYPE ty_result.
  DATA lv_land1 TYPE kna1-land1.

  SELECT SINGLE land1 FROM kna1 INTO lv_land1
    WHERE kunnr = is_delivery-kunnr.

  "Rate card zones: home market, EU single market, rest of the world
  CASE lv_land1.
    WHEN c_home_country.
      cs_result-zone = 'DOM'.
    WHEN 'AT' OR 'BE' OR 'CZ' OR 'DK' OR 'ES' OR 'FR' OR 'IT' OR 'NL' OR 'PL'.
      cs_result-zone = 'EU'.
    WHEN OTHERS.
      cs_result-zone = 'INT'.
  ENDCASE.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DETERMINE_SERVICE
*&---------------------------------------------------------------------*
FORM determine_service USING is_delivery TYPE ty_delivery
                    CHANGING cs_result TYPE ty_result.
  "Shipping condition 01 is the express service agreed with the customer
  IF is_delivery-vsbed = c_express_cond.
    cs_result-service = 'EXP'.
  ELSE.
    cs_result-service = 'STD'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_DANGEROUS_GOODS
*&---------------------------------------------------------------------*
FORM check_dangerous_goods USING is_delivery TYPE ty_delivery
                        CHANGING cs_result TYPE ty_result.
  DATA lt_matnr TYPE STANDARD TABLE OF lips-matnr WITH DEFAULT KEY.
  DATA lv_profl TYPE mara-profl.
  DATA lv_matnr TYPE lips-matnr.

  SELECT matnr FROM lips INTO TABLE lt_matnr
    WHERE vbeln = is_delivery-vbeln.

  "One item with a dangerous goods profile makes the whole shipment DG
  LOOP AT lt_matnr INTO lv_matnr.
    SELECT SINGLE profl FROM mara INTO lv_profl
      WHERE matnr = lv_matnr.
    IF lv_profl IS NOT INITIAL.
      cs_result-dangerous = abap_true.
      EXIT.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CALCULATE_WEIGHT
*&---------------------------------------------------------------------*
FORM calculate_weight USING is_delivery TYPE ty_delivery
                   CHANGING cs_result TYPE ty_result.
  DATA lv_volume_m3 TYPE p LENGTH 13 DECIMALS 3.

  "Gross weight in kilograms
  IF is_delivery-gewei = 'G'.
    cs_result-gross_kg = is_delivery-btgew / 1000.
  ELSEIF is_delivery-gewei = 'TO'.
    cs_result-gross_kg = is_delivery-btgew * 1000.
  ELSE.
    cs_result-gross_kg = is_delivery-btgew.
  ENDIF.

  "Volume in cubic metres
  IF is_delivery-voleh = 'CCM'.
    lv_volume_m3 = is_delivery-volum / 1000000.
  ELSEIF is_delivery-voleh = 'L'.
    lv_volume_m3 = is_delivery-volum / 1000.
  ELSE.
    lv_volume_m3 = is_delivery-volum.
  ENDIF.

  "Carriers charge the higher of real and volumetric weight
  cs_result-volume_kg = lv_volume_m3 * c_volume_factor.
  IF cs_result-volume_kg > cs_result-gross_kg.
    cs_result-chargeable_kg = cs_result-volume_kg.
  ELSE.
    cs_result-chargeable_kg = cs_result-gross_kg.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CALCULATE_EXPECTED_CHARGE
*&---------------------------------------------------------------------*
FORM calculate_expected_charge CHANGING cs_result TYPE ty_result.
  DATA ls_rate TYPE zsd_freight_rate.
  DATA lv_charge TYPE p LENGTH 13 DECIMALS 2.

  SELECT SINGLE * FROM zsd_freight_rate INTO ls_rate
    WHERE carrier    = p_carr
      AND zone       = cs_result-zone
      AND valid_from <= sy-datum
      AND valid_to   >= sy-datum.
  IF sy-subrc <> 0.
    cs_result-status = 'NO_RATE'.
    cs_result-reason = 'No valid rate card entry for carrier and zone'.
    RETURN.
  ENDIF.

  lv_charge = cs_result-chargeable_kg * ls_rate-rate_per_kg.

  "The rate card sets a minimum charge per shipment
  IF lv_charge < ls_rate-min_charge.
    lv_charge = ls_rate-min_charge.
  ENDIF.

  IF cs_result-service = 'EXP'.
    lv_charge = lv_charge + lv_charge * c_express_pct / 100.
  ENDIF.

  "Fuel surcharge is applied after the express uplift
  lv_charge = lv_charge + lv_charge * c_fuel_pct / 100.

  IF cs_result-dangerous = abap_true.
    lv_charge = lv_charge + c_dg_surcharge.
  ENDIF.

  cs_result-expected = lv_charge.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  REQUEST_CARRIER_QUOTE
*&---------------------------------------------------------------------*
FORM request_carrier_quote CHANGING cs_result TYPE ty_result.
  DATA lv_rfc_msg TYPE char80.

  "The carrier's rating system is reached through the carrier gateway
  CALL FUNCTION 'Z_CARRIER_RATE_QUOTE'
    DESTINATION c_carrier_dest
    EXPORTING
      iv_carrier   = p_carr
      iv_zone      = cs_result-zone
      iv_service   = cs_result-service
      iv_weight_kg = cs_result-chargeable_kg
      iv_dangerous = cs_result-dangerous
    IMPORTING
      ev_amount    = cs_result-quote
      ev_currency  = cs_result-quote_curr
    EXCEPTIONS
      system_failure        = 1 MESSAGE lv_rfc_msg
      communication_failure = 2 MESSAGE lv_rfc_msg
      OTHERS                = 3.
  IF sy-subrc <> 0.
    cs_result-status = 'NO_QUOTE'.
    cs_result-reason = lv_rfc_msg.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  RATE_DEVIATION
*&---------------------------------------------------------------------*
FORM rate_deviation CHANGING cs_result TYPE ty_result.
  CHECK cs_result-status IS INITIAL.

  "Quotes in another currency are not compared automatically
  IF cs_result-quote_curr <> c_home_currency.
    cs_result-status = 'REVIEW'.
    cs_result-reason = 'Quote is not in the company currency'.
    gv_review = gv_review + 1.
    RETURN.
  ENDIF.

  IF cs_result-expected > 0.
    cs_result-deviation_pct = ( cs_result-quote - cs_result-expected )
                              * 100 / cs_result-expected.
  ENDIF.

  IF cs_result-deviation_pct > c_tolerance_max.
    cs_result-status = 'BLOCKED'.
    cs_result-reason = 'Quote far above the rate card - hold goods issue'.
    gv_blocked = gv_blocked + 1.
  ELSEIF cs_result-deviation_pct > c_tolerance_ok.
    cs_result-status = 'REVIEW'.
    cs_result-reason = 'Quote above the rate card tolerance'.
    gv_review = gv_review + 1.
  ELSEIF cs_result-deviation_pct < 0 - c_tolerance_max.
    cs_result-status = 'REVIEW'.
    cs_result-reason = 'Quote far below the rate card - check service level'.
    gv_review = gv_review + 1.
  ELSE.
    cs_result-status = 'OK'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SAVE_LOG
*&---------------------------------------------------------------------*
FORM save_log.
  DATA lt_log TYPE STANDARD TABLE OF zsd_freight_log WITH DEFAULT KEY.
  DATA ls_log TYPE zsd_freight_log.
  FIELD-SYMBOLS <ls_result> TYPE ty_result.

  LOOP AT gt_results ASSIGNING <ls_result>.
    CLEAR ls_log.
    ls_log-vbeln     = <ls_result>-vbeln.
    ls_log-check_dat = sy-datum.
    ls_log-carrier   = p_carr.
    ls_log-zone      = <ls_result>-zone.
    ls_log-service   = <ls_result>-service.
    ls_log-weight_kg = <ls_result>-chargeable_kg.
    ls_log-expected  = <ls_result>-expected.
    ls_log-quote     = <ls_result>-quote.
    ls_log-waers     = <ls_result>-quote_curr.
    ls_log-status    = <ls_result>-status.
    APPEND ls_log TO lt_log.
  ENDLOOP.

  MODIFY zsd_freight_log FROM TABLE lt_log.
  IF sy-subrc = 0.
    COMMIT WORK.
  ELSE.
    ROLLBACK WORK.
    MESSAGE 'Freight check log could not be saved' TYPE 'E'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  WRITE_RESULT_LIST
*&---------------------------------------------------------------------*
FORM write_result_list.
  DATA lv_checked TYPE i.
  FIELD-SYMBOLS <ls_result> TYPE ty_result.

  lv_checked = lines( gt_results ).

  WRITE: / 'Freight charge check for shipping point', p_vstel,
           'carrier', p_carr.
  IF p_test = abap_true.
    WRITE: / 'Test run - nothing was saved'.
  ENDIF.
  ULINE.

  LOOP AT gt_results ASSIGNING <ls_result>.
    WRITE: / <ls_result>-vbeln,
             <ls_result>-zone,
             <ls_result>-service,
             <ls_result>-chargeable_kg,
             <ls_result>-expected,
             <ls_result>-quote,
             <ls_result>-deviation_pct,
             <ls_result>-status,
             <ls_result>-reason.
  ENDLOOP.

  ULINE.
  WRITE: / 'Deliveries checked:', lv_checked,
         / 'Goods issue on hold:', gv_blocked,
         / 'To review:', gv_review.
ENDFORM.
