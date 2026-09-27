*&---------------------------------------------------------------------*
*&  Include           ZSD_SCHALTER_KREDIT_C02
*&---------------------------------------------------------------------*
*  Freigabe gegen Barzahlung, Ereignis FREIGEGEBEN fuer das Protokoll
*----------------------------------------------------------------------*

CLASS lcl_freigabe DEFINITION FINAL.
  PUBLIC SECTION.
    EVENTS freigegeben
      EXPORTING VALUE(ev_vbeln)  TYPE vbeln_va
                VALUE(ev_betrag) TYPE netwr_ak.
    METHODS freigeben
      IMPORTING is_auftrag TYPE ty_auftrag
      RAISING   lcx_frei.
  PRIVATE SECTION.
    METHODS barbetrag_erfragen
      IMPORTING iv_vorschlag     TYPE netwr_ak
      RETURNING VALUE(rv_betrag) TYPE netwr_ak.
    METHODS entsperren
      IMPORTING iv_vbeln TYPE vbeln_va.
ENDCLASS.

CLASS lcl_protokoll DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS on_freigegeben
      FOR EVENT freigegeben OF lcl_freigabe
      IMPORTING ev_vbeln ev_betrag.
ENDCLASS.

CLASS lcl_freigabe IMPLEMENTATION.

  METHOD freigeben.
    DATA: lv_ueber TYPE netwr_ak,
          lv_bar   TYPE netwr_ak.

    CALL FUNCTION 'ENQUEUE_EVVBAKE'
      EXPORTING
        vbeln          = is_auftrag-vbeln
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_frei
        MESSAGE e601(zsd_kr) WITH is_auftrag-vbeln sy-msgv1.   "gesperrt
    ENDIF.

    lv_ueber = go_kredit->ueberschreitung( is_auftrag-netwr ).

    IF lv_ueber > 0.
      lv_bar = barbetrag_erfragen( lv_ueber ).
      IF lv_bar IS INITIAL.
        entsperren( is_auftrag-vbeln ).
        RETURN.                                       "Kunde zahlt nicht
      ENDIF.
      IF lv_bar < lv_ueber.
        entsperren( is_auftrag-vbeln ).
        RAISE EXCEPTION TYPE lcx_frei
          MESSAGE e602(zsd_kr) WITH lv_bar lv_ueber.  "reicht nicht
      ENDIF.

*     Anzahlung in Kassenjournal + FI (Verbucher, Z-Baustein Kasse)
      CALL FUNCTION 'Z_POS_ANZAHLUNG_BUCHEN' IN UPDATE TASK
        EXPORTING
          iv_kasse  = p_kasse
          iv_kunnr  = p_kunnr
          iv_vbeln  = is_auftrag-vbeln
          iv_betrag = lv_bar
          iv_waers  = is_auftrag-waerk.
    ENDIF.

    CALL FUNCTION 'SD_ORDER_CREDIT_RELEASE'
      EXPORTING
        vbeln         = is_auftrag-vbeln
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      entsperren( is_auftrag-vbeln ).
      RAISE EXCEPTION TYPE lcx_frei
        MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
    ENDIF.

    COMMIT WORK AND WAIT.

    RAISE EVENT freigegeben
      EXPORTING
        ev_vbeln  = is_auftrag-vbeln
        ev_betrag = lv_bar.

    entsperren( is_auftrag-vbeln ).

    IF lv_bar > 0.
      PERFORM quittung_drucken USING is_auftrag-vbeln lv_bar.
    ENDIF.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Barbetrag abfragen (Vorschlag = Ueberziehung), Abbruch -> 0
*----------------------------------------------------------------------*
  METHOD barbetrag_erfragen.
    DATA: lt_fields TYPE STANDARD TABLE OF sval,
          lv_rc     TYPE c LENGTH 1.

    APPEND VALUE #( tabname = 'VBAK' fieldname = 'NETWR'
                    value = |{ iv_vorschlag }| field_obl = abap_true ) TO lt_fields.
    CALL FUNCTION 'POPUP_GET_VALUES'
      EXPORTING
        popup_title     = 'Barzahlung Kunde'(t01)
      IMPORTING
        returncode      = lv_rc
      TABLES
        fields          = lt_fields
      EXCEPTIONS
        error_in_fields = 1
        OTHERS          = 2.
    IF sy-subrc <> 0 OR lv_rc = 'A'.
      RETURN.
    ENDIF.
    rv_betrag = lt_fields[ 1 ]-value.
  ENDMETHOD.

  METHOD entsperren.
    CALL FUNCTION 'DEQUEUE_EVVBAKE'
      EXPORTING
        vbeln = iv_vbeln.
  ENDMETHOD.

ENDCLASS.

CLASS lcl_protokoll IMPLEMENTATION.
* Freigabe fuer Kreditabteilung protokollieren (Auswertung ZSD_KRED_PROT)
  METHOD on_freigegeben.
    DATA ls_prot TYPE zsd_frei_prot.
    ls_prot-vbeln  = ev_vbeln.
    ls_prot-kunnr  = p_kunnr.
    ls_prot-betrag = ev_betrag.
    ls_prot-kasse  = p_kasse.
    ls_prot-ernam  = sy-uname.
    ls_prot-erdat  = sy-datum.
    ls_prot-erzet  = sy-uzeit.
    INSERT zsd_frei_prot FROM ls_prot.
  ENDMETHOD.
ENDCLASS.
