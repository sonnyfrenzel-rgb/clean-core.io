CLASS zcl_sd_seg_handler DEFINITION
  PUBLIC
  ABSTRACT
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Basis fuer Segment-Handler der Versandbestaetigung (Schablonenmethode):
*   HANDLE = VALIDATE (redefinierbar) + APPLY (abstrakt)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS create
      IMPORTING iv_segnam         TYPE edilsegtyp
      RETURNING VALUE(ro_handler) TYPE REF TO zcl_sd_seg_handler.

    METHODS handle FINAL
      IMPORTING is_edidd TYPE edidd
      CHANGING  cs_ctx   TYPE zsd_s_shpconf_ctx
      RAISING   zcx_sd_shpconf.

  PROTECTED SECTION.
    METHODS validate
      IMPORTING is_edidd TYPE edidd
                is_ctx   TYPE zsd_s_shpconf_ctx
      RAISING   zcx_sd_shpconf.

    METHODS apply ABSTRACT
      IMPORTING is_edidd TYPE edidd
      CHANGING  cs_ctx   TYPE zsd_s_shpconf_ctx
      RAISING   zcx_sd_shpconf.
ENDCLASS.



CLASS zcl_sd_seg_handler IMPLEMENTATION.

  METHOD create.
    CASE iv_segnam.
      WHEN 'Z1SHPH'.
        ro_handler = NEW zcl_sd_seg_hdr( ).
      WHEN 'Z1SHPI'.
        ro_handler = NEW zcl_sd_seg_itm( ).
      WHEN OTHERS.
*       Z1SHPT (Freitexte) u. a. werden bewusst nicht verarbeitet
        CLEAR ro_handler.
    ENDCASE.
  ENDMETHOD.


  METHOD handle.
    validate( is_edidd = is_edidd is_ctx = cs_ctx ).
    apply( EXPORTING is_edidd = is_edidd
           CHANGING  cs_ctx   = cs_ctx ).
  ENDMETHOD.


  METHOD validate.
*   Grundpruefung fuer alle Segmente
    IF is_edidd-sdata IS INITIAL.
      RAISE EXCEPTION TYPE zcx_sd_shpconf
        EXPORTING
          textid = zcx_sd_shpconf=>empty_segment.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
