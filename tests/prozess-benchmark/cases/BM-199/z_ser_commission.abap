FUNCTION z_ser_commission.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_MATNR) TYPE  MATNR
*"     VALUE(IV_CHARG) TYPE  CHARG_D
*"     VALUE(IV_EXPIRY) TYPE  VFDAT
*"     VALUE(IV_MARKET) TYPE  ZSER_MARKET
*"     VALUE(IV_QUANTITY) TYPE  I
*"     VALUE(IV_LINE) TYPE  ZSER_LINE_ID
*"     VALUE(IV_COMMIT) TYPE  ABAP_BOOL DEFAULT ABAP_TRUE
*"  EXPORTING
*"     VALUE(ET_SERIAL) TYPE  ZSER_SERIAL_TT
*"     VALUE(EV_EPCIS) TYPE  XSTRING
*"  EXCEPTIONS
*"      INVALID_QUANTITY
*"      GTIN_NOT_FOUND
*"      CACHE_ERROR
*"      MARKET_NOT_SUPPORTED
*"      MARKET_RULE_VIOLATED
*"      LOCK_FAILED
*"      NUMBER_RANGE_ERROR
*"      EPCIS_ERROR
*"      DB_ERROR
*"----------------------------------------------------------------------
* Kommissionierung (Commissioning) von Seriennummern fuer Arzneimittel-
* packungen einer Charge. Aufruf von der Verpackungslinie (Line Server
* ueber RFC) bzw. aus ZSER_LINE_MONITOR.
*
* Ablauf: GTIN-Stammdaten (Shared Objects) -> Zielmarkt-Regeln (BAdI
* ZSER_MARKET_RULES, Filter ZIELMARKT) -> Sperre Charge -> Nummern
* blockweise aus NR-Objekt ZSER_SNR -> Serien formatieren (je Markt) ->
* EPCIS ObjectEvent "commissioning" -> Serien + Ausgangsmeldung speichern
* -> Aenderungsbelege Serienstatus.
*----------------------------------------------------------------------
* 2019-02-08  PHOFFMANN  Erstellt fuer EU-FMD (Go-live 09.02.2019)
* 2020-10-19  PHOFFMANN  US-DSCSA ueber BAdI-Implementierung, Nummern
*                        blockweise statt einzeln (Linie 4: 400 Pkg/min)
* 2021-05-03  JWEBER     Sperre mit Wiederholung (Linien 3+4 parallel)
* 2023-01-16  JWEBER     GTIN-Cache in Shared Objects (vorher SELECT je Aufruf)
*----------------------------------------------------------------------
  CONSTANTS: lc_nr_object  TYPE inri-object VALUE 'ZSER_SNR',
             lc_max_qty    TYPE i VALUE 5000,
             lc_lock_tries TYPE i VALUE 5,
             lc_status_com TYPE zser_status VALUE '01'.   " commissioned

  DATA: lo_badi      TYPE REF TO zser_market_rules,
        ls_rules     TYPE zif_ser_market_badi=>ty_rules,
        lt_serial    TYPE zser_serial_tt,
        ls_serial    TYPE zser_serial,
        ls_epcis_out TYPE zser_epcis_out,
        ls_event     TYPE zser_s_epcis_event,
        lv_number    TYPE zser_snr,
        lv_quant     TYPE inri-quantity,
        lv_got       TYPE inri-quantity,
        lv_rc        TYPE inri-returncode,
        lv_remaining TYPE i,
        lv_locked    TYPE abap_bool,
        lv_exists    TYPE zser_serial_no,
        lv_ts        TYPE timestampl.

*--- Plausibilitaet -----------------------------------------------------
  IF iv_quantity <= 0 OR iv_quantity > lc_max_qty.
    MESSAGE e001(zser) WITH iv_quantity lc_max_qty RAISING invalid_quantity.
  ENDIF.

