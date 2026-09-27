*&---------------------------------------------------------------------*
*&  Include           ZQM_PM_PFLEGE_C01
*&---------------------------------------------------------------------*
*  Gesammelte DB-Aktionen (Neu/Aendern/Loeschen) mit Aenderungsbeleg
*----------------------------------------------------------------------*

CLASS lcx_pflege DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_pflege IMPLEMENTATION.
ENDCLASS.

INTERFACE lif_db_aktion.
  METHODS ausfuehren
    RAISING lcx_pflege.
ENDINTERFACE.

*----------------------------------------------------------------------*
* Aenderungsbeleg ueber die generischen Bausteine (kein SCDO-Coding
* generiert - Objekt ZQM_PM wurde nur im Customizing angelegt)
*----------------------------------------------------------------------*
CLASS lcl_beleg DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS schreiben
      IMPORTING is_alt TYPE zqm_pruefmittel
                is_neu TYPE zqm_pruefmittel
                iv_kz  TYPE cdchngind.
ENDCLASS.

CLASS lcl_beleg IMPLEMENTATION.
  METHOD schreiben.
    DATA lv_objid TYPE cdobjectv.

    lv_objid = COND #( WHEN is_neu-id IS NOT INITIAL THEN is_neu-id ELSE is_alt-id ).

    CALL FUNCTION 'CHANGEDOCUMENT_OPEN'
      EXPORTING
        objectclass             = 'ZQM_PM'
        objectid                = lv_objid
        planned_change_number   = space
        planned_or_real_changes = 'R'
      EXCEPTIONS
        sequence_invalid        = 1
        OTHERS                  = 2.

    CALL FUNCTION 'CHANGEDOCUMENT_SINGLE_CASE'
      EXPORTING
        tablename        = 'ZQM_PRUEFMITTEL'
        workarea_old     = is_alt
        workarea_new     = is_neu
        change_indicator = iv_kz
        docu_delete      = abap_true
      EXCEPTIONS
        OTHERS           = 1.

    CALL FUNCTION 'CHANGEDOCUMENT_CLOSE'
      EXPORTING
        objectclass             = 'ZQM_PM'
        objectid                = lv_objid
        date_of_change          = sy-datum
        tcode                   = sy-tcode
        time_of_change          = sy-uzeit
        username                = sy-uname
        object_change_indicator = iv_kz
      EXCEPTIONS
        OTHERS                  = 1.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_neuanlage DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_db_aktion.
    DATA ms_neu TYPE zqm_pruefmittel.
ENDCLASS.

CLASS lcl_neuanlage IMPLEMENTATION.
  METHOD lif_db_aktion~ausfuehren.
    INSERT zqm_pruefmittel FROM ms_neu.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_pflege
        MESSAGE e720(zqm) WITH ms_neu-id.            "ID schon vergeben
    ENDIF.
    lcl_beleg=>schreiben( is_alt = VALUE #( ) is_neu = ms_neu iv_kz = 'I' ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_aenderung DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_db_aktion.
    DATA: ms_alt TYPE zqm_pruefmittel,
          ms_neu TYPE zqm_pruefmittel.
ENDCLASS.

CLASS lcl_aenderung IMPLEMENTATION.
  METHOD lif_db_aktion~ausfuehren.
    UPDATE zqm_pruefmittel FROM ms_neu.
    lcl_beleg=>schreiben( is_alt = ms_alt is_neu = ms_neu iv_kz = 'U' ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_loeschung DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_db_aktion.
    DATA ms_alt TYPE zqm_pruefmittel.
ENDCLASS.

CLASS lcl_loeschung IMPLEMENTATION.
  METHOD lif_db_aktion~ausfuehren.
    DELETE zqm_pruefmittel FROM ms_alt.
    lcl_beleg=>schreiben( is_alt = ms_alt is_neu = VALUE #( ) iv_kz = 'D' ).
  ENDMETHOD.
ENDCLASS.
