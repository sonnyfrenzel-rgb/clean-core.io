*----------------------------------------------------------------------*
***INCLUDE ZCS_RUECKRUF_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form SERIENNUMMERN_ERMITTELN
*&---------------------------------------------------------------------*
* Ausgelieferte Serialnummern (Serialnummernhistorie Lieferung SER01)
*----------------------------------------------------------------------*
FORM seriennummern_ermitteln.
  SELECT o~sernr, o~matnr, o~equnr, s~lief_nr, s~posnr, s~datum
    FROM objk AS o
    INNER JOIN ser01 AS s ON s~obknr = o~obknr
    WHERE o~matnr = @p_matnr
      AND o~sernr IN @s_sernr
      AND o~taser = 'SER01'
      AND s~datum IN @s_datum
    INTO CORRESPONDING FIELDS OF TABLE @gt_ser.

* Chargenfilter: nur Positionen der angegebenen Chargen
  IF s_charg[] IS NOT INITIAL AND gt_ser IS NOT INITIAL.
    SELECT vbeln, posnr, charg FROM lips
      FOR ALL ENTRIES IN @gt_ser
      WHERE vbeln = @gt_ser-lief_nr
        AND posnr = @gt_ser-posnr
      INTO TABLE @DATA(lt_lips).

    LOOP AT gt_ser ASSIGNING FIELD-SYMBOL(<ls_ser>).
      READ TABLE lt_lips INTO DATA(ls_lips)
           WITH KEY vbeln = <ls_ser>-lief_nr
                    posnr = <ls_ser>-posnr.
      IF sy-subrc <> 0 OR ls_lips-charg NOT IN s_charg.
        DELETE gt_ser.
      ENDIF.
    ENDLOOP.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form KUNDEN_ERMITTELN
*&---------------------------------------------------------------------*
* Warenempfänger und Land je Lieferung
*----------------------------------------------------------------------*
FORM kunden_ermitteln.
  SELECT l~vbeln, l~kunnr, k~land1
    FROM likp AS l
    INNER JOIN kna1 AS k ON k~kunnr = l~kunnr
    FOR ALL ENTRIES IN @gt_ser
    WHERE l~vbeln = @gt_ser-lief_nr
    INTO TABLE @DATA(lt_likp).

  LOOP AT gt_ser ASSIGNING FIELD-SYMBOL(<ls_ser>).
    <ls_ser>-kunnr = VALUE #( lt_likp[ vbeln = <ls_ser>-lief_nr ]-kunnr OPTIONAL ).
    <ls_ser>-land1 = VALUE #( lt_likp[ vbeln = <ls_ser>-lief_nr ]-land1 OPTIONAL ).
  ENDLOOP.
  SORT gt_ser BY kunnr sernr.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROTOKOLL_AUSGEBEN
*&---------------------------------------------------------------------*
* Testlauf: betroffene Serialnummern je Kunde
*----------------------------------------------------------------------*
FORM protokoll_ausgeben.
  DATA ls_ser TYPE ty_ser.

  LOOP AT gt_ser INTO ls_ser.
    AT NEW kunnr.
      WRITE: / 'Kunde', ls_ser-kunnr COLOR COL_KEY.
    ENDAT.
    WRITE: /5 ls_ser-sernr, ls_ser-equnr, ls_ser-lief_nr, ls_ser-datum.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form RUECKRUF_ANLEGEN
*&---------------------------------------------------------------------*
FORM rueckruf_anlegen.
  CALL FUNCTION 'ENQUEUE_EZCS_RR'
    EXPORTING
      rrnr           = p_rrnr
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e603(zcs) WITH p_rrnr.
  ENDIF.

  gs_hdr = VALUE #( rrnr   = p_rrnr
                    matnr  = p_matnr
                    grund  = p_grund
                    anzahl = lines( gt_ser )
                    status = 'OFFEN'
                    erdat  = sy-datum
                    ernam  = sy-uname ).
  INSERT zcs_rr_hdr FROM gs_hdr.
  INSERT zcs_rr_pos FROM TABLE @( VALUE #( FOR ls_s IN gt_ser
                                           ( rrnr    = p_rrnr
                                             sernr   = ls_s-sernr
                                             kunnr   = ls_s-kunnr
                                             equnr   = ls_s-equnr
                                             lief_nr = ls_s-lief_nr ) ) ).
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form KUNDEN_INFORMIEREN
*&---------------------------------------------------------------------*
* Je Kunde eine Servicemeldung, dann Information über Landeskanal
*----------------------------------------------------------------------*
FORM kunden_informieren.
  DATA: lt_sernr TYPE zcs_t_sernr,
        lv_qmnum TYPE qmnum.

  LOOP AT gt_ser INTO DATA(ls_ser)
       GROUP BY ( kunnr = ls_ser-kunnr land1 = ls_ser-land1 )
       ASSIGNING FIELD-SYMBOL(<ls_kd>).

    lt_sernr = VALUE #( FOR ls_m IN GROUP <ls_kd> ( ls_m-sernr ) ).

    TRY.
        lv_qmnum = NEW zcl_cs_rr_notif( )->create( iv_rrnr  = p_rrnr
                                                   iv_kunnr = <ls_kd>-kunnr
                                                   iv_matnr = p_matnr
                                                   it_sernr = lt_sernr ).
      CATCH zcx_cs_rr INTO DATA(lx_rr).
        gv_text = lx_rr->get_text( ).
        WRITE: / 'Kunde', <ls_kd>-kunnr, 'Meldung nicht angelegt:', gv_text.
        CONTINUE.
    ENDTRY.

    UPDATE zcs_rr_pos SET qmnum = lv_qmnum
      WHERE rrnr  = p_rrnr
        AND kunnr = <ls_kd>-kunnr.

    PERFORM kanal_informieren USING <ls_kd>-kunnr <ls_kd>-land1 lv_qmnum.
  ENDLOOP.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form KANAL_INFORMIEREN
