REPORT zsd_bonus_ablauf NO STANDARD PAGE HEADING LINE-SIZE 120.
*----------------------------------------------------------------------*
* Auslaufende Bonusabsprachen mit bisherigem Bonusumsatz
* Umsatz kommt aus Report ZSD_BONUS_UMSATZ (Liste wird ausgelesen!)
* 2012 TBE / 2015 TBE: Doppelklick springt in VBO3
*----------------------------------------------------------------------*
TABLES kona.
SELECT-OPTIONS: s_vkorg FOR kona-vkorg OBLIGATORY,
                s_boart FOR kona-boart.
PARAMETERS      p_tage  TYPE i DEFAULT 30.

TYPES: BEGIN OF ty_abs,
         knuma  TYPE kona-knuma,
         boart  TYPE kona-boart,
         bonem  TYPE kona-bonem,
         datbi  TYPE kona-datbi,
         umsatz TYPE p LENGTH 15 DECIMALS 2,
       END OF ty_abs.
DATA: gt_abs   TYPE STANDARD TABLE OF ty_abs,
      gs_abs   TYPE ty_abs,
      gv_bis   TYPE sy-datum,
      gt_list  TYPE STANDARD TABLE OF abaplist,
      gt_ascii TYPE STANDARD TABLE OF char255.

START-OF-SELECTION.
  gv_bis = sy-datum + p_tage.
  SELECT knuma boart bonem datbi FROM kona
    INTO CORRESPONDING FIELDS OF TABLE gt_abs
    WHERE vkorg IN s_vkorg
      AND boart IN s_boart
      AND datbi BETWEEN sy-datum AND gv_bis
      AND bosta = space.
  IF sy-subrc <> 0.
    MESSAGE s001(zsd_bonus) DISPLAY LIKE 'W'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  LOOP AT gt_abs INTO gs_abs.
    SUBMIT zsd_bonus_umsatz WITH p_knuma = gs_abs-knuma
           EXPORTING LIST TO MEMORY
           AND RETURN.
    CALL FUNCTION 'LIST_FROM_MEMORY'
      TABLES
        listobject = gt_list
      EXCEPTIONS
        not_found  = 1
        OTHERS     = 2.
    IF sy-subrc = 0.
      CALL FUNCTION 'LIST_TO_ASCI'
        TABLES
          listasci   = gt_ascii
          listobject = gt_list
        EXCEPTIONS
          OTHERS     = 1.
      CALL FUNCTION 'LIST_FREE_MEMORY'.
*     Summenzeile = Listzeile 4, Betrag ab Spalte 60 (Layout Stand 2012)
      READ TABLE gt_ascii INTO DATA(lv_zeile) INDEX 4.
      IF sy-subrc = 0.
        TRY.
            gs_abs-umsatz = condense( lv_zeile+60(20) ).
          CATCH cx_sy_conversion_no_number.
            CLEAR gs_abs-umsatz.
        ENDTRY.
      ENDIF.
    ENDIF.
    MODIFY gt_abs FROM gs_abs.
    WRITE: / gs_abs-knuma HOTSPOT, gs_abs-boart, gs_abs-bonem,
             gs_abs-datbi, gs_abs-umsatz.
    HIDE gs_abs-knuma.
  ENDLOOP.

AT LINE-SELECTION.
  CHECK gs_abs-knuma IS NOT INITIAL.
  SET PARAMETER ID 'VBO' FIELD gs_abs-knuma.
  CALL TRANSACTION 'VBO3' AND SKIP FIRST SCREEN.
  CLEAR gs_abs-knuma.
