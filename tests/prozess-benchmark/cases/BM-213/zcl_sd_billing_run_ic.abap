CLASS zcl_sd_billing_run_ic DEFINITION
  PUBLIC
  INHERITING FROM zcl_sd_billing_run
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING it_vkorg TYPE tt_r_vkorg
      RAISING   zcx_sd_billing.

  PROTECTED SECTION.
    METHODS select_due REDEFINITION.
    METHODS post_process REDEFINITION.

  PRIVATE SECTION.
    DATA mv_dest TYPE rfcdest.
ENDCLASS.



CLASS zcl_sd_billing_run_ic IMPLEMENTATION.

  METHOD constructor.
    super->constructor( it_vkorg = it_vkorg
                        iv_kind  = 'I' ).
*   RFC-Ziel des Partnersystems (Buchhaltung Tochtergesellschaft)
    SELECT SINGLE rfcdest FROM zsd_ic_dest INTO mv_dest
      WHERE sysid = sy-sysid.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_billing
        EXPORTING
          textid = zcx_sd_billing=>no_destination.
    ENDIF.
  ENDMETHOD.


  METHOD select_due.
    DATA lt_ic TYPE SORTED TABLE OF ty_due WITH NON-UNIQUE KEY vbeln.
    rt_due = super->select_due( it_wadat ).
    IF rt_due IS NOT INITIAL.
*     nur Lieferungen mit offener Intercompany-Faktura
      SELECT vbeln FROM vbuk
        INTO CORRESPONDING FIELDS OF TABLE lt_ic
        FOR ALL ENTRIES IN rt_due
        WHERE vbeln = rt_due-vbeln
          AND fkivk IN ('A', 'B').
      rt_due = FILTER #( rt_due IN lt_ic WHERE vbeln = vbeln ).
    ENDIF.
  ENDMETHOD.


  METHOD post_process.
    DATA lv_msg TYPE c LENGTH 120.
    LOOP AT it_created INTO DATA(lv_vbeln).
      CALL FUNCTION 'Z_FI_IC_INVOICE_RECEIVE'
        DESTINATION mv_dest
        EXPORTING
          iv_vbeln              = lv_vbeln
        EXCEPTIONS
          communication_failure = 1 MESSAGE lv_msg
          system_failure        = 2 MESSAGE lv_msg
          OTHERS                = 3.
      IF sy-subrc <> 0.
        MESSAGE i398(00) WITH 'IC-Uebergabe fehlgeschlagen' lv_vbeln lv_msg.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
