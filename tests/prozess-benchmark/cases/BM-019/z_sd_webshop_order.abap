FUNCTION z_sd_webshop_order.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefähig, Aufruf durch Webshop-Middleware)
*"  IMPORTING
*"     VALUE(IS_HEADER) TYPE  ZSD_S_WEB_HEADER
*"     VALUE(IT_ITEMS) TYPE  ZSD_T_WEB_ITEM
*"  EXPORTING
*"     VALUE(EV_VBELN) TYPE  VBELN_VA
*"     VALUE(EV_KUNNR) TYPE  KUNNR
*"     VALUE(EV_STATUS) TYPE  CHAR1
*"     VALUE(ET_RETURN) TYPE  BAPIRET2_T
*"----------------------------------------------------------------------
* Webshop-Bestellung -> Kundenauftrag ZWEB
*  1. Doppelte Übertragung erkennen (Shop-Bestellnummer)
*  2. Auftraggeber ermitteln oder als Neukunde anlegen
*  3. Verfügbarkeit und Preise prüfen
*  4. Auftrag anlegen, protokollieren, Großaufträge melden
* Status: S = angelegt, D = bereits vorhanden, E = Fehler, P = Preisabw.
*----------------------------------------------------------------------
* 2014-11 WEB-Projekt (MSC), 2016-05 Neukundenanlage (MSC),
* 2018-02 Preisabgleich mit Toleranz (FRI), 2020-09 Großauftragsereignis
*----------------------------------------------------------------------
  DATA: lo_cust   TYPE REF TO zcl_sd_webshop_customer,
        lo_order  TYPE REF TO zcl_sd_webshop_order,
        ls_log    TYPE zsd_webshop_log,
        lv_objkey TYPE swo_typeid,
        lx_web    TYPE REF TO zcx_sd_webshop.

  CLEAR: ev_vbeln, ev_kunnr, ev_status, et_return.

* 1. Doppelte Übertragung: Shop sendet nach Timeout erneut
  SELECT SINGLE vbeln kunnr FROM zsd_webshop_log INTO (ev_vbeln, ev_kunnr)
    WHERE shop_order = is_header-shop_order
      AND status     = 'S'.
  IF sy-subrc = 0.
    ev_status = 'D'.
    APPEND VALUE #( type = 'I' id = 'ZSD' number = '900'
                    message_v1 = is_header-shop_order
                    message_v2 = ev_vbeln ) TO et_return.
    RETURN.
  ENDIF.

  IF it_items IS INITIAL.
    ev_status = 'E'.
    APPEND VALUE #( type = 'E' id = 'ZSD' number = '901'
                    message_v1 = is_header-shop_order ) TO et_return.
    RETURN.
  ENDIF.

  TRY.
*     2. Auftraggeber
      lo_cust  = NEW zcl_sd_webshop_customer( is_header ).
      ev_kunnr = lo_cust->get_or_create( ).

*     3. Verfügbarkeit und Preise
      lo_order = NEW zcl_sd_webshop_order( is_header = is_header
                                           it_items  = it_items
                                           iv_kunnr  = ev_kunnr ).
      lo_order->check_availability( ).

      IF lo_order->check_prices( ) = abap_false.
        ev_status = 'P'.
        et_return = lo_order->mt_messages.
        ls_log = VALUE #( shop_order = is_header-shop_order
                          kunnr = ev_kunnr status = ev_status
                          erdat = sy-datum erzet = sy-uzeit ).
        CALL FUNCTION 'Z_SD_WEBSHOP_LOG_UPD' IN UPDATE TASK
          EXPORTING
            is_log = ls_log.
        COMMIT WORK.
        RETURN.
      ENDIF.

*     4. Anlage
      ev_vbeln = lo_order->create( ).

    CATCH zcx_sd_webshop INTO lx_web.
      ev_status = 'E'.
      APPEND VALUE #( type = 'E' id = lx_web->if_t100_message~t100key-msgid
                      number = lx_web->if_t100_message~t100key-msgno
                      message = lx_web->get_text( ) ) TO et_return.
      ROLLBACK WORK.
      RETURN.
  ENDTRY.

  ev_status = 'S'.
  et_return = lo_order->mt_messages.

  ls_log = VALUE #( shop_order = is_header-shop_order vbeln = ev_vbeln
                    kunnr = ev_kunnr netwr = lo_order->mv_netwr
                    waerk = is_header-currency status = ev_status
                    erdat = sy-datum erzet = sy-uzeit ).
  CALL FUNCTION 'Z_SD_WEBSHOP_LOG_UPD' IN UPDATE TASK
    EXPORTING
      is_log = ls_log.

* Großaufträge ab 25.000 (Belegwährung) an den Key-Account melden
  IF ls_log-netwr >= 25000.
    lv_objkey = ev_vbeln.
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'BUS2032'
        objkey            = lv_objkey
        event             = 'ZWEBBIG'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
  ENDIF.

  COMMIT WORK.
ENDFUNCTION.
