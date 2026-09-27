*&---------------------------------------------------------------------*
*& Include MZFI_PAYRELTOP                    Modulpool SAPMZFI_PAYREL
*& Globale Daten, Konstanten, Table Control, Batch-Input-Makros
*&---------------------------------------------------------------------*

TYPE-POOLS: abap, icon.

* Status der Freigabe (Domaene ZFI_RELSTAT)
CONSTANTS: gc_status_open   TYPE zfi_relstat VALUE ' ',  " offen
           gc_status_first  TYPE zfi_relstat VALUE '1',  " Erstfreigabe erteilt
           gc_status_final  TYPE zfi_relstat VALUE 'F',  " endgueltig freigegeben
           gc_status_reject TYPE zfi_relstat VALUE 'A',  " abgelehnt
           gc_actvt_release TYPE activ_auth  VALUE '43', " Freigeben
           gc_objtype       TYPE swo_objtyp  VALUE 'ZPAYRUN'.

* Bildfelder Dynpro 0100 (Laufdatum / Identifikation)
DATA: BEGIN OF gs_screen,
        laufd TYPE laufd,
        laufi TYPE laufi,
      END OF gs_screen.

* Zeilen des Table Controls TC_PAY - Struktur ZFI_S_PAYREL_UI (SE11):
* MARK, ZBUKR, VBLNR, LIFNR, KUNNR, ZNME1, RZAWE, RWBTR, WAERS, ANZPO,
* STATUS, REL1_USER, REL2_USER, REASON, ICON
DATA: gt_pay   TYPE STANDARD TABLE OF zfi_s_payrel_ui,
      gs_pay   TYPE zfi_s_payrel_ui,
      gt_regup TYPE STANDARD TABLE OF regup.

* aktueller (gesperrter) Zahllauf
DATA: gv_laufd   TYPE laufd,
      gv_laufi   TYPE laufi,
      gv_creator TYPE syuname,        " Ersteller des Vorschlags
      gv_locked  TYPE abap_bool,
      gv_changed TYPE abap_bool,      " ungesicherte Freigaben vorhanden
      gv_answer  TYPE c LENGTH 1.

DATA: ok_code   TYPE sy-ucomm,
      gv_okcode TYPE sy-ucomm.

CONTROLS: tc_pay TYPE TABLEVIEW USING SCREEN 0100.

* Batch-Input fuer F110
DATA: gt_bdcdata TYPE STANDARD TABLE OF bdcdata,
      gs_bdcdata TYPE bdcdata,
      gt_bdcmsg  TYPE STANDARD TABLE OF bdcmsgcoll.

* DATA: g_flag_rel(1) TYPE c,                 "alt bis 2013
*       g_betrag_max  TYPE wrbtr VALUE '50000.00'.

DEFINE bdc_dynpro.
  clear gs_bdcdata.
  gs_bdcdata-program  = &1.
  gs_bdcdata-dynpro   = &2.
  gs_bdcdata-dynbegin = 'X'.
  append gs_bdcdata to gt_bdcdata.
END-OF-DEFINITION.

DEFINE bdc_field.
  clear gs_bdcdata.
  gs_bdcdata-fnam = &1.
  gs_bdcdata-fval = &2.
  append gs_bdcdata to gt_bdcdata.
END-OF-DEFINITION.
