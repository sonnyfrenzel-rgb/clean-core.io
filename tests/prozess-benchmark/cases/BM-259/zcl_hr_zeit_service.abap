CLASS zcl_hr_zeit_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: tt_counter  TYPE STANDARD TABLE OF catscounte WITH EMPTY KEY,
           tt_r_pernr  TYPE RANGE OF pernr_d.

    CONSTANTS: gc_freigegeben TYPE catsstatus VALUE '20',
               gc_abgelehnt   TYPE catsstatus VALUE '40',
               gc_max_stunden TYPE catshours  VALUE '12.00'.

    "! Personalnummern, fuer die der Benutzer Fuehrungskraft ist
    METHODS untergebene
      IMPORTING iv_uname          TYPE syuname
      RETURNING VALUE(rt_r_pernr) TYPE tt_r_pernr.

    "! Setzt den CATS-Status (30 genehmigt / 40 abgelehnt), liefert Anzahl
    METHODS status_setzen
      IMPORTING it_counter       TYPE tt_counter
                iv_status        TYPE catsstatus
                iv_grund         TYPE string
      RETURNING VALUE(rv_anzahl) TYPE i
      RAISING   zcx_hr_zeit.

    METHODS stunden_korrigieren
      IMPORTING iv_counter TYPE catscounte
                iv_stunden TYPE catshours
      RAISING   zcx_hr_zeit.

  PRIVATE SECTION.
    METHODS benachrichtigen
      IMPORTING iv_pernr TYPE pernr_d
                iv_grund TYPE string.
ENDCLASS.



CLASS zcl_hr_zeit_service IMPLEMENTATION.

  METHOD untergebene.
    DATA lt_pernr TYPE STANDARD TABLE OF pernr_d WITH EMPTY KEY.

*   Personalnummer des Benutzers (Infotyp 0105, Subtyp 0001)
    SELECT SINGLE pernr FROM pa0105
      WHERE usrty = '0001'
        AND usrid = @iv_uname
        AND begda <= @sy-datum
        AND endda >= @sy-datum
      INTO @DATA(lv_fk_pernr).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

*   Mitarbeiter der geleiteten Organisationseinheiten (Baustein der HR-IT)
    CALL FUNCTION 'Z_HR_MITARBEITER_DER_FK'
      EXPORTING
        iv_pernr = lv_fk_pernr
        iv_datum = sy-datum
      TABLES
        et_pernr = lt_pernr
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    rt_r_pernr = VALUE #( FOR lv_p IN lt_pernr ( sign = 'I' option = 'EQ' low = lv_p ) ).
  ENDMETHOD.


  METHOD status_setzen.
    DATA lt_r_pernr TYPE tt_r_pernr.

    IF it_counter IS INITIAL.
      RAISE EXCEPTION TYPE zcx_hr_zeit EXPORTING textid = zcx_hr_zeit=>keine_auswahl.
    ENDIF.

    AUTHORITY-CHECK OBJECT 'ZCATS_GEN'
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_hr_zeit EXPORTING textid = zcx_hr_zeit=>keine_berechtigung.
    ENDIF.

    lt_r_pernr = untergebene( sy-uname ).

    SELECT counter, pernr, status FROM catsdb
      FOR ALL ENTRIES IN @it_counter
      WHERE counter = @it_counter-table_line
      INTO TABLE @DATA(lt_zeit).

*   Jede Zeile muss zu einem eigenen Mitarbeiter gehoeren und offen sein
    LOOP AT lt_zeit INTO DATA(ls_zeit).
      IF ls_zeit-pernr NOT IN lt_r_pernr OR lt_r_pernr IS INITIAL.
        RAISE EXCEPTION TYPE zcx_hr_zeit
          EXPORTING textid = zcx_hr_zeit=>fremder_mitarbeiter pernr = ls_zeit-pernr.
      ENDIF.
      IF ls_zeit-status <> gc_freigegeben.
        RAISE EXCEPTION TYPE zcx_hr_zeit
          EXPORTING textid = zcx_hr_zeit=>nicht_offen pernr = ls_zeit-pernr.
      ENDIF.
    ENDLOOP.

    LOOP AT lt_zeit INTO ls_zeit GROUP BY ls_zeit-pernr INTO DATA(lv_grp_pernr).
      CALL FUNCTION 'ENQUEUE_EZCATSDB'
        EXPORTING
          pernr          = lv_grp_pernr
        EXCEPTIONS
          foreign_lock   = 1
          OTHERS         = 2.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_hr_zeit
          EXPORTING textid = zcx_hr_zeit=>gesperrt pernr = lv_grp_pernr.
      ENDIF.
    ENDLOOP.

    CALL FUNCTION 'Z_HR_CATS_STATUS_UPD' IN UPDATE TASK
      EXPORTING
        it_counter = it_counter
        iv_status  = iv_status
        iv_grund   = iv_grund
        iv_apnam   = sy-uname.

    IF iv_status = gc_abgelehnt.
      LOOP AT lt_zeit INTO ls_zeit GROUP BY ls_zeit-pernr INTO DATA(lv_abl_pernr).
        benachrichtigen( iv_pernr = lv_abl_pernr iv_grund = iv_grund ).
      ENDLOOP.
    ENDIF.

    COMMIT WORK AND WAIT.
    rv_anzahl = lines( lt_zeit ).
  ENDMETHOD.


  METHOD stunden_korrigieren.
    SELECT SINGLE counter, pernr, status FROM catsdb
      WHERE counter = @iv_counter
      INTO @DATA(ls_zeit).
    IF sy-subrc <> 0 OR ls_zeit-status <> gc_freigegeben.
      RAISE EXCEPTION TYPE zcx_hr_zeit
        EXPORTING textid = zcx_hr_zeit=>nicht_offen pernr = ls_zeit-pernr.
    ENDIF.

    IF iv_stunden <= 0 OR iv_stunden > gc_max_stunden.
      RAISE EXCEPTION TYPE zcx_hr_zeit
        EXPORTING textid = zcx_hr_zeit=>stunden_ungueltig pernr = ls_zeit-pernr.
    ENDIF.

    UPDATE catsdb SET catshours = @iv_stunden,
                      aenam     = @sy-uname,
                      laeda     = @sy-datum
      WHERE counter = @iv_counter.
    COMMIT WORK.
  ENDMETHOD.


  METHOD benachrichtigen.
    DATA: lo_send TYPE REF TO cl_bcs,
          lo_doc  TYPE REF TO cl_document_bcs,
          lt_text TYPE bcsy_text.

*   E-Mail-Adresse aus Infotyp 0105 Subtyp 0010
    SELECT SINGLE usrid_long FROM pa0105
      WHERE pernr = @iv_pernr
        AND usrty = '0010'
        AND begda <= @sy-datum
        AND endda >= @sy-datum
      INTO @DATA(lv_mail).
    IF sy-subrc <> 0.
      RETURN.                      "ohne Adresse keine Nachricht
    ENDIF.

    TRY.
        lt_text = VALUE #( ( line = 'Ihre erfassten Zeiten wurden abgelehnt.' )
                           ( line = CONV #( iv_grund ) ) ).
        lo_send = cl_bcs=>create_persistent( ).
        lo_doc  = cl_document_bcs=>create_document( i_type    = 'RAW'
                                                    i_text    = lt_text
                                                    i_subject = 'Zeiterfassung: Ablehnung' ).
        lo_send->set_document( lo_doc ).
        lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( CONV #( lv_mail ) ) ).
        lo_send->send( ).
      CATCH cx_bcs.
*       Mailfehler darf die Ablehnung nicht verhindern
        RETURN.
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
