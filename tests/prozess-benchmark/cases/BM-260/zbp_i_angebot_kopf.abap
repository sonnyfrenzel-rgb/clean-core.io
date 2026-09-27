*"* Lokaler Handler fuer den Angebotskopf (CCIMP-Teil 1)
CLASS lhc_kopf DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR kopf RESULT result.
    METHODS validate_gueltigkeit FOR VALIDATE ON SAVE
      IMPORTING keys FOR kopf~validateGueltigkeit.
    METHODS freigeben FOR MODIFY
      IMPORTING keys FOR ACTION kopf~freigeben RESULT result.
    METHODS ablaufen FOR MODIFY
      IMPORTING keys FOR ACTION kopf~ablaufen.
    METHODS kopieren FOR MODIFY
      IMPORTING keys FOR ACTION kopf~kopieren.
ENDCLASS.

CLASS lhc_kopf IMPLEMENTATION.

  METHOD get_instance_features.
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        FIELDS ( Status Gesamtwert ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_kopf).

    result = VALUE #( FOR ls_k IN lt_kopf
               ( %tky              = ls_k-%tky
                 %action-freigeben = COND #( WHEN ls_k-Status = zbp_i_angebot=>gc_status-neu
                                              AND ls_k-Gesamtwert > 0
                                             THEN if_abap_behv=>fc-o-enabled
                                             ELSE if_abap_behv=>fc-o-disabled )
                 %update           = COND #( WHEN ls_k-Status = zbp_i_angebot=>gc_status-neu
                                             THEN if_abap_behv=>fc-o-enabled
                                             ELSE if_abap_behv=>fc-o-disabled ) ) ).
  ENDMETHOD.


  METHOD validate_gueltigkeit.
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        FIELDS ( Angebotsdatum GueltigBis ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_kopf).

    LOOP AT lt_kopf INTO DATA(ls_kopf).
      APPEND VALUE #( %tky = ls_kopf-%tky %state_area = 'GUELTIG' ) TO reported-kopf.

      IF ls_kopf-GueltigBis < cl_abap_context_info=>get_system_date( )
         OR ls_kopf-GueltigBis <= ls_kopf-Angebotsdatum.
        APPEND VALUE #( %tky = ls_kopf-%tky ) TO failed-kopf.
        APPEND VALUE #( %tky        = ls_kopf-%tky
                        %state_area = 'GUELTIG'
                        %msg        = new_message( id = 'ZSD_ANG' number = '001'
                                                   severity = if_abap_behv_message=>severity-error )
                        %element-GueltigBis = if_abap_behv=>mk-on ) TO reported-kopf.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD freigeben.
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        FIELDS ( Status Gesamtwert ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_kopf).

    LOOP AT lt_kopf ASSIGNING FIELD-SYMBOL(<ls_kopf>).
      IF <ls_kopf>-Status <> zbp_i_angebot=>gc_status-neu.
        APPEND VALUE #( %tky = <ls_kopf>-%tky ) TO failed-kopf.
        APPEND VALUE #( %tky = <ls_kopf>-%tky
                        %msg = new_message( id = 'ZSD_ANG' number = '010'
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-kopf.
        CONTINUE.
      ENDIF.

*     ueber der Grenze braucht es eine Genehmigung (Vertriebsleitung)
      IF <ls_kopf>-Gesamtwert > zbp_i_angebot=>gc_genehmigungsgrenze.
        <ls_kopf>-Status = zbp_i_angebot=>gc_status-genehmigung.
        APPEND VALUE #( %tky = <ls_kopf>-%tky
                        %msg = new_message( id = 'ZSD_ANG' number = '011'
                                            severity = if_abap_behv_message=>severity-information ) )
               TO reported-kopf.
      ELSE.
        <ls_kopf>-Status = zbp_i_angebot=>gc_status-freigegeben.
      ENDIF.
    ENDLOOP.

    MODIFY ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        UPDATE FIELDS ( Status )
        WITH VALUE #( FOR ls_k IN lt_kopf WHERE ( Status <> zbp_i_angebot=>gc_status-neu )
                      ( %tky = ls_k-%tky Status = ls_k-Status ) ).

    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).
    result = VALUE #( FOR ls_r IN lt_result ( %tky = ls_r-%tky %param = ls_r ) ).
  ENDMETHOD.


  METHOD ablaufen.
*   nur vom Job gerufen; keine Statuspruefung (Job selektiert F)
    MODIFY ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        UPDATE FIELDS ( Status )
        WITH VALUE #( FOR ls_key IN keys
                      ( %tky = ls_key-%tky Status = zbp_i_angebot=>gc_status-abgelaufen ) ).
  ENDMETHOD.


  METHOD kopieren.
    READ ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_kopf)
      ENTITY kopf BY \_Positionen ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_pos).

*   Kopie: neuer Entwurf, Status neu, heutiges Datum, 30 Tage gueltig
    MODIFY ENTITIES OF zi_angebot IN LOCAL MODE
      ENTITY kopf
        CREATE FIELDS ( Kunde Vertriebsbereich Waehrung Angebotsdatum GueltigBis Status )
        WITH VALUE #( FOR ls_k IN lt_kopf INDEX INTO lv_i
                      ( %cid          = |KOPF{ lv_i }|
                        %is_draft     = if_abap_behv=>mk-on
                        Kunde         = ls_k-Kunde
                        Vertriebsbereich = ls_k-Vertriebsbereich
                        Waehrung      = ls_k-Waehrung
                        Angebotsdatum = cl_abap_context_info=>get_system_date( )
                        GueltigBis    = cl_abap_context_info=>get_system_date( ) + 30
                        Status        = zbp_i_angebot=>gc_status-neu ) )
        CREATE BY \_Positionen
        FIELDS ( Material Menge Mengeneinheit )
        WITH VALUE #( FOR ls_k IN lt_kopf INDEX INTO lv_j
                      ( %cid_ref  = |KOPF{ lv_j }|
                        %is_draft = if_abap_behv=>mk-on
                        %target   = VALUE #( FOR ls_p IN lt_pos WHERE ( AngebotId = ls_k-AngebotId )
                                             INDEX INTO lv_k
                                             ( %cid          = |POS{ lv_j }_{ lv_k }|
                                               %is_draft     = if_abap_behv=>mk-on
                                               Material      = ls_p-Material
                                               Menge         = ls_p-Menge
                                               Mengeneinheit = ls_p-Mengeneinheit ) ) ) )
      MAPPED mapped
      FAILED failed
      REPORTED reported.
  ENDMETHOD.

ENDCLASS.
