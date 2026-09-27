*&---------------------------------------------------------------------*
*& Report ZMM_PO_PRUEFUNG
*&---------------------------------------------------------------------*
*& Compliance-Pruefung offener Bestellungen vor der Freigabe.
*& Regeln sind Klassen (Erben von ZCL_MM_PO_REGEL_BASE), aktiv
*& geschaltet in Tabelle ZMM_PO_REGEL. Bestanden -> Workflow-Ereignis
*& PRUEFUNG_OK an BUS2012 (startet die Freigabe im Flexible Workflow).
*&
*& 2022-10 TS  Erstellung (Ersatz Excel-Liste Einkaufscontrolling)
*& 2023-04 TS  Datenbasis auf released CDS I_PurchaseOrderAPI01
*& 2024-01 MR  Ereignis nur noch mit p_frei
*&---------------------------------------------------------------------*
REPORT zmm_po_pruefung.

TABLES: ekko.

SELECT-OPTIONS: s_ebeln FOR ekko-ebeln,
                s_ekorg FOR ekko-ekorg OBLIGATORY.
PARAMETERS:     p_frei  AS CHECKBOX.

*----------------------------------------------------------------------*
CLASS lcl_anzeige DEFINITION.
  PUBLIC SECTION.
    DATA mv_verstoesse TYPE i READ-ONLY.
    METHODS on_verstoss FOR EVENT verstoss OF zcl_mm_po_regel_base
      IMPORTING iv_ebeln iv_text iv_schwere.
ENDCLASS.

CLASS lcl_anzeige IMPLEMENTATION.
  METHOD on_verstoss.
    mv_verstoesse = mv_verstoesse + 1.
    IF iv_schwere = 'E'.
      FORMAT COLOR COL_NEGATIVE.
    ELSE.
      FORMAT COLOR COL_TOTAL.
    ENDIF.
    WRITE: / iv_ebeln, iv_schwere, iv_text.
    FORMAT COLOR OFF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
DATA: go_anzeige  TYPE REF TO lcl_anzeige,
      gt_regeln   TYPE zcl_mm_po_regel_base=>tt_regel,
      go_protokoll TYPE REF TO zcl_mm_po_protokoll,
      gv_objkey   TYPE swo_typeid,
      gv_ok       TYPE i,
      gv_nok      TYPE i.

START-OF-SELECTION.
  SELECT purchaseorder, purchasingorganization, supplier, companycode,
         purchaseordertype, purchaseorderdate, documentcurrency
    FROM i_purchaseorderapi01
    WHERE purchaseorder          IN @s_ebeln
      AND purchasingorganization IN @s_ekorg
      AND releaseisnotcompleted  = @abap_true
      AND purchasingdocumentdeletioncode = @space
    INTO TABLE @DATA(gt_bestellung).

  IF gt_bestellung IS INITIAL.
    MESSAGE s001(zmm_po) DISPLAY LIKE 'W'.     "keine Bestellungen in Freigabe
    RETURN.
  ENDIF.

  gt_regeln = zcl_mm_po_regel_base=>alle_regeln( ).
  IF gt_regeln IS INITIAL.
    MESSAGE e002(zmm_po).                      "keine aktive Pruefregel
  ENDIF.

  go_anzeige = NEW #( ).
  SET HANDLER go_anzeige->on_verstoss FOR ALL INSTANCES.

  LOOP AT gt_bestellung INTO DATA(gs_best).
    go_protokoll = NEW #( iv_ebeln = gs_best-purchaseorder ).

    LOOP AT gt_regeln INTO DATA(go_regel).
      go_regel->pruefe( is_bestellung = CORRESPONDING #( gs_best )
                        io_protokoll  = go_protokoll ).
    ENDLOOP.

    IF go_protokoll->hat_fehler( ) = abap_true.
      gv_nok = gv_nok + 1.
    ELSE.
      gv_ok = gv_ok + 1.
      IF p_frei = abap_true.
        gv_objkey = gs_best-purchaseorder.
        CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
          EXPORTING
            object_type = 'BUS2012'
            object_key  = gv_objkey
            event       = 'PRUEFUNG_OK'
            commit_work = space.
      ENDIF.
    ENDIF.

    go_protokoll->sichern( ).
  ENDLOOP.

  COMMIT WORK.

  ULINE.
  WRITE: / 'Bestanden:', gv_ok, 'Nicht bestanden:', gv_nok,
           'Verstoesse gesamt:', go_anzeige->mv_verstoesse.
