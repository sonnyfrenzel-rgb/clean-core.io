*"* use this source file for the definition and implementation of
*"* local helper classes, interface definitions and type
*"* declarations
CLASS lhc_reklamation DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.

    CONSTANTS:
      BEGIN OF gc_status,
        neu          TYPE ztqm_rekl_status VALUE 'N',
        in_pruefung  TYPE ztqm_rekl_status VALUE 'P',
        eskaliert    TYPE ztqm_rekl_status VALUE 'E',
        abgeschlossen TYPE ztqm_rekl_status VALUE 'A',
      END OF gc_status.

    METHODS get_instance_features FOR INSTANCE FEATURES
      IMPORTING keys REQUEST requested_features FOR reklamation RESULT result.

    METHODS set_initial_status FOR DETERMINE ON MODIFY
      IMPORTING keys FOR reklamation~setInitialStatus.

    METHODS validate_kunde FOR VALIDATE ON SAVE
      IMPORTING keys FOR reklamation~validateKunde.

    METHODS eskalieren FOR MODIFY
      IMPORTING keys FOR ACTION reklamation~eskalieren RESULT result.

ENDCLASS.

CLASS lhc_reklamation IMPLEMENTATION.

  METHOD get_instance_features.
    READ ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        FIELDS ( Status ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_rekl)
      FAILED failed.

    result = VALUE #( FOR ls_rekl IN lt_rekl
                      ( %tky              = ls_rekl-%tky
                        %action-eskalieren = COND #( WHEN ls_rekl-Status = gc_status-abgeschlossen
                                                     THEN if_abap_behv=>fc-o-disabled
                                                     ELSE if_abap_behv=>fc-o-enabled ) ) ).
  ENDMETHOD.

  METHOD set_initial_status.
    READ ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        FIELDS ( Status Eingangsdatum ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_rekl).

*   nur neu angelegte ohne Status
    DELETE lt_rekl WHERE Status IS NOT INITIAL.
    CHECK lt_rekl IS NOT INITIAL.

    MODIFY ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        UPDATE FIELDS ( Status Eingangsdatum Eskalationsstufe )
        WITH VALUE #( FOR ls_rekl IN lt_rekl
                      ( %tky             = ls_rekl-%tky
                        Status           = gc_status-neu
                        Eingangsdatum    = COND #( WHEN ls_rekl-Eingangsdatum IS INITIAL
                                                   THEN cl_abap_context_info=>get_system_date( )
                                                   ELSE ls_rekl-Eingangsdatum )
                        Eskalationsstufe = '0' ) )
      REPORTED DATA(lt_reported).

    reported = CORRESPONDING #( DEEP lt_reported ).
  ENDMETHOD.

  METHOD validate_kunde.
    READ ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        FIELDS ( Kunde ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_rekl).

    LOOP AT lt_rekl INTO DATA(ls_rekl).
      APPEND VALUE #( %tky        = ls_rekl-%tky
                      %state_area = 'KUNDE' ) TO reported-reklamation.

      IF ls_rekl-Kunde IS INITIAL.
        APPEND VALUE #( %tky = ls_rekl-%tky ) TO failed-reklamation.
        APPEND VALUE #( %tky        = ls_rekl-%tky
                        %state_area = 'KUNDE'
                        %msg        = new_message( id = 'ZQM_REKL' number = '001'
                                                   severity = if_abap_behv_message=>severity-error )
                        %element-Kunde = if_abap_behv=>mk-on ) TO reported-reklamation.
        CONTINUE.
      ENDIF.

      SELECT SINGLE kunnr, aufsd FROM kna1
        WHERE kunnr = @ls_rekl-Kunde
        INTO @DATA(ls_kna1).
      IF sy-subrc <> 0.
        APPEND VALUE #( %tky = ls_rekl-%tky ) TO failed-reklamation.
        APPEND VALUE #( %tky        = ls_rekl-%tky
                        %state_area = 'KUNDE'
                        %msg        = new_message( id = 'ZQM_REKL' number = '002' v1 = ls_rekl-Kunde
                                                   severity = if_abap_behv_message=>severity-error )
                        %element-Kunde = if_abap_behv=>mk-on ) TO reported-reklamation.
      ELSEIF ls_kna1-aufsd IS NOT INITIAL.
*       Auftragssperre: nur Hinweis, Reklamation darf trotzdem gesichert werden
        APPEND VALUE #( %tky        = ls_rekl-%tky
                        %state_area = 'KUNDE'
                        %msg        = new_message( id = 'ZQM_REKL' number = '003' v1 = ls_rekl-Kunde
                                                   severity = if_abap_behv_message=>severity-warning ) ) TO reported-reklamation.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD eskalieren.
    READ ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        FIELDS ( Status Eingangsdatum Schadenshoehe Eskalationsstufe ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_rekl).

    LOOP AT lt_rekl ASSIGNING FIELD-SYMBOL(<ls_rekl>).
      IF <ls_rekl>-Status = gc_status-abgeschlossen.
        APPEND VALUE #( %tky = <ls_rekl>-%tky ) TO failed-reklamation.
        APPEND VALUE #( %tky = <ls_rekl>-%tky
                        %msg = new_message( id = 'ZQM_REKL' number = '010'
                                            severity = if_abap_behv_message=>severity-error ) ) TO reported-reklamation.
        CONTINUE.
      ENDIF.

      <ls_rekl>-Eskalationsstufe = zbp_i_reklamation=>ermittle_stufe(
                                     iv_eingang   = <ls_rekl>-Eingangsdatum
                                     iv_schaden   = <ls_rekl>-Schadenshoehe
                                     iv_stufe_alt = <ls_rekl>-Eskalationsstufe ).
      <ls_rekl>-Status = gc_status-eskaliert.
    ENDLOOP.

    MODIFY ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        UPDATE FIELDS ( Status Eskalationsstufe )
        WITH VALUE #( FOR ls_rekl IN lt_rekl WHERE ( Status = gc_status-eskaliert )
                      ( %tky             = ls_rekl-%tky
                        Status           = ls_rekl-Status
                        Eskalationsstufe = ls_rekl-Eskalationsstufe ) ).

    READ ENTITIES OF zi_reklamation IN LOCAL MODE
      ENTITY reklamation
        ALL FIELDS WITH CORRESPONDING #( keys )
      RESULT DATA(lt_result).

    result = VALUE #( FOR ls_res IN lt_result ( %tky = ls_res-%tky %param = ls_res ) ).
  ENDMETHOD.

ENDCLASS.
