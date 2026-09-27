*----------------------------------------------------------------------*
* Include LZMM_KITC01 - Sperrverwaltung, Kit-Aufbau, Zuteilungsstrategien
*----------------------------------------------------------------------*
CLASS lcx_kit DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string.
ENDCLASS.

CLASS lcx_kit IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Sperr-Manager: merkt sich alle gesetzten Sperren und loest sie gesammelt
*----------------------------------------------------------------------*
CLASS lcl_lock_manager DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS lock_material
      IMPORTING iv_matnr TYPE matnr
                iv_werks TYPE werks_d
      RAISING   lcx_kit.
    METHODS release_all.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_lock,
             matnr TYPE matnr,
             werks TYPE werks_d,
           END OF ty_lock.
    DATA mt_locks TYPE STANDARD TABLE OF ty_lock.
ENDCLASS.

CLASS lcl_lock_manager IMPLEMENTATION.
  METHOD lock_material.
    CALL FUNCTION 'ENQUEUE_EZ_KIT_MAT'
      EXPORTING
        matnr          = iv_matnr
        werks          = iv_werks
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_kit
        EXPORTING iv_text = |Material { iv_matnr } wird von { sy-msgv1 } bearbeitet|.
    ENDIF.
    APPEND VALUE #( matnr = iv_matnr werks = iv_werks ) TO mt_locks.
  ENDMETHOD.

  METHOD release_all.
    LOOP AT mt_locks INTO DATA(ls_lock).
      CALL FUNCTION 'DEQUEUE_EZ_KIT_MAT'
        EXPORTING
          matnr = ls_lock-matnr
          werks = ls_lock-werks.
    ENDLOOP.
    CLEAR mt_locks.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Kit-Aufbau aus den Auftragskomponenten
*----------------------------------------------------------------------*
CLASS lcl_kit_builder DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS components_for_order
      IMPORTING iv_aufnr       TYPE aufnr
                iv_werks       TYPE werks_d
      RETURNING VALUE(rt_comp) TYPE tt_comp
      RAISING   lcx_kit.
    CLASS-METHODS assert_complete
      IMPORTING it_comp    TYPE tt_comp
                iv_partial TYPE abap_bool
      RAISING   lcx_kit.
ENDCLASS.

CLASS lcl_kit_builder IMPLEMENTATION.
  METHOD components_for_order.
    DATA lt_raw TYPE tt_comp.

    SELECT SINGLE werks FROM aufk INTO @DATA(lv_werks)
      WHERE aufnr = @iv_aufnr
        AND autyp = '10'.
    IF sy-subrc <> 0 OR lv_werks <> iv_werks.
      RAISE EXCEPTION TYPE lcx_kit
        EXPORTING iv_text = |Fertigungsauftrag { iv_aufnr } nicht im Werk { iv_werks }|.
    ENDIF.

*   offene, nicht geloeschte, nicht ausgefasste Komponenten (ohne Phantome)
    SELECT rsnum rspos matnr werks lgort meins bdmng enmng
      FROM resb
      INTO CORRESPONDING FIELDS OF TABLE lt_raw
      WHERE aufnr = iv_aufnr
        AND xloek = space
        AND kzear = space
        AND dumps = space.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_kit
        EXPORTING iv_text = |Auftrag { iv_aufnr } hat keine offenen Komponenten|.
    ENDIF.

    rt_comp = VALUE #( FOR c IN lt_raw
                       ( rsnum    = c-rsnum
                         rspos    = c-rspos
                         matnr    = c-matnr
                         werks    = c-werks
                         lgort    = c-lgort
                         meins    = c-meins
                         bdmng    = c-bdmng
                         enmng    = c-enmng
                         open_qty = c-bdmng - c-enmng ) ).
  ENDMETHOD.

  METHOD assert_complete.
    CHECK iv_partial = abap_false.
    LOOP AT it_comp TRANSPORTING NO FIELDS WHERE open_qty > 0.
      RAISE EXCEPTION TYPE lcx_kit
        EXPORTING iv_text = 'Kit unvollstaendig, Teilreservierung nicht erlaubt'.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Zuteilungsstrategien
