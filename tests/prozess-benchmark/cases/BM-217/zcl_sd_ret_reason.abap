CLASS zcl_sd_ret_reason DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

*----------------------------------------------------------------------*
* Dispositionsregel je Retourengrund (Pflege ZSD_RET_DISPO, SM30)
* Eintrag mit AUGRU = '*' gilt als Rueckfallregel
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS get_config
      IMPORTING iv_augru      TYPE augru
      RETURNING VALUE(rs_cfg) TYPE zsd_ret_dispo.
ENDCLASS.



CLASS zcl_sd_ret_reason IMPLEMENTATION.

  METHOD get_config.
    SELECT SINGLE * FROM zsd_ret_dispo INTO rs_cfg
      WHERE augru = iv_augru.
    IF sy-subrc <> 0.
      SELECT SINGLE * FROM zsd_ret_dispo INTO rs_cfg
        WHERE augru = '*'.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
