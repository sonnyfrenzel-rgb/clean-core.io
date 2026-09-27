*&---------------------------------------------------------------------*
*& Report  ZSD_SCHALTER_OFFENE
*&---------------------------------------------------------------------*
*& Verkaufsschalter: offene Tagesauftraege des Verkaufsbueros als
*& ALV-Grid; Doppelklick springt in die Auftragsanzeige VA03.
*&---------------------------------------------------------------------*
*& 2012-06-18  MSC  Ersterstellung (Ablosung Liste ZSDL011)
*& 2015-02-03  MSC  Umstellung auf CL_GUI_ALV_GRID, Container CC_0100
*&---------------------------------------------------------------------*
REPORT zsd_schalter_offene.

TYPES: BEGIN OF ty_auftr,
         vbeln TYPE vbak-vbeln,
         erdat TYPE vbak-erdat,
         kunnr TYPE vbak-kunnr,
         netwr TYPE vbak-netwr,
         waerk TYPE vbak-waerk,
         gbstk TYPE vbuk-gbstk,
       END OF ty_auftr.

DATA: gt_auftr     TYPE STANDARD TABLE OF ty_auftr,
      go_container TYPE REF TO cl_gui_custom_container,
      go_grid      TYPE REF TO cl_gui_alv_grid,
      ok_code      TYPE sy-ucomm.

PARAMETERS: p_vkorg TYPE vbak-vkorg OBLIGATORY,
            p_vkbur TYPE vbak-vkbur OBLIGATORY,
            p_datum TYPE vbak-erdat DEFAULT sy-datum.

*----------------------------------------------------------------------*
CLASS lcl_handler DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS on_double_click
      FOR EVENT double_click OF cl_gui_alv_grid
      IMPORTING e_row e_column.
ENDCLASS.

CLASS lcl_handler IMPLEMENTATION.
  METHOD on_double_click.
    DATA(ls_auftr) = gt_auftr[ e_row-index ].
    SET PARAMETER ID 'AUN' FIELD ls_auftr-vbeln.
    CALL TRANSACTION 'VA03' AND SKIP FIRST SCREEN.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
START-OF-SELECTION.

  SELECT a~vbeln a~erdat a~kunnr a~netwr a~waerk b~gbstk
    FROM vbak AS a
    INNER JOIN vbuk AS b ON b~vbeln = a~vbeln
    INTO CORRESPONDING FIELDS OF TABLE gt_auftr
    WHERE a~vkorg = p_vkorg
      AND a~vkbur = p_vkbur
      AND a~erdat = p_datum
      AND b~gbstk <> 'C'.
  IF gt_auftr IS INITIAL.
    MESSAGE s020(zsd_sch) DISPLAY LIKE 'E'.  "Keine offenen Auftraege
    RETURN.
  ENDIF.

  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'STATUS_0100'.
  SET TITLEBAR 'T0100' WITH p_vkbur.

  IF go_grid IS INITIAL.
    CREATE OBJECT go_container
      EXPORTING
        container_name = 'CC_0100'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_container.
    SET HANDLER lcl_handler=>on_double_click FOR go_grid.
    CALL METHOD go_grid->set_table_for_first_display
      EXPORTING
        i_structure_name = 'ZSD_S_SCHALTER_AUFTR'
      CHANGING
        it_outtab        = gt_auftr.
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  CASE ok_code.
    WHEN 'BACK' OR 'EXIT' OR 'CANC'.
      LEAVE TO SCREEN 0.
  ENDCASE.
  CLEAR ok_code.
ENDMODULE.
