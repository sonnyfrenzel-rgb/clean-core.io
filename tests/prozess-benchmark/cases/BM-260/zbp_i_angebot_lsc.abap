*"* Saver (CCIMP-Teil 3) - managed with additional save
CLASS lsc_zi_angebot DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_zi_angebot IMPLEMENTATION.

  METHOD save_modified.
    DATA lt_log TYPE STANDARD TABLE OF zsd_angebot_log WITH EMPTY KEY.

    LOOP AT update-kopf INTO DATA(ls_kopf) WHERE %control-Status = if_abap_behv=>mk-on.

      APPEND VALUE #( angebot_id = ls_kopf-AngebotId
                      status_neu = ls_kopf-Status
                      benutzer   = sy-uname
                      datum      = sy-datum ) TO lt_log.

      IF ls_kopf-Status = zbp_i_angebot=>gc_status-genehmigung.
        RAISE ENTITY EVENT zi_angebot~GenehmigungAngefordert
          FROM VALUE #( ( AngebotId = ls_kopf-AngebotId
                          %param    = VALUE #( gesamtwert = ls_kopf-Gesamtwert
                                               angefordert_von = sy-uname ) ) ).
      ENDIF.
    ENDLOOP.

    IF lt_log IS NOT INITIAL.
      INSERT zsd_angebot_log FROM TABLE @lt_log.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
