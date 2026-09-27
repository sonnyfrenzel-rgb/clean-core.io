*"* Lokaler Handler fuer Angebotspositionen (CCIMP-Teil 2)
CLASS lhc_position DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS preis_ermitteln FOR DETERMINE ON MODIFY
      IMPORTING keys FOR position~preisErmitteln.
    METHODS validate_menge FOR VALIDATE ON SAVE
      IMPORTING keys FOR position~validateMenge.
ENDCLASS.

CLASS lhc_position IMPLEMENTATION.

  METHOD preis_ermitteln.
    DATA lt_upd_pos TYPE TABLE FOR UPDATE zi_angebot\\position.

    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY position
        FIELDS ( AngebotId Material Menge ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_pos)
      ENTITY position BY \_Kopf
        FIELDS ( Kunde Vertriebsbereich Waehrung ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_kopf).

    LOOP AT lt_pos INTO DATA(ls_pos).
      DATA(ls_kopf) = VALUE #( lt_kopf[ AngebotId = ls_pos-AngebotId ] OPTIONAL ).

      DATA(lv_preis) = zcl_sd_angebot_preis=>listenpreis( iv_material = ls_pos-Material
                                                          iv_kunde    = ls_kopf-Kunde
                                                          iv_vb       = ls_kopf-Vertriebsbereich
                                                          iv_waehrung = ls_kopf-Waehrung ).
      IF lv_preis IS INITIAL.
        APPEND VALUE #( %tky = ls_pos-%tky
                        %msg = new_message( id = 'ZSD_ANG' number = '020' v1 = ls_pos-Material
                                            severity = if_abap_behv_message=>severity-warning ) )
               TO reported-position.
      ENDIF.

      APPEND VALUE #( %tky        = ls_pos-%tky
                      Nettopreis  = lv_preis
                      Nettowert   = lv_preis * ls_pos-Menge
                      %control-Nettopreis = if_abap_behv=>mk-on
                      %control-Nettowert  = if_abap_behv=>mk-on ) TO lt_upd_pos.
    ENDLOOP.

    MODIFY ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY position UPDATE FROM lt_upd_pos.

*   Gesamtwert der betroffenen Koepfe neu bilden
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf BY \_Positionen
        FIELDS ( Nettowert ) WITH VALUE #( FOR ls_k IN lt_kopf ( %tky = ls_k-%tky ) )
      RESULT DATA(lt_alle_pos).

    MODIFY ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        UPDATE FIELDS ( Gesamtwert )
        WITH VALUE #( FOR ls_k IN lt_kopf
                      ( %tky       = ls_k-%tky
                        Gesamtwert = REDUCE #( INIT s = CONV zsd_angebot_wert( 0 )
                                               FOR ls_p IN lt_alle_pos WHERE ( AngebotId = ls_k-AngebotId )
                                               NEXT s = s + ls_p-Nettowert ) ) ).
  ENDMETHOD.


  METHOD validate_menge.
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY position
        FIELDS ( Menge Mengeneinheit ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_pos).

    LOOP AT lt_pos INTO DATA(ls_pos).
      IF ls_pos-Menge <= 0 OR ls_pos-Mengeneinheit IS INITIAL.
        APPEND VALUE #( %tky = ls_pos-%tky ) TO failed-position.
        APPEND VALUE #( %tky = ls_pos-%tky
                        %msg = new_message( id = 'ZSD_ANG' number = '021'
                                            severity = if_abap_behv_message=>severity-error )
                        %element-Menge = if_abap_behv=>mk-on ) TO reported-position.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