*&---------------------------------------------------------------------*
* Informationskanal je Land (Brief, Portal, Händler) als Klasse aus
* ZCS_RR_KANAL; Eintrag '*' gilt für alle übrigen Länder
*----------------------------------------------------------------------*
FORM kanal_informieren USING pv_kunnr TYPE kunnr
                             pv_land1 TYPE land1
                             pv_qmnum TYPE qmnum.
  DATA: lv_class TYPE seoclsname,
        lv_meth  TYPE seocpdname VALUE 'INFORMIEREN'.

  SELECT SINGLE klasse FROM zcs_rr_kanal INTO lv_class
    WHERE land1 = pv_land1.
  IF sy-subrc <> 0.
    SELECT SINGLE klasse FROM zcs_rr_kanal INTO lv_class
      WHERE land1 = '*'.
  ENDIF.

  TRY.
      CALL METHOD (lv_class)=>(lv_meth)
        EXPORTING
          iv_kunnr = pv_kunnr
          iv_qmnum = pv_qmnum
          iv_rrnr  = p_rrnr.
    CATCH cx_sy_dyn_call_error INTO DATA(lx_dyn).
      gv_text = lx_dyn->get_text( ).
      WRITE: / 'Kunde', pv_kunnr, 'Kanal fehlgeschlagen:', gv_text.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BRIEFE_DRUCKEN
*&---------------------------------------------------------------------*
* Rückrufbriefe über den Druckreport, Liste hier anzeigen
*----------------------------------------------------------------------*
FORM briefe_drucken.
  DATA lt_list TYPE STANDARD TABLE OF abaplist.

  SUBMIT zcs_rueckruf_brief
         WITH p_rrnr = p_rrnr
         EXPORTING LIST TO MEMORY
         AND RETURN.

  CALL FUNCTION 'LIST_FROM_MEMORY'
    TABLES
      listobject = lt_list
    EXCEPTIONS
      not_found  = 1
      OTHERS     = 2.

  CALL FUNCTION 'WRITE_LIST'
    TABLES
      listobject = lt_list
    EXCEPTIONS
      empty_list = 1
      OTHERS     = 2.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form EQUIPMENTS_KENNZEICHNEN
*&---------------------------------------------------------------------*
* Anwenderstatus E0005 "Rückruf" an allen betroffenen Equipments
*----------------------------------------------------------------------*
FORM equipments_kennzeichnen.
  DATA lv_objnr TYPE j_objnr.

  LOOP AT gt_ser INTO DATA(ls_ser) WHERE equnr IS NOT INITIAL.
    lv_objnr = |IE{ ls_ser-equnr }|.
    CALL FUNCTION 'STATUS_CHANGE_EXTERN'
      EXPORTING
        objnr       = lv_objnr
        user_status = 'E0005'
      EXCEPTIONS
        OTHERS      = 1.
    IF sy-subrc <> 0.
      WRITE: / 'Equipment', ls_ser-equnr, 'Status Rückruf nicht gesetzt'.
    ENDIF.
  ENDLOOP.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form MAIL_AN_VERTRIEB  (Pilot 2015, nicht mehr verwendet)
*&---------------------------------------------------------------------*
FORM mail_an_vertrieb.
  DATA: ls_doc TYPE sodocchgi1,
        lt_rec TYPE STANDARD TABLE OF somlreci1.

  ls_doc-obj_descr = 'Rückruf'.
  APPEND VALUE #( receiver = 'VERTRIEB' rec_type = 'C' ) TO lt_rec.
  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data = ls_doc
    TABLES
      receivers     = lt_rec.
ENDFORM.
