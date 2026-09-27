REPORT zpm_breakdown_run.
INCLUDE <icon>.
*&---------------------------------------------------------------------*
*& Stoermeldungen -> IH-Auftraege (Nachverarbeitung) und TECO-Lauf
*& Normalfall: Ereignisempfaenger Z_PM_NOTIF_CREATED_REC je Meldung.
*& Dieser Report
*&  - verarbeitet liegengebliebene Stoermeldungen der letzten Tage
*&  - schliesst rueckgemeldete Stoerauftraege technisch ab (P_TECO)
*&---------------------------------------------------------------------*
TABLES qmih.

PARAMETERS: p_iwerk TYPE iwerk OBLIGATORY,
            p_tage  TYPE i DEFAULT 3,
            p_nach  RADIOBUTTON GROUP mod DEFAULT 'X',
            p_teco  RADIOBUTTON GROUP mod,
            p_dest  TYPE rfcdest DEFAULT 'CMMS_PROD'.

DATA: go_proc  TYPE REF TO zcl_pm_breakdown_processor,
      gt_qmnum TYPE STANDARD TABLE OF qmnum,
      gv_qmnum TYPE qmnum,
      gv_text  TYPE string,
      gv_von   TYPE d,
      gv_count TYPE i.

START-OF-SELECTION.
  go_proc = NEW zcl_pm_breakdown_processor( iv_rfcdest = p_dest ).

  IF p_teco = abap_true.
    gv_count = go_proc->complete_confirmed( p_iwerk ).
    WRITE: / 'Technisch abgeschlossen:', gv_count.
    RETURN.
  ENDIF.

  gv_von = sy-datum - p_tage.
  SELECT m~qmnum FROM qmel AS m
    INNER JOIN qmih AS i ON i~qmnum = m~qmnum
    WHERE m~qmart =  'M2'
      AND m~priok =  '1'
      AND m~aufnr =  @space
      AND m~erdat >= @gv_von
      AND i~iwerk =  @p_iwerk
    INTO TABLE @gt_qmnum.

  IF gt_qmnum IS INITIAL.
    WRITE / 'Keine offenen Stoermeldungen ohne Auftrag'.
    RETURN.
  ENDIF.

  LOOP AT gt_qmnum INTO gv_qmnum.
    TRY.
        gv_text = go_proc->process( gv_qmnum ).
        WRITE: / icon_green_light AS ICON, gv_text.
      CATCH zcx_pm_breakdown INTO DATA(lx_err).
        gv_text = lx_err->get_text( ).
        WRITE: / icon_red_light AS ICON, gv_text.
    ENDTRY.
  ENDLOOP.
