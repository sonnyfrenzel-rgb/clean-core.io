REPORT zsd_return_precheck.
*----------------------------------------------------------------------*
* Vorpruefung Retourenanfrage (Kundenservice) vor Anlage RE-Auftrag
* Validator-Kette; Ablehnungsgrund wird ueber Ereignis protokolliert
* 02.2020 SKA  initial / 07.2021 SKA Mengenpruefung auf Material
*----------------------------------------------------------------------*
PARAMETERS: p_fkbel TYPE vbeln_vf OBLIGATORY,
            p_matnr TYPE matnr    OBLIGATORY,
            p_menge TYPE fkimg    OBLIGATORY.

INTERFACE lif_validator.
  DATA mv_name TYPE string READ-ONLY.
  METHODS validate
    IMPORTING is_vbrk      TYPE vbrk
    RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDINTERFACE.

CLASS lcl_val_period DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_validator.
ENDCLASS.

CLASS lcl_val_period IMPLEMENTATION.
  METHOD lif_validator~validate.
    lif_validator~mv_name = 'Rueckgabefrist 30 Tage'.
    rv_ok = xsdbool( sy-datum - is_vbrk-fkdat <= 30 ).
  ENDMETHOD.
ENDCLASS.

CLASS lcl_val_quantity DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_validator.
ENDCLASS.

CLASS lcl_val_quantity IMPLEMENTATION.
  METHOD lif_validator~validate.
    DATA lv_fkimg TYPE fkimg.
    lif_validator~mv_name = 'Fakturierte Menge'.
    SELECT SUM( fkimg ) FROM vbrp INTO lv_fkimg
      WHERE vbeln = is_vbrk-vbeln
        AND matnr = p_matnr.
    rv_ok = xsdbool( lv_fkimg >= p_menge ).
  ENDMETHOD.
ENDCLASS.

CLASS lcl_chain DEFINITION.
  PUBLIC SECTION.
    EVENTS validation_failed EXPORTING VALUE(iv_name) TYPE string.
    DATA mt_validators TYPE STANDARD TABLE OF REF TO lif_validator.
    METHODS run
      IMPORTING is_vbrk      TYPE vbrk
      RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.

CLASS lcl_chain IMPLEMENTATION.
  METHOD run.
    rv_ok = abap_true.
    LOOP AT mt_validators INTO DATA(lo_val).
      IF lo_val->validate( is_vbrk ) = abap_false.
        RAISE EVENT validation_failed EXPORTING iv_name = lo_val->mv_name.
        rv_ok = abap_false.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_protocol DEFINITION.
  PUBLIC SECTION.
    METHODS on_failed FOR EVENT validation_failed OF lcl_chain
      IMPORTING iv_name.
ENDCLASS.

CLASS lcl_protocol IMPLEMENTATION.
  METHOD on_failed.
    WRITE: / 'Retoure abgelehnt, Pruefung:'(001), iv_name.
  ENDMETHOD.
ENDCLASS.

DATA gs_vbrk TYPE vbrk.

START-OF-SELECTION.
  SELECT SINGLE * FROM vbrk INTO gs_vbrk WHERE vbeln = p_fkbel.
  IF sy-subrc <> 0 OR gs_vbrk-fksto = abap_true.
    MESSAGE e398(00) WITH 'Referenzrechnung fehlt oder ist storniert' p_fkbel.
  ENDIF.

  DATA(go_chain) = NEW lcl_chain( ).
  DATA(go_prot)  = NEW lcl_protocol( ).
  APPEND NEW lcl_val_period( ) TO go_chain->mt_validators.
  APPEND NEW lcl_val_quantity( ) TO go_chain->mt_validators.
* APPEND NEW lcl_val_blocked( ) TO go_chain->mt_validators.  "entfallen 2021
  SET HANDLER go_prot->on_failed FOR go_chain.

  IF go_chain->run( gs_vbrk ) = abap_true.
    WRITE: / 'Retoure zulaessig - RE-Auftrag kann angelegt werden'(002).
  ENDIF.