*----------------------------------------------------------------------*
INTERFACE lif_alloc_strategy.
  METHODS allocate
    CHANGING cs_comp TYPE ty_comp.
ENDINTERFACE.

* Chargenpflichtige Materialien: FIFO nach Verfallsdatum
CLASS lcl_alloc_fifo DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_alloc_strategy.
ENDCLASS.

CLASS lcl_alloc_fifo IMPLEMENTATION.
  METHOD lif_alloc_strategy~allocate.
    DATA: lv_charg TYPE charg_d,
          lv_clabs TYPE labst.

    SELECT b~charg b~clabs
      FROM mchb AS b
      INNER JOIN mch1 AS h ON h~matnr = b~matnr
                          AND h~charg = b~charg
      INTO (lv_charg, lv_clabs)
      WHERE b~matnr = cs_comp-matnr
        AND b~werks = cs_comp-werks
        AND b~lgort = cs_comp-lgort
        AND b~clabs > 0
        AND h~zustd = space
      ORDER BY h~vfdat ASCENDING.
*     nur eine Charge je Komponente (Wagenfach), aelteste zuerst
      cs_comp-charg    = lv_charg.
      cs_comp-alloc    = nmin( val1 = lv_clabs val2 = cs_comp-open_qty ).
      cs_comp-open_qty = cs_comp-open_qty - cs_comp-alloc.
      IF cs_comp-alloc > 0.
        EXIT.
      ENDIF.
    ENDSELECT.
  ENDMETHOD.
ENDCLASS.

* Schuettgut / ohne Charge: ATP-Pruefung
CLASS lcl_alloc_bulk DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_alloc_strategy.
ENDCLASS.

CLASS lcl_alloc_bulk IMPLEMENTATION.
  METHOD lif_alloc_strategy~allocate.
    DATA: lv_avail  TYPE mng01,
          ls_return TYPE bapireturn,
          lt_wmdvsx TYPE STANDARD TABLE OF bapiwmdvs,
          lt_wmdvex TYPE STANDARD TABLE OF bapiwmdve.

    APPEND VALUE #( req_date = sy-datum req_qty = cs_comp-open_qty ) TO lt_wmdvsx.
    CALL FUNCTION 'BAPI_MATERIAL_AVAILABILITY'
      EXPORTING
        plant      = cs_comp-werks
        material   = cs_comp-matnr
        unit       = cs_comp-meins
        check_rule = 'PP'
        stge_loc   = cs_comp-lgort
      IMPORTING
        av_qty_plt = lv_avail
        return     = ls_return
      TABLES
        wmdvsx     = lt_wmdvsx
        wmdvex     = lt_wmdvex.
    IF ls_return-type = 'E'.
      RETURN.                                  " nichts zuteilen
    ENDIF.
    cs_comp-alloc    = nmin( val1 = lv_avail val2 = cs_comp-open_qty ).
    cs_comp-open_qty = cs_comp-open_qty - cs_comp-alloc.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_alloc_factory DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS for_material
      IMPORTING iv_matnr           TYPE matnr
                iv_werks           TYPE werks_d
      RETURNING VALUE(ro_strategy) TYPE REF TO lif_alloc_strategy.
ENDCLASS.

CLASS lcl_alloc_factory IMPLEMENTATION.
  METHOD for_material.
    SELECT SINGLE xchpf FROM marc INTO @DATA(lv_xchpf)
      WHERE matnr = @iv_matnr
        AND werks = @iv_werks.
    IF lv_xchpf = abap_true.
      ro_strategy = NEW lcl_alloc_fifo( ).
    ELSE.
      ro_strategy = NEW lcl_alloc_bulk( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
