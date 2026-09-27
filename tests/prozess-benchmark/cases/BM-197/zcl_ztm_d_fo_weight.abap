CLASS zcl_ztm_d_fo_weight DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_d_supercl_simple
  FINAL
  CREATE PUBLIC .

*"* Determination ZZ_CALC_WEIGHT_DG am Knoten ROOT des BO /SCMTMS/TOR
*"* (Erweiterung ZTM_TOR_ENH). Ausloeser: Anlegen/Aendern ITEM_TR,
*"* Zeitpunkt "nach Aenderung / vor Konsistenzpruefung".
  PUBLIC SECTION.

    METHODS /bobf/if_frw_determination~execute
        REDEFINITION .
  PROTECTED SECTION.
  PRIVATE SECTION.

    CONSTANTS gc_uom_kg TYPE meins VALUE 'KG' ##NO_TEXT.
ENDCLASS.



CLASS zcl_ztm_d_fo_weight IMPLEMENTATION.


  METHOD /bobf/if_frw_determination~execute.
*----------------------------------------------------------------------*
* Gesamtgewicht (brutto, nur Ladung) und Gefahrgutkennzeichen am
* Frachtauftrag fortschreiben - Basis fuer die Kapazitaetspruefung
* (ZCL_ZTM_V_FO_CAPACITY) und die Freigabe (ZCL_ZTM_A_FO_RELEASE)
*----------------------------------------------------------------------*
* 04/2021 PW  Erstellung
* 09/2022 PW  nur Frachtauftraege, keine Frachtbuchungen (Incident 88213)
* 02/2023 SB  Umstellung auf GROUP BY / REDUCE
*----------------------------------------------------------------------*
    DATA: lt_root TYPE /scmtms/t_tor_root_k,
          lt_item TYPE /scmtms/t_tor_item_tr_k.

    CLEAR: eo_message, et_failed_key.

    io_read->retrieve(
      EXPORTING
        iv_node = /scmtms/if_tor_c=>sc_node-root
        it_key  = it_key
      IMPORTING
        et_data = lt_root ).

*   nur Frachtauftraege (Kategorie TO), keine Frachtbuchungen/Frachteinheiten
    DELETE lt_root WHERE tor_cat <> /scmtms/if_tor_const=>sc_tor_category-active.
    IF lt_root IS INITIAL.
      RETURN.
    ENDIF.

    io_read->retrieve_by_association(
      EXPORTING
        iv_node        = /scmtms/if_tor_c=>sc_node-root
        it_key         = VALUE #( FOR ls_r IN lt_root ( key = ls_r-key ) )
        iv_association = /scmtms/if_tor_c=>sc_association-root-item_tr
        iv_fill_data   = abap_true
      IMPORTING
        et_data        = lt_item ).

*   Positionen je Frachtauftrag gruppieren
*   (Frachtauftraege ganz ohne Positionen tauchen hier nicht auf)
    LOOP AT lt_item INTO DATA(ls_item)
         GROUP BY ls_item-root_key INTO DATA(lv_root_key).

      READ TABLE lt_root REFERENCE INTO DATA(lr_root)
           WITH KEY key = lv_root_key.
      CHECK sy-subrc = 0.

*     Bruttogewicht nur der Ladungspositionen (Produkt, Packstueck) -
*     Fahrzeug-/Anhaengerpositionen tragen das Eigengewicht und zaehlen nicht.
*     Gewichtseinheit laut Planungsprofil immer KG - keine Umrechnung (PW)
      DATA(lv_total) = REDUCE /scmtms/qua_gro_wei_val(
                         INIT s = 0
                         FOR m IN GROUP lv_root_key
                         WHERE ( item_cat = /scmtms/if_tor_const=>sc_tor_item_category-product
                              OR item_cat = /scmtms/if_tor_const=>sc_tor_item_category-package )
                         NEXT s = s + m-gro_wei_val ).

*     Gefahrgut, sobald eine Position als Gefahrgut gekennzeichnet ist
      DATA(lv_dg) = xsdbool( REDUCE i( INIT n = 0
                                       FOR m IN GROUP lv_root_key
                                       WHERE ( zz_dg_flag = abap_true )
                                       NEXT n = n + 1 ) > 0 ).

*     nur bei Aenderung schreiben (sonst laufen die Determinationen im Kreis)
      IF lr_root->zz_total_weight = lv_total AND lr_root->zz_dg_indicator = lv_dg.
        CONTINUE.
      ENDIF.

      lr_root->zz_total_weight     = lv_total.
      lr_root->zz_total_weight_uom = gc_uom_kg.
      lr_root->zz_dg_indicator     = lv_dg.

      io_modify->update(
        iv_node           = /scmtms/if_tor_c=>sc_node-root
        iv_key            = lr_root->key
        is_data           = lr_root
        it_changed_fields = VALUE #(
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_total_weight )
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_total_weight_uom )
          ( zif_ztm_tor_c=>sc_node_attribute-root-zz_dg_indicator ) ) ).

    ENDLOOP.

  ENDMETHOD.
ENDCLASS.