*--- GTIN-Stammdaten aus Shared-Objects-Cache ---------------------------
  TRY.
      DATA(ls_gtin) = zcl_ser_gtin_cache=>get_gtin( iv_matnr ).
    CATCH zcx_ser_cache INTO DATA(lx_cache).
      MESSAGE e009(zser) WITH iv_matnr RAISING cache_error.
  ENDTRY.
  IF ls_gtin-gtin IS INITIAL.
    MESSAGE e002(zser) WITH iv_matnr RAISING gtin_not_found.
  ENDIF.

*--- Zielmarkt-Regeln (EU-FMD / US-DSCSA / ...) --------------------------
  TRY.
      GET BADI lo_badi
        FILTERS
          zielmarkt = iv_market.
    CATCH cx_badi_not_implemented.
      MESSAGE e005(zser) WITH iv_market RAISING market_not_supported.
  ENDTRY.

  TRY.
      CALL BADI lo_badi->get_rules
        EXPORTING
          is_gtin   = ls_gtin
          iv_expiry = iv_expiry
        IMPORTING
          es_rules  = ls_rules.
    CATCH zcx_ser_rule INTO DATA(lx_rule).
      MESSAGE e006(zser) WITH iv_market ls_gtin-gtin RAISING market_rule_violated.
  ENDTRY.

*--- Sperre auf Material/Charge, bei Fremdsperre bis zu 5x warten --------
  DO lc_lock_tries TIMES.
    CALL FUNCTION 'ENQUEUE_EZSER_BATCH'
      EXPORTING
        mode_zser_batch = 'E'
        mandt           = sy-mandt
        matnr           = iv_matnr
        charg           = iv_charg
      EXCEPTIONS
        foreign_lock    = 1
        system_failure  = 2
        OTHERS          = 3.
    CASE sy-subrc.
      WHEN 0.
        lv_locked = abap_true.
        EXIT.
      WHEN 1.
        WAIT UP TO 2 SECONDS.
      WHEN OTHERS.
        MESSAGE e004(zser) WITH iv_matnr iv_charg RAISING lock_failed.
    ENDCASE.
  ENDDO.
  IF lv_locked = abap_false.
    MESSAGE e003(zser) WITH iv_matnr iv_charg sy-msgv1 RAISING lock_failed.
  ENDIF.

*--- Nummern blockweise ziehen und je Zielmarkt formatieren --------------
  lv_remaining = iv_quantity.
  WHILE lv_remaining > 0.
    lv_quant = lv_remaining.
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr             = ls_rules-nr_interval
        object                  = lc_nr_object
        quantity                = lv_quant
      IMPORTING
        number                  = lv_number
        quantity                = lv_got
        returncode              = lv_rc
      EXCEPTIONS
        interval_not_found      = 1
        number_range_not_intern = 2
        object_not_found        = 3
        quantity_is_0           = 4
        quantity_is_not_1       = 5
        interval_overflow       = 6
        buffer_overflow         = 7
        OTHERS                  = 8.
    IF sy-subrc <> 0.
      CALL FUNCTION 'DEQUEUE_EZSER_BATCH'
        EXPORTING
          mode_zser_batch = 'E'
          mandt           = sy-mandt
          matnr           = iv_matnr
          charg           = iv_charg.
      MESSAGE e007(zser) WITH ls_rules-nr_interval RAISING number_range_error.
    ENDIF.

*   Block: lv_number ist die erste Nummer, lv_got die Anzahl (NR-Puffer
*   liefert am Intervallende ggf. weniger als angefordert)
    DO lv_got TIMES.
      CLEAR ls_serial.
      CALL BADI lo_badi->format_serial
        EXPORTING
          iv_number = lv_number
          is_rules  = ls_rules
        IMPORTING
          ev_serial = ls_serial-serial_no.
      lv_number = lv_number + 1.

