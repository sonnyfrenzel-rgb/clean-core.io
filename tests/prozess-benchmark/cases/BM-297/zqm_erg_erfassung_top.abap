*&---------------------------------------------------------------------*
*&  Include           ZQM_ERG_ERFASSUNG_TOP
*&---------------------------------------------------------------------*
*  Ergebniserfassung je Pruefvorgang im Grid (Ersatz QE51N in Labor 2)
*
*  Dynpro 0100: Custom Control CC_ERG, Status ERF (SAVE, BACK, CANC)
*    PBO  STATUS_0100
*    PAI  EXIT_0100 AT EXIT-COMMAND, USER_COMMAND_0100
*
*  Spalten im Grid (Struktur ZQM_S_ERG_GRID):
*    MERKNR/KURZTEXT     Merkmal (nur Anzeige)
*    SOLLWERT/TOLERANZ*  Vorgaben aus QAMV (nur Anzeige)
*    MESSWERT            Eingabe quantitativ (Text, wird umgesetzt)
*    CODE                Eingabe qualitativ (Code der Auswahlmenge)
*    BEWERTUNG           A/R, wird beim Tippen gesetzt (nur Anzeige)
*    STATUS              X = schon bewertet, Eingabe wird abgewiesen
*
*  Offene Punkte: Stichproben/Einzelwerte werden nicht erfasst (nur
*  Mittelwert je Merkmal) - reicht fuer Labor 2 laut QM-Leitung.
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_merkmal,
         merknr     TYPE qmerknr,
         kurztext   TYPE qmkurztext,
         sollwert   TYPE qsollwert,
         toleranzob TYPE qtolob,
         toleranzun TYPE qtolun,
         masseinhsw TYPE qmasseinh,
         auswmenge1 TYPE qauswmenge,
         auswmgwrk1 TYPE qwerkauswm,
         messwert   TYPE char20,
         code       TYPE qcode,
         bewertung  TYPE qbewertg,
         status     TYPE c LENGTH 1,          "X = bereits abgeschlossen
       END OF ty_merkmal,
       tt_merkmal TYPE STANDARD TABLE OF ty_merkmal WITH DEFAULT KEY.

CLASS lcx_erf DEFINITION DEFERRED.
CLASS lcl_erfassung DEFINITION DEFERRED.

DATA: ok_code   TYPE sy-ucomm,
      gv_answer TYPE c LENGTH 1,
      gt_merk   TYPE tt_merkmal,
      go_cont   TYPE REF TO cl_gui_custom_container,
      go_grid   TYPE REF TO cl_gui_alv_grid,
      go_erf    TYPE REF TO lcl_erfassung,
      gx_erf    TYPE REF TO lcx_erf.

PARAMETERS: p_los  TYPE qplos OBLIGATORY,
            p_vorg TYPE qlfnkn OBLIGATORY DEFAULT 1.
