*&---------------------------------------------------------------------*
*& Include ZQM_CHARGE_FREIGABE_TOP
*&---------------------------------------------------------------------*
TABLES qals.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_werk TYPE werks_d OBLIGATORY.
SELECT-OPTIONS: s_art   FOR qals-art DEFAULT '04',
                s_matnr FOR qals-matnr,
                s_datum FOR qals-enstehdat.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X',
            p_dli  TYPE so_obj_nam DEFAULT 'ZQS_FREIGABE',
            p_mail AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

TYPES: BEGIN OF ty_los,
         prueflos TYPE qplos,
         werk     TYPE werks_d,
         matnr    TYPE matnr,
         charg    TYPE charg_d,
         ktextmat TYPE qktextobj,
         losmenge TYPE qlosmenge,
       END OF ty_los.

TYPES: BEGIN OF ty_prot,
         ampel    TYPE c LENGTH 1,
         prueflos TYPE qplos,
         matnr    TYPE matnr,
         charg    TYPE charg_d,
         entsch   TYPE c LENGTH 1,
         vcode    TYPE qvcode,
         text     TYPE c LENGTH 120,
       END OF ty_prot.

CLASS lcl_bewertung DEFINITION DEFERRED.

DATA: gt_lose TYPE STANDARD TABLE OF ty_los,
      gs_los  TYPE ty_los,
      gt_prot TYPE STANDARD TABLE OF ty_prot,
      go_bew  TYPE REF TO lcl_bewertung.

CONSTANTS: gc_annahme   TYPE c LENGTH 1 VALUE 'A',
           gc_rueckw    TYPE c LENGTH 1 VALUE 'R',
           gc_offen     TYPE c LENGTH 1 VALUE 'O',
           gc_code_ok   TYPE qvcode VALUE 'A1',
           gc_code_nok  TYPE qvcode VALUE 'R1',
           gc_auswahl   TYPE qvauswahlmg VALUE 'ZCHARGE',
           gc_klasse    TYPE klasse_d VALUE 'Z_CHARGE',
           gc_merkmal   TYPE atnam VALUE 'Z_FREIGABE'.