*     Seriennummer darf je GTIN nur einmal vergeben sein (Altbestand aus
*     Lohnhersteller-Import ZSER_CMO_UPLOAD!)
      SELECT SINGLE serial_no FROM zser_serial INTO lv_exists
        WHERE gtin      = ls_gtin-gtin
          AND serial_no = ls_serial-serial_no.
      IF sy-subrc = 0.
        CONTINUE.
      ENDIF.

      ls_serial-gtin       = ls_gtin-gtin.
      ls_serial-matnr      = iv_matnr.
      ls_serial-charg      = iv_charg.
      ls_serial-vfdat      = iv_expiry.
      ls_serial-market     = iv_market.
      ls_serial-line_id    = iv_line.
      ls_serial-status     = lc_status_com.
      ls_serial-created_by = sy-uname.
      GET TIME STAMP FIELD ls_serial-created_at.
      APPEND ls_serial TO lt_serial.
      lv_remaining = lv_remaining - 1.
    ENDDO.
  ENDWHILE.

*--- EPCIS ObjectEvent "commissioning" ----------------------------------
  GET TIME STAMP FIELD lv_ts.
  ls_event-event_time  = lv_ts.
  ls_event-action      = 'ADD'.
  ls_event-biz_step    = 'urn:epcglobal:cbv:bizstep:commissioning'.
  ls_event-disposition = 'urn:epcglobal:cbv:disp:active'.
  ls_event-read_point  = iv_line.
  ls_event-lot         = iv_charg.
  ls_event-expiry      = iv_expiry.
  ls_event-epc_list    = VALUE #( FOR ls_s IN lt_serial
                                  ( |urn:epc:id:sgtin:{ ls_gtin-company_prefix }.{ ls_gtin-item_ref }.{ ls_s-serial_no }| ) ).
  TRY.
      CALL TRANSFORMATION zser_epcis_commission
        SOURCE event = ls_event
        RESULT XML ev_epcis.
    CATCH cx_transformation_error INTO DATA(lx_tr).
      CALL FUNCTION 'DEQUEUE_EZSER_BATCH'
        EXPORTING
          mode_zser_batch = 'E'
          mandt           = sy-mandt
          matnr           = iv_matnr
          charg           = iv_charg.
      MESSAGE e008(zser) RAISING epcis_error.
  ENDTRY.

*--- Speichern ----------------------------------------------------------
  INSERT zser_serial FROM TABLE lt_serial ACCEPTING DUPLICATE KEYS.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    MESSAGE e010(zser) WITH iv_matnr iv_charg RAISING db_error.
  ENDIF.

  ls_epcis_out-guid     = cl_system_uuid=>create_uuid_x16_static( ).
  ls_epcis_out-market   = iv_market.
  ls_epcis_out-receiver = ls_rules-report_to.
  ls_epcis_out-payload  = ev_epcis.
  ls_epcis_out-status   = 'N'.                   " neu, Versand durch ZSER_EPCIS_SEND
  INSERT zser_epcis_out FROM ls_epcis_out.

*--- Aenderungsbelege Serienstatus (Objekt ZSER_SERIAL) -----------------
  LOOP AT lt_serial INTO ls_serial.
    CALL FUNCTION 'ZSER_SERIAL_WRITE_DOCUMENT' IN UPDATE TASK
      EXPORTING
        objectid        = CONV cdobjectv( |{ ls_serial-gtin }{ ls_serial-serial_no }| )
        tcode           = sy-tcode
        utime           = sy-uzeit
        udate           = sy-datum
        username        = sy-uname
        n_zser_serial   = ls_serial
        o_zser_serial   = VALUE zser_serial( )
        upd_zser_serial = 'I'.
  ENDLOOP.

  IF 1 = 2.
*   Aggregation Packung -> Buendel -> Karton (Phase 2, nie aktiviert)
    CALL FUNCTION 'Z_SER_AGGREGATE'
      EXPORTING
        it_serial = lt_serial.
  ENDIF.

  IF iv_commit = abap_true.
    COMMIT WORK AND WAIT.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EZSER_BATCH'
    EXPORTING
      mode_zser_batch = 'E'
      mandt           = sy-mandt
      matnr           = iv_matnr
      charg           = iv_charg.

  et_serial = lt_serial.
ENDFUNCTION.
