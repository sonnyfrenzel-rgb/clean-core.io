*&---------------------------------------------------------------------*
*& Include ZSD_RET_DISPOSITION_C01 - Anwendung und Dispositionsklassen
*&---------------------------------------------------------------------*
INTERFACE lif_dispo.
  METHODS execute
    CHANGING cs_ret TYPE ty_ret
    RAISING  zcx_sd_ret.
ENDINTERFACE.

*----------------------------------------------------------------------*
* Wiedereinlagerung: Retourenbestand -> frei verwendbar (453)
*----------------------------------------------------------------------*
CLASS lcl_dispo_restock DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_dispo.
    METHODS constructor IMPORTING is_cfg TYPE zsd_ret_dispo.
  PRIVATE SECTION.
    DATA ms_cfg TYPE zsd_ret_dispo.
ENDCLASS.

CLASS lcl_dispo_restock IMPLEMENTATION.
  METHOD constructor.
    ms_cfg = is_cfg.
  ENDMETHOD.

  METHOD lif_dispo~execute.
*   abgelaufene Chargen duerfen nicht zurueck in den freien Bestand
    SELECT SINGLE vfdat FROM mch1 INTO @DATA(lv_vfdat)
      WHERE matnr = @cs_ret-matnr
        AND charg = @cs_ret-charg.
    IF lv_vfdat IS NOT INITIAL AND lv_vfdat < sy-datum.
      RAISE EXCEPTION TYPE zcx_sd_ret
        EXPORTING
          textid = zcx_sd_ret=>batch_expired
          charg  = cs_ret-charg.
    ENDIF.
    PERFORM post_movement USING ms_cfg-bwart cs_ret-lgort space
                          CHANGING cs_ret.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Verschrottung aus Retourenbestand (555) auf Kostenstelle
*----------------------------------------------------------------------*
CLASS lcl_dispo_scrap DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_dispo.
    METHODS constructor IMPORTING is_cfg TYPE zsd_ret_dispo.
  PRIVATE SECTION.
    DATA ms_cfg TYPE zsd_ret_dispo.
ENDCLASS.

CLASS lcl_dispo_scrap IMPLEMENTATION.
  METHOD constructor.
    ms_cfg = is_cfg.
  ENDMETHOD.

  METHOD lif_dispo~execute.
    IF ms_cfg-kostl IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_ret
        EXPORTING
          textid = zcx_sd_ret=>no_cost_center
          augru  = cs_ret-augru.
    ENDIF.
    PERFORM post_movement USING ms_cfg-bwart cs_ret-lgort ms_cfg-kostl
                          CHANGING cs_ret.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Reparatur: Umlagerung ins Reparaturlager + Tracking-Eintrag
*----------------------------------------------------------------------*
CLASS lcl_dispo_repair DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_dispo.
    METHODS constructor IMPORTING is_cfg TYPE zsd_ret_dispo.
  PRIVATE SECTION.
    DATA ms_cfg TYPE zsd_ret_dispo.
ENDCLASS.

CLASS lcl_dispo_repair IMPLEMENTATION.
  METHOD constructor.
    ms_cfg = is_cfg.
  ENDMETHOD.

  METHOD lif_dispo~execute.
    DATA ls_rep TYPE zsd_ret_repair.
    PERFORM post_movement USING ms_cfg-bwart ms_cfg-lgort_to space
                          CHANGING cs_ret.
    ls_rep-vbeln  = cs_ret-vbeln.
    ls_rep-posnr  = cs_ret-posnr.
    ls_rep-matnr  = cs_ret-matnr.
    ls_rep-charg  = cs_ret-charg.
    ls_rep-mblnr  = cs_ret-mblnr.
    ls_rep-status = 'OPEN'.
    ls_rep-erdat  = sy-datum.
    INSERT zsd_ret_repair FROM ls_rep.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Fabrik: Disposition je Retourengrund
