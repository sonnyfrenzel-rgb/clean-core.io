FUNCTION-POOL zwm_quit MESSAGE-ID zwm_q.
*&---------------------------------------------------------------------*
*& Funktionsgruppe ZWM_QUIT - Kommissionierquittierung am Packtisch
*&---------------------------------------------------------------------*
*& Dynpro 0100: Table Control TC_POS (Positionen des Transportauftrags)
*&   PBO: STATUS_0100, TC_POS_CHANGE_TC_ATTR (Standard-Wizard)
*&   PAI: LOOP AT gt_pos -> MODULE tc_pos_modify
*&        MODULE user_command_0100
*&---------------------------------------------------------------------*
*& 2011-05-09 SGR  Ersterstellung, Aufruf aus RF-Menue und ZWM_MONITOR
*& 2018-03-12 SGR  Differenzmenge statt Nullquittierung (Revision)
*&---------------------------------------------------------------------*

TYPES: BEGIN OF ty_pos,
         mark  TYPE c LENGTH 1,
         tapos TYPE tapos,
         matnr TYPE matnr,
         maktx TYPE maktx,
         vlpla TYPE ltap_vlpla,
         vsola TYPE ltap_vsola,
         nista TYPE ltap_nista,
         ndifa TYPE ltap_ndifa,
         altme TYPE lrmei,
       END OF ty_pos.

CONTROLS tc_pos TYPE TABLEVIEW USING SCREEN 0100.

DATA: gt_pos     TYPE STANDARD TABLE OF ty_pos,
      gs_pos     TYPE ty_pos,
      gv_lgnum   TYPE lgnum,
      gv_tanum   TYPE tanum,
      gv_done    TYPE abap_bool,
      gv_changed TYPE abap_bool,
      gv_answer  TYPE c LENGTH 1,
      ok_code    TYPE sy-ucomm.
