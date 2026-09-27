CLASS zcl_ztm_d_frachtkosten DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_d_supercl_simple
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /bobf/if_frw_determination~execute REDEFINITION.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS gc_waers_default TYPE waers VALUE 'EUR'.
ENDCLASS.



CLASS zcl_ztm_d_frachtkosten IMPLEMENTATION.

  METHOD /bobf/if_frw_determination~execute.
*----------------------------------------------------------------------*
* Determination FRACHTKOSTEN (Knoten ROOT, nach Aenderung Gewicht/Route)
* Ermittelt die geplanten Frachtkosten einer Sendung aus der
* Kundentariftabelle ZTM_TARIF. 2019-03 JK, 2021-11 MS Mindestfracht
*----------------------------------------------------------------------*
    DATA: lt_root     TYPE ztm_t_sendung_root,
          lr_root     TYPE REF TO zstm_sendung_root,
          ls_tarif    TYPE ztm_tarif,
          lv_kosten   TYPE ztm_frachtkosten,
          lo_msg      TYPE REF TO /bobf/if_frw_message.

    CLEAR et_failed_key.

    io_read->retrieve(
      EXPORTING
        iv_node = zif_ztm_sendung_c=>sc_node-root
        it_key  = it_key
      IMPORTING
        et_data = lt_root ).

    LOOP AT lt_root REFERENCE INTO lr_root.

*     Sendungen ohne Route oder bereits abgerechnete Sendungen nicht neu bewerten
      IF lr_root->route IS INITIAL OR lr_root->abgerechnet = abap_true.
        CONTINUE.
      ENDIF.

      SELECT SINGLE * FROM ztm_tarif INTO ls_tarif
        WHERE route    = lr_root->route
          AND vsart    = lr_root->vsart
          AND gueltab <= sy-datum
          AND gueltbis >= sy-datum.
      IF sy-subrc <> 0.
*       Kein gueltiger Tarif: Warnung, Kosten bleiben unveraendert
        IF lo_msg IS NOT BOUND.
          lo_msg = /bobf/cl_frw_factory=>get_message( ).
        ENDIF.
        lo_msg->add_message(
          EXPORTING
            is_msg  = VALUE #( msgid = 'ZTM_SEND' msgno = '021' msgty = 'W'
                               msgv1 = lr_root->route msgv2 = lr_root->vsart )
            iv_node = is_ctx-node_key
            iv_key  = lr_root->key ).
        CONTINUE.
      ENDIF.

*     Gewichtsfracht: Satz je 100 kg, auf volle 100 kg aufgerundet
      lv_kosten = ceil( lr_root->brgew / 100 ) * ls_tarif-satz_100kg.

*     Mindestfracht (seit 2021-11)
      IF lv_kosten < ls_tarif-mindestfracht.
        lv_kosten = ls_tarif-mindestfracht.
      ENDIF.

*     Gefahrgutzuschlag in Prozent
      IF lr_root->gefahrgut = abap_true.
        lv_kosten = lv_kosten + lv_kosten * ls_tarif-gg_zuschlag / 100.
      ENDIF.

*      lv_kosten = lv_kosten * '1.19'.   "brutto - raus, Abrechnung netto
      lr_root->frachtkosten = lv_kosten.
      lr_root->waers        = COND #( WHEN ls_tarif-waers IS INITIAL
                                      THEN gc_waers_default
                                      ELSE ls_tarif-waers ).

      io_modify->update(
        iv_node           = zif_ztm_sendung_c=>sc_node-root
        iv_key            = lr_root->key
        is_data           = lr_root
        it_changed_fields = VALUE #( ( zif_ztm_sendung_c=>sc_node_attribute-root-frachtkosten )
                                     ( zif_ztm_sendung_c=>sc_node_attribute-root-waers ) ) ).
    ENDLOOP.

    eo_message = lo_msg.
  ENDMETHOD.
ENDCLASS.
