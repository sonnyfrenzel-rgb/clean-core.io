*&---------------------------------------------------------------------*
*&  Include           ZQM_UD_SCHNELL_TOP
*&---------------------------------------------------------------------*
*  Verwendungsentscheid-Schnellerfassung Wareneingangspruefung
*  Dynpro 0100: Losdaten, Vorschlag, Entscheidungscode (Feld GS_LOS-VCODE)
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_los,
         prueflos TYPE qplos,
         werk     TYPE werks_d,
         art      TYPE qpart,
         matnr    TYPE matnr,
         charg    TYPE charg_d,
         lifnr    TYPE elifn,
         losmenge TYPE qlosmenge,
         mengeneinh TYPE qlmengeh,
         vcode    TYPE qvcode,
         vcodegrp TYPE qvgruppe,
       END OF ty_los.

INTERFACE lif_ud_regel DEFERRED.
CLASS lcl_ud_ctrl DEFINITION DEFERRED.
CLASS lcx_ud DEFINITION DEFERRED.

DATA: ok_code TYPE sy-ucomm,
      gs_los  TYPE ty_los,
      go_ctrl TYPE REF TO lcl_ud_ctrl,
      gx_ud   TYPE REF TO lcx_ud.

CONSTANTS: gc_codegrp TYPE qvgruppe VALUE 'WE01',
           gc_annahme TYPE qvcode   VALUE 'A',
           gc_rueckw  TYPE qvcode   VALUE 'R'.

PARAMETERS p_los TYPE qplos OBLIGATORY.
