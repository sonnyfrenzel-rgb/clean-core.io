*&---------------------------------------------------------------------*
*& Report ZSD_RET_DISPOSITION
*&---------------------------------------------------------------------*
*& Retourendisposition: eingegangene Retouren nach Retourengrund
*& wiedereinlagern, verschrotten oder in die Reparatur geben,
*& anschliessend Gutschriften zu den Retourenauftraegen erzeugen.
*&---------------------------------------------------------------------*
*& 2014-02 GHA  Ersterstellung (Liste + Buttons)
*& 2018-09 GHA  Umstellung SALV, Dispositionsklassen
*& 2021-03 NBE  Reparatur-Tracking ZSD_RET_REPAIR
*&---------------------------------------------------------------------*
REPORT zsd_ret_disposition.

INCLUDE zsd_ret_disposition_top.
INCLUDE zsd_ret_disposition_c01.
INCLUDE zsd_ret_disposition_f01.

*----------------------------------------------------------------------*
* Disposition bucht Warenbewegungen - Aenderungsberechtigung je VkOrg
*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
  LOOP AT s_vkorg INTO DATA(ls_vkorg) WHERE sign = 'I' AND option = 'EQ'.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD ls_vkorg-low
      ID 'VTWEG' DUMMY
      ID 'SPART' DUMMY
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      MESSAGE e398(00) WITH 'Keine Aenderungsberechtigung fuer VkOrg' ls_vkorg-low.
    ENDIF.
  ENDLOOP.

START-OF-SELECTION.
  PERFORM select_returns.
  IF gt_ret IS INITIAL.
    MESSAGE s398(00) WITH 'Keine eingegangenen Retouren'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  go_app = NEW lcl_app( ).
  go_app->display( ).
