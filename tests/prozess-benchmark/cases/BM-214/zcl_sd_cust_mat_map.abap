CLASS zcl_sd_cust_mat_map DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

  PUBLIC SECTION.
    CLASS-METHODS to_material
      IMPORTING iv_kunnr        TYPE kunnr
                iv_vkorg        TYPE vkorg
                iv_vtweg        TYPE vtweg
                iv_kdmat        TYPE matnr_ku
      RETURNING VALUE(rv_matnr) TYPE matnr.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_buf,
             kunnr TYPE kunnr,
             kdmat TYPE matnr_ku,
             matnr TYPE matnr,
           END OF ty_buf.
    CLASS-DATA gt_buffer TYPE HASHED TABLE OF ty_buf WITH UNIQUE KEY kunnr kdmat.
ENDCLASS.



CLASS zcl_sd_cust_mat_map IMPLEMENTATION.

  METHOD to_material.
    READ TABLE gt_buffer INTO DATA(ls_buf)
      WITH TABLE KEY kunnr = iv_kunnr kdmat = iv_kdmat.
    IF sy-subrc = 0.
      rv_matnr = ls_buf-matnr.
      RETURN.
    ENDIF.

*   1. Kunden-Material-Info (VD51)
    SELECT SINGLE matnr FROM knmt INTO rv_matnr
      WHERE vkorg = iv_vkorg
        AND vtweg = iv_vtweg
        AND kunnr = iv_kunnr
        AND kdmat = iv_kdmat.
    IF sy-subrc <> 0.
*     2. Handel sendet oft die EAN statt Kundenmaterial
      SELECT SINGLE matnr FROM mean INTO rv_matnr
        WHERE ean11 = iv_kdmat(18).
    ENDIF.

*   auch "nicht gefunden" puffern, damit das IDoc nicht mehrfach sucht
    INSERT VALUE #( kunnr = iv_kunnr kdmat = iv_kdmat matnr = rv_matnr )
      INTO TABLE gt_buffer.
  ENDMETHOD.

ENDCLASS.
