*----------------------------------------------------------------------*
***INCLUDE MZVCERTO01 - PBO-Module
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module STATUS_0100 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'S100'.
  SET TITLEBAR 'T100'.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module STATUS_0200 OUTPUT
*&---------------------------------------------------------------------*
*& Füllt die Anzeigefelder (Name, Ort, Zertifikatsart-Text, Restlaufzeit).
*& Im Anzeigemodus sind die Felder der Gruppe EDT nicht eingabebereit.
*& Der Status S200 enthält SAVE, DELE, BACK, CANC in allen Modi.
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'S200'.
  SET TITLEBAR 'T200' WITH zvcert-lifnr zvcert-ctype.

* Anzeigefelder: Lieferant, Zertifikatsart, Restlaufzeit in Tagen
  gv_name1 = lfa1-name1.
  gv_ort01 = lfa1-ort01.
  SELECT SINGLE ctext FROM zvcert_typet INTO gv_ctext
    WHERE spras = sy-langu
      AND ctype = zvcert-ctype.
  gv_days = zvcert-valid_to - sy-datum.

  IF gv_mode = gc_display.
    LOOP AT SCREEN.
      IF screen-group1 = 'EDT'.
        screen-input = 0.
        MODIFY SCREEN.
      ENDIF.
    ENDLOOP.
  ENDIF.
ENDMODULE.
