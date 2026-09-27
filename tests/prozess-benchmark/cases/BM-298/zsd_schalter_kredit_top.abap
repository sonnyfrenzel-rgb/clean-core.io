*&---------------------------------------------------------------------*
*&  Include           ZSD_SCHALTER_KREDIT_TOP
*&---------------------------------------------------------------------*
*  Kreditfreigabe am Verkaufsschalter gegen Barzahlung
*
*  Kunde steht am Schalter, sein Auftrag haengt in der Kreditsperre.
*  Zahlt er den Ueberziehungsbetrag bar an, gibt der Innendienst den
*  Auftrag frei (statt Anruf in der Kreditabteilung / VKM3).
*
*  Dynpro 0100: Grid CC_AUFTR (gesperrte Auftraege), Status KRED
*               Funktionen FREI (Freigeben), BACK
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_auftrag,
         vbeln TYPE vbak-vbeln,
         erdat TYPE vbak-erdat,
         netwr TYPE vbak-netwr,
         waerk TYPE vbak-waerk,
         cmgst TYPE vbuk-cmgst,
       END OF ty_auftrag,
       tt_auftrag TYPE STANDARD TABLE OF ty_auftrag WITH DEFAULT KEY.

CLASS lcx_frei DEFINITION DEFERRED.
CLASS lcl_kredit DEFINITION DEFERRED.
CLASS lcl_freigabe DEFINITION DEFERRED.
CLASS lcl_grid_hdl DEFINITION DEFERRED.

DATA: ok_code   TYPE sy-ucomm,
      gs_kna1   TYPE kna1,
      gt_auftr  TYPE tt_auftrag,
      go_kredit TYPE REF TO lcl_kredit,
      go_frei   TYPE REF TO lcl_freigabe,
      go_cont   TYPE REF TO cl_gui_custom_container,
      go_grid   TYPE REF TO cl_gui_alv_grid,
      go_hdl    TYPE REF TO lcl_grid_hdl,
      gx_frei   TYPE REF TO lcx_frei.

PARAMETERS: p_kunnr TYPE kunnr OBLIGATORY,
            p_kkber TYPE kkber OBLIGATORY DEFAULT '1000',
            p_kasse TYPE char4 OBLIGATORY.
