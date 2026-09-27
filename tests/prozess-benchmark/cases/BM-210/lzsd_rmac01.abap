*----------------------------------------------------------------------*
* Include LZSD_RMAC01 - Validator-Kette Retouren
*----------------------------------------------------------------------*
CLASS lcx_rma_rejected DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_reason TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_reason TYPE string.
ENDCLASS.

CLASS lcx_rma_rejected IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_reason = iv_reason.
  ENDMETHOD.
ENDCLASS.

INTERFACE lif_rma_validator.
  METHODS check
    IMPORTING is_vbrk TYPE vbrk
              is_item TYPE ty_rma_item
    RAISING   lcx_rma_rejected.
ENDINTERFACE.

CLASS lcl_val_period DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_rma_validator.
ENDCLASS.

CLASS lcl_val_period IMPLEMENTATION.
  METHOD lif_rma_validator~check.
    DATA lv_max TYPE i.
    SELECT SINGLE max_days FROM zsd_rma_period INTO lv_max
      WHERE vkorg = is_vbrk-vkorg.
    IF sy-subrc <> 0.
      lv_max = gc_max_days_default.
    ENDIF.
    IF sy-datum - is_vbrk-fkdat > lv_max.
      RAISE EXCEPTION TYPE lcx_rma_rejected
        EXPORTING iv_reason = |Rueckgabefrist { lv_max } Tage ueberschritten|.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_val_quantity DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_rma_validator.
ENDCLASS.

CLASS lcl_val_quantity IMPLEMENTATION.
  METHOD lif_rma_validator~check.
    DATA: lv_billed   TYPE fkimg,
          lv_returned TYPE kwmeng.
    SELECT SUM( fkimg ) FROM vbrp INTO lv_billed
      WHERE vbeln = is_vbrk-vbeln
        AND matnr = is_item-matnr.
*   bereits angelegte Retouren zu dieser Rechnung abziehen
    SELECT SUM( p~kwmeng ) FROM vbak AS k
      INNER JOIN vbap AS p ON p~vbeln = k~vbeln
      INTO lv_returned
      WHERE k~auart = gc_auart
        AND p~vgbel = is_vbrk-vbeln
        AND p~matnr = is_item-matnr
        AND p~abgru = space.
    IF lv_billed - lv_returned < is_item-menge.
      RAISE EXCEPTION TYPE lcx_rma_rejected
        EXPORTING iv_reason = |Menge { is_item-matnr } groesser als offene Faktura|.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_validator_chain DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS build
      IMPORTING iv_vkorg        TYPE vkorg
      RETURNING VALUE(ro_chain) TYPE REF TO lcl_validator_chain.
    METHODS validate
      IMPORTING is_vbrk TYPE vbrk
                is_item TYPE ty_rma_item
      RAISING   lcx_rma_rejected.
    METHODS add
      IMPORTING io_validator TYPE REF TO lif_rma_validator.
  PRIVATE SECTION.
    DATA mt_validators TYPE STANDARD TABLE OF REF TO lif_rma_validator.
ENDCLASS.

CLASS lcl_validator_chain IMPLEMENTATION.
  METHOD build.
    DATA lv_valid TYPE char10.
    ro_chain = NEW lcl_validator_chain( ).
*   aktive Pruefungen je Verkaufsorganisation, Reihenfolge = Sortierfeld
    SELECT valid FROM zsd_rma_valcfg INTO lv_valid
      WHERE vkorg  = iv_vkorg
        AND active = abap_true
      ORDER BY sortf.
      CASE lv_valid.
        WHEN 'PERIOD'.
          ro_chain->add( NEW lcl_val_period( ) ).
        WHEN 'QUANTITY'.
          ro_chain->add( NEW lcl_val_quantity( ) ).
        WHEN OTHERS.
*         unbekannte Pruefung wird ignoriert (Altlast 'SERIAL')
      ENDCASE.
    ENDSELECT.
  ENDMETHOD.

  METHOD add.
    APPEND io_validator TO mt_validators.
  ENDMETHOD.

  METHOD validate.
    LOOP AT mt_validators INTO DATA(lo_val).
      lo_val->check( is_vbrk = is_vbrk
                     is_item = is_item ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
