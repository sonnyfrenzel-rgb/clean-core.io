*"* Behavior Pool ZBP_R_UMBUCHUNG - Saver (unmanaged)
CLASS lsc_zr_umbuchung DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS check_before_save REDEFINITION.
    METHODS save              REDEFINITION.
    METHODS cleanup           REDEFINITION.
ENDCLASS.

CLASS lsc_zr_umbuchung IMPLEMENTATION.

  METHOD check_before_save.
    LOOP AT VALUE zcl_mm_umbuchung_buffer=>tt_umb( ( LINES OF zcl_mm_umbuchung_buffer=>mt_ins )
                                                   ( LINES OF zcl_mm_umbuchung_buffer=>mt_upd ) )
         INTO DATA(ls_umb).

      IF ls_umb-lgort_von = ls_umb-lgort_nach.
        APPEND VALUE #( UmbuchungId = ls_umb-umb_id ) TO failed-umbuchung.
        APPEND VALUE #( UmbuchungId = ls_umb-umb_id
                        %msg = new_message( id = 'ZMM_UMB' number = '040'
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
        CONTINUE.
      ENDIF.

*     frei verwendbarer Bestand am Von-Lagerort muss reichen
      SELECT SINGLE labst FROM mard
        WHERE matnr = @ls_umb-matnr
          AND werks = @ls_umb-werks
          AND lgort = @ls_umb-lgort_von
        INTO @DATA(lv_labst).
      IF sy-subrc <> 0 OR lv_labst < ls_umb-menge.
        APPEND VALUE #( UmbuchungId = ls_umb-umb_id ) TO failed-umbuchung.
        APPEND VALUE #( UmbuchungId = ls_umb-umb_id
                        %msg = new_message( id = 'ZMM_UMB' number = '041'
                                            v1 = ls_umb-matnr v2 = ls_umb-lgort_von
                                            severity = if_abap_behv_message=>severity-error ) )
               TO reported-umbuchung.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD save.
    DATA(lt_ins) = zcl_mm_umbuchung_buffer=>mt_ins.
    DATA(lt_upd) = zcl_mm_umbuchung_buffer=>mt_upd.

    IF lt_ins IS NOT INITIAL OR lt_upd IS NOT INITIAL.
      CALL FUNCTION 'Z_MM_UMBUCHUNG_UPD' IN UPDATE TASK
        EXPORTING
          it_ins = lt_ins
          it_upd = lt_upd.
    ENDIF.

*   Warenbewegung 311 je zu buchendem Auftrag - eigene LUW nach dem Commit
*   (bis 2023-06 direkt hier gebucht - Laufzeitfehler BEHAVIOR_ILLEGAL_STATEMENT,
*    weil der BAPI in der Save-Phase selbst verbucht; Rest zur Doku:)
*    DATA: ls_head   TYPE bapi2017_gm_head_01,
*          lt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
*          lt_return TYPE STANDARD TABLE OF bapiret2.
*    LOOP AT lt_upd INTO DATA(ls_alt) WHERE status = 'P'.
*      ls_head = VALUE #( pstng_date = sy-datum doc_date = sy-datum ).
*      lt_item = VALUE #( ( material_long = ls_alt-matnr plant = ls_alt-werks
*                           stge_loc = ls_alt-lgort_von move_stloc = ls_alt-lgort_nach
*                           move_type = '311' entry_qnt = ls_alt-menge
*                           entry_uom = ls_alt-meins ) ).
*      CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
*        EXPORTING
*          goodsmvt_header = ls_head
*          goodsmvt_code   = '04'
*        TABLES
*          goodsmvt_item   = lt_item
*          return          = lt_return.
*    ENDLOOP.
    LOOP AT lt_upd INTO DATA(ls_upd) WHERE status = zbp_r_umbuchung=>gc_status-zu_buchen.
      CALL FUNCTION 'Z_MM_UMBUCHUNG_BUCHEN'
        IN BACKGROUND TASK AS SEPARATE UNIT
        EXPORTING
          iv_umb_id = ls_upd-umb_id.
    ENDLOOP.
  ENDMETHOD.


  METHOD cleanup.
    zcl_mm_umbuchung_buffer=>leeren( ).
  ENDMETHOD.

ENDCLASS.
