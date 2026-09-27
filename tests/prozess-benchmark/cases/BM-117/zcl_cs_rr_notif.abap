CLASS zcl_cs_rr_notif DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Servicemeldung S3 "Rückruf" für einen Kunden
* Eine Position je betroffener Serialnummer, Auftraggeber = Kunde.
* Existiert zum Rückruf schon eine Meldung des Kunden, wird sie
* wiederverwendet (Wiederaufsetzen nach Abbruch).
*----------------------------------------------------------------------*
* 2020-09 EXT  Erstellung (aus FORM MELDUNG_ANLEGEN herausgelöst)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS create
      IMPORTING
        iv_rrnr         TYPE zcs_rr_hdr-rrnr
        iv_kunnr        TYPE kunnr
        iv_matnr        TYPE matnr
        it_sernr        TYPE zcs_t_sernr
      RETURNING
        VALUE(rv_qmnum) TYPE qmnum
      RAISING
        zcx_cs_rr.

  PRIVATE SECTION.
    CONSTANTS: gc_qmart TYPE qmart VALUE 'S3',
               gc_prio  TYPE priok VALUE '1'.
ENDCLASS.


CLASS zcl_cs_rr_notif IMPLEMENTATION.

  METHOD create.
    DATA: ls_hdr     TYPE bapi2080_nothdri,
          ls_exp     TYPE bapi2080_nothdre,
          lt_item    TYPE STANDARD TABLE OF bapi2080_notitemi,
          lt_partner TYPE STANDARD TABLE OF bapi2080_notpartnri,
          lt_ret     TYPE STANDARD TABLE OF bapiret2.

*   Wiederaufsetzen: Meldung zum Rückruf und Kunden schon vorhanden?
    SELECT SINGLE qmnum FROM zcs_rr_pos
      WHERE rrnr  = @iv_rrnr
        AND kunnr = @iv_kunnr
        AND qmnum <> @space
      INTO @rv_qmnum.
    IF sy-subrc = 0.
      RETURN.
    ENDIF.

    IF iv_kunnr IS INITIAL.
      RAISE EXCEPTION TYPE zcx_cs_rr
        EXPORTING
          textid = zcx_cs_rr=>kein_kunde.
    ENDIF.

    ls_hdr-short_text = |Rückruf { iv_rrnr }|.
    ls_hdr-material   = iv_matnr.
    ls_hdr-priority   = gc_prio.
    lt_partner = VALUE #( ( partn_role = 'AG' partner = iv_kunnr ) ).
    lt_item    = VALUE #( FOR lv_sernr IN it_sernr INDEX INTO lv_idx
                          ( item_key     = lv_idx
                            item_sort_no = lv_idx
                            descript     = |SerNr { lv_sernr }| ) ).

    CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
      EXPORTING
        notif_type         = gc_qmart
        notifheader        = ls_hdr
      IMPORTING
        notifheader_export = ls_exp
      TABLES
        notitem            = lt_item
        notifpartnr        = lt_partner
        return             = lt_ret.

    IF line_exists( lt_ret[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE zcx_cs_rr
        EXPORTING
          textid = zcx_cs_rr=>bapi_fehler
          msg    = lt_ret[ type = 'E' ]-message.
    ENDIF.

    CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
      EXPORTING
        number      = ls_exp-notif_no
      IMPORTING
        notifheader = ls_exp
      TABLES
        return      = lt_ret.
    rv_qmnum = ls_exp-notif_no.
  ENDMETHOD.

ENDCLASS.