*----------------------------------------------------------------------*
CLASS lcl_dispo_factory DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS get
      IMPORTING iv_augru        TYPE augru
      RETURNING VALUE(ro_dispo) TYPE REF TO lif_dispo
      RAISING   zcx_sd_ret.
ENDCLASS.

CLASS lcl_dispo_factory IMPLEMENTATION.
  METHOD get.
    DATA(ls_cfg) = zcl_sd_ret_reason=>get_config( iv_augru ).
    CASE ls_cfg-dispo.
      WHEN 'RESTOCK'.
        ro_dispo = NEW lcl_dispo_restock( ls_cfg ).
      WHEN 'SCRAP'.
        ro_dispo = NEW lcl_dispo_scrap( ls_cfg ).
      WHEN 'REPAIR'.
        ro_dispo = NEW lcl_dispo_repair( ls_cfg ).
      WHEN OTHERS.
        RAISE EXCEPTION TYPE zcx_sd_ret
          EXPORTING
            textid = zcx_sd_ret=>no_disposition
            augru  = iv_augru.
    ENDCASE.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Anwendung: SALV-Liste mit Funktion DISPO
*----------------------------------------------------------------------*
CLASS lcl_app DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS display.
  PRIVATE SECTION.
    DATA mo_alv TYPE REF TO cl_salv_table.
    METHODS on_user_command FOR EVENT added_function OF cl_salv_events
      IMPORTING e_salv_function.
    METHODS process_selected.
ENDCLASS.

CLASS lcl_app IMPLEMENTATION.
  METHOD display.
    DATA lx_salv TYPE REF TO cx_salv_msg.
    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = mo_alv
                                CHANGING  t_table      = gt_ret ).
        mo_alv->set_screen_status( pfstatus      = 'ZRET_DISPO'
                                   report        = sy-repid
                                   set_functions = cl_salv_table=>c_functions_all ).
        mo_alv->get_selections( )->set_selection_mode( if_salv_c_selection_mode=>row_column ).
        SET HANDLER on_user_command FOR mo_alv->get_event( ).
        mo_alv->display( ).
      CATCH cx_salv_msg INTO lx_salv.
        MESSAGE lx_salv TYPE 'I'.
    ENDTRY.
  ENDMETHOD.

  METHOD on_user_command.
    CASE e_salv_function.
      WHEN 'DISPO'.
        process_selected( ).
        mo_alv->refresh( ).
      WHEN OTHERS.
*       Standardfunktionen erledigt SALV selbst
    ENDCASE.
  ENDMETHOD.

  METHOD process_selected.
    DATA: lx_ret TYPE REF TO zcx_sd_ret,
          ls_log TYPE zsd_ret_log.

    DATA(lt_rows) = mo_alv->get_selections( )->get_selected_rows( ).
    IF lt_rows IS INITIAL.
      MESSAGE i398(00) WITH 'Bitte Retourenpositionen markieren'.
      RETURN.
    ENDIF.

    LOOP AT lt_rows INTO DATA(lv_row).
      READ TABLE gt_ret ASSIGNING <gs_ret> INDEX lv_row.
      CHECK <gs_ret>-status <> 'DONE'.
      TRY.
          DATA(lo_dispo) = lcl_dispo_factory=>get( <gs_ret>-augru ).
          lo_dispo->execute( CHANGING cs_ret = <gs_ret> ).
          <gs_ret>-status = 'DONE'.
          CLEAR <gs_ret>-msg.
        CATCH zcx_sd_ret INTO lx_ret.
          <gs_ret>-status = 'ERR'.
          <gs_ret>-msg    = lx_ret->get_text( ).
      ENDTRY.
      MOVE-CORRESPONDING <gs_ret> TO ls_log.
      ls_log-uname = sy-uname.
      ls_log-datum = sy-datum.
      MODIFY zsd_ret_log FROM ls_log.
    ENDLOOP.

    PERFORM create_credit_memos.
  ENDMETHOD.
ENDCLASS.
