*"* Saver des Behavior Pools ZBP_I_REKLAMATION (managed with additional save)
CLASS lsc_zi_reklamation DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_zi_reklamation IMPLEMENTATION.

  METHOD save_modified.
    DATA: lt_log TYPE STANDARD TABLE OF ztqm_rekl_log,
          lv_ts  TYPE timestampl.

    GET TIME STAMP FIELD lv_ts.

*   Anlageprotokoll
    LOOP AT create-reklamation INTO DATA(ls_neu).
      APPEND VALUE #( rekl_id = ls_neu-ReklamationId
                      zeitpunkt = lv_ts
                      aktion  = 'ANLAGE'
                      kunde   = ls_neu-Kunde
                      benutzer = sy-uname ) TO lt_log.
    ENDLOOP.

*   Eskalationsprotokoll + Info an QM-Leitung ab Stufe 3
    LOOP AT update-reklamation INTO DATA(ls_upd)
         WHERE %control-Eskalationsstufe = if_abap_behv=>mk-on.
      APPEND VALUE #( rekl_id   = ls_upd-ReklamationId
                      zeitpunkt = lv_ts
                      aktion    = 'ESKALATION'
                      stufe     = ls_upd-Eskalationsstufe
                      benutzer  = sy-uname ) TO lt_log.

      IF ls_upd-Eskalationsstufe = '3'.
        CALL FUNCTION 'ZQM_REKL_INFORM_LEITUNG'
          IN BACKGROUND TASK AS SEPARATE UNIT
          EXPORTING
            iv_rekl_id = ls_upd-ReklamationId.
      ENDIF.
    ENDLOOP.

    IF lt_log IS NOT INITIAL.
      INSERT ztqm_rekl_log FROM TABLE @lt_log ACCEPTING DUPLICATE KEYS.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
