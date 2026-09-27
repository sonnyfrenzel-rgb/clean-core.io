REPORT zsd_price_sim.
*----------------------------------------------------------------------*
* Preissimulation Innendienst: Nettopreis je Kundengruppe
* Strategien: 01 Key Account, 02 Wiederverkaeufer, sonst Listenpreis
* 11.2016 TBE  Umstellung auf Strategieklassen (vorher FORM-Routinen)
*----------------------------------------------------------------------*
PARAMETERS: p_kunnr TYPE kunnr OBLIGATORY,
            p_matnr TYPE matnr OBLIGATORY,
            p_vkorg TYPE vkorg DEFAULT '1000',
            p_vtweg TYPE vtweg DEFAULT '10',
            p_spart TYPE spart DEFAULT '00',
            p_menge TYPE kwmeng DEFAULT 1.

INTERFACE lif_price_strategy.
  METHODS calc_net
    IMPORTING iv_list_price TYPE kbetr
              iv_menge      TYPE kwmeng
    RETURNING VALUE(rv_net) TYPE kbetr.
ENDINTERFACE.

CLASS lcl_price_key_account DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_price_strategy.
ENDCLASS.

CLASS lcl_price_key_account IMPLEMENTATION.
  METHOD lif_price_strategy~calc_net.
    DATA lv_rabatt TYPE p LENGTH 5 DECIMALS 2.
*   Rabattsatz je Key Account aus Pflegetabelle
    SELECT SINGLE rabatt FROM zsd_ka_rabatt INTO lv_rabatt
      WHERE kunnr = p_kunnr.
    rv_net = iv_list_price * ( 100 - lv_rabatt ) / 100.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_price_reseller DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_price_strategy.
ENDCLASS.

CLASS lcl_price_reseller IMPLEMENTATION.
  METHOD lif_price_strategy~calc_net.
    rv_net = iv_list_price.
    IF iv_menge >= 100.
*     Staffel ab 100 Stueck: 5 %
      rv_net = iv_list_price * 95 / 100.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_price_list DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_price_strategy.
ENDCLASS.

CLASS lcl_price_list IMPLEMENTATION.
  METHOD lif_price_strategy~calc_net.
    rv_net = iv_list_price.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_price_factory DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS create
      IMPORTING iv_kdgrp           TYPE kdgrp
      RETURNING VALUE(ro_strategy) TYPE REF TO lif_price_strategy.
ENDCLASS.

CLASS lcl_price_factory IMPLEMENTATION.
  METHOD create.
    CASE iv_kdgrp.
      WHEN '01'.
        ro_strategy = NEW lcl_price_key_account( ).
      WHEN '02'.
        ro_strategy = NEW lcl_price_reseller( ).
      WHEN OTHERS.
        ro_strategy = NEW lcl_price_list( ).
    ENDCASE.
  ENDMETHOD.
ENDCLASS.

DATA: gv_kdgrp TYPE kdgrp,
      gv_list  TYPE kbetr,
      gv_net   TYPE kbetr.

START-OF-SELECTION.
  SELECT SINGLE kdgrp FROM knvv INTO gv_kdgrp
    WHERE kunnr = p_kunnr
      AND vkorg = p_vkorg
      AND vtweg = p_vtweg
      AND spart = p_spart.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Kunde nicht im Vertriebsbereich angelegt' p_kunnr.
  ENDIF.

* Listenpreis PR00 aus Konditionstabelle A004 (Material)
  SELECT SINGLE p~kbetr FROM a004 AS a
    INNER JOIN konp AS p ON p~knumh = a~knumh
    INTO gv_list
    WHERE a~kappl = 'V'
      AND a~kschl = 'PR00'
      AND a~vkorg = p_vkorg
      AND a~vtweg = p_vtweg
      AND a~matnr = p_matnr
      AND a~datab <= sy-datum
      AND a~datbi >= sy-datum.
* kein Listenpreis -> 0, Innendienst sieht das in der Ausgabe

  DATA(go_strategy) = lcl_price_factory=>create( gv_kdgrp ).
  gv_net = go_strategy->calc_net( iv_list_price = gv_list
                                  iv_menge      = p_menge ).

  WRITE: / 'Kundengruppe:', gv_kdgrp,
         / 'Listenpreis :', gv_list,
         / 'Nettopreis  :', gv_net.
