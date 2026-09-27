*&---------------------------------------------------------------------*
*& Include ZPS_NETZ_RESCHED_C01 - Ereignisbehandler ALV
*&---------------------------------------------------------------------*
CLASS lcl_handler IMPLEMENTATION.

  METHOD on_double_click.
    READ TABLE gt_erg INTO DATA(ls_erg) INDEX row.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    CASE column.
      WHEN 'AUFNR'.
*       Netzplan anzeigen
        SET PARAMETER ID 'NET' FIELD ls_erg-aufnr.
        CALL TRANSACTION 'CN23' AND SKIP FIRST SCREEN.
      WHEN 'MELDUNG'.
*       volle Meldung als Popup (Spalte ist abgeschnitten)
        MESSAGE ls_erg-meldung TYPE 'I'.
      WHEN OTHERS.
*       Projekt im Projektbuilder
        SET PARAMETER ID 'PSP' FIELD ls_erg-pspid.
        CALL TRANSACTION 'CJ20N'.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
