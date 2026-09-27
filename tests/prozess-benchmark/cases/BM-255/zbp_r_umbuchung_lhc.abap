*"* Behavior Pool ZBP_R_UMBUCHUNG - lokaler Handler (unmanaged)
*"* Umbuchungsauftraege Lagerort -> Lagerort (Bewegungsart 311)
*"*
*"* Ablauf in der App:
*"*   1. Anlegen   -> CREATE (Nummer sofort aus Nummernkreis, Status O)
*"*   2. Korrektur -> UPDATE (nur Menge, nur solange Status O)
*"*   3. Buchen    -> Aktion BUCHEN setzt Status P; die Warenbewegung
*"*                  selbst entsteht erst nach dem Commit (siehe Saver)
*"*   Sperre ueber ENQUEUE_EZMM_UMB (Sperrobjekt auf ZMM_UMBUCHUNG)
CLASS lhc_umbuchung DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR umbuchung RESULT result.
    METHODS create FOR MODIFY
      IMPORTING entities FOR CREATE umbuchung.
    METHODS update FOR MODIFY
      IMPORTING entities FOR UPDATE umbuchung.
    METHODS read FOR READ
      IMPORTING keys FOR READ umbuchung RESULT result.
    METHODS lock FOR LOCK
      IMPORTING keys FOR LOCK umbuchung.
    METHODS buchen FOR MODIFY
      IMPORTING keys FOR ACTION umbuchung~buchen RESULT result.
ENDCLASS.

CLASS lhc_umbuchung IMPLEMENTATION.

  METHOD get_global_authorizations.
    DATA lv_auth LIKE if_abap_behv=>auth-allowed.

    AUTHORITY-CHECK OBJECT 'M_MSEG_BWA'
      ID 'ACTVT' FIELD '01'
      ID 'BWART' FIELD '311'.
    lv_auth = COND #( WHEN sy-subrc = 0 THEN if_abap_behv=>auth-allowed
                                        ELSE if_abap_behv=>auth-unauthorized ).

    IF requested_authorizations-%create = if_abap_behv=>mk-on.
      result-%create = lv_auth.
    ENDIF.
    IF requested_authorizations-%action-buchen = if_abap_behv=>mk-on.
      result-%action-buchen = lv_auth.
    ENDIF.
  ENDMETHOD.


  METHOD create.
    LOOP AT entities INTO DATA(ls_ent).
      IF ls_ent-Menge <= 0 OR ls_ent-Material IS INITIAL.
        APPEND VALUE #( %cid = ls_ent-%cid ) TO failed-umbuchung.
        APPEND VALUE #( %cid = ls_ent-%cid
                        %msg = new_message( id = 'ZMM_UMB' number = '001'
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
        CONTINUE.
      ENDIF.

      DATA(lv_id) = zcl_mm_umbuchung_buffer=>neu( VALUE #( matnr      = ls_ent-Material
                                             werks      = ls_ent-Werk
                                             lgort_von  = ls_ent-LagerortVon
                                             lgort_nach = ls_ent-LagerortNach
                                             menge      = ls_ent-Menge
                                             meins      = ls_ent-Mengeneinheit ) ).
      APPEND VALUE #( %cid = ls_ent-%cid UmbuchungId = lv_id ) TO mapped-umbuchung.
    ENDLOOP.
  ENDMETHOD.


  METHOD update.
    LOOP AT entities INTO DATA(ls_ent).
      DATA(ls_umb) = zcl_mm_umbuchung_buffer=>lesen( ls_ent-UmbuchungId ).
      IF ls_umb IS INITIAL.
        APPEND VALUE #( %tky = ls_ent-%tky %fail-cause = if_abap_behv=>cause-not_found )
               TO failed-umbuchung.
        CONTINUE.
      ENDIF.

      IF ls_umb-status <> zbp_r_umbuchung=>gc_status-offen.
        APPEND VALUE #( %tky = ls_ent-%tky ) TO failed-umbuchung.
        APPEND VALUE #( %tky = ls_ent-%tky
                        %msg = new_message( id = 'ZMM_UMB' number = '010' v1 = ls_ent-UmbuchungId
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
        CONTINUE.
      ENDIF.

*     aenderbar ist laut Verhaltensdefinition nur die Menge
      ls_umb-menge = ls_ent-Menge.
      zcl_mm_umbuchung_buffer=>aendern( ls_umb ).
    ENDLOOP.
  ENDMETHOD.


  METHOD read.
    LOOP AT keys INTO DATA(ls_key).
      DATA(ls_umb) = zcl_mm_umbuchung_buffer=>lesen( ls_key-UmbuchungId ).
      IF ls_umb IS INITIAL.
        APPEND VALUE #( %tky = ls_key-%tky %fail-cause = if_abap_behv=>cause-not_found )
               TO failed-umbuchung.
      ELSE.
        APPEND VALUE #( %tky          = ls_key-%tky
                        Material      = ls_umb-matnr
                        Werk          = ls_umb-werks
                        LagerortVon   = ls_umb-lgort_von
                        LagerortNach  = ls_umb-lgort_nach
                        Menge         = ls_umb-menge
                        Mengeneinheit = ls_umb-meins
                        Status        = ls_umb-status ) TO result.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD lock.
    LOOP AT keys INTO DATA(ls_key).
      CALL FUNCTION 'ENQUEUE_EZMM_UMB'
        EXPORTING
          umb_id         = ls_key-UmbuchungId
        EXCEPTIONS
          foreign_lock   = 1
          system_failure = 2
          OTHERS         = 3.
      IF sy-subrc <> 0.
        APPEND VALUE #( %tky = ls_key-%tky %fail-cause = if_abap_behv=>cause-locked )
               TO failed-umbuchung.
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = new_message( id = 'ZMM_UMB' number = '020' v1 = sy-msgv1
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD buchen.
    LOOP AT keys INTO DATA(ls_key).
      DATA(ls_umb) = zcl_mm_umbuchung_buffer=>lesen( ls_key-UmbuchungId ).
      IF ls_umb-status <> zbp_r_umbuchung=>gc_status-offen.
        APPEND VALUE #( %tky = ls_key-%tky ) TO failed-umbuchung.
        APPEND VALUE #( %tky = ls_key-%tky
                        %msg = new_message( id = 'ZMM_UMB' number = '030' v1 = ls_key-UmbuchungId
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
        CONTINUE.
      ENDIF.

      ls_umb-status = zbp_r_umbuchung=>gc_status-zu_buchen.
      zcl_mm_umbuchung_buffer=>aendern( ls_umb ).

      APPEND VALUE #( %tky = ls_key-%tky
                      %param = CORRESPONDING #( ls_umb MAPPING Status = status ) ) TO result.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
