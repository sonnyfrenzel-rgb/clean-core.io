*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTBRIEF_TOP
*&---------------------------------------------------------------------*
*& Aenderungshistorie
*& 12.03.2009 KRA  Erstellung, SAPscript ZLE_FRACHTBRIEF
*& 02.10.2013 HOF  Umstellung auf Smart Form ZLE_FRACHTBRIEF_SF
*& 22.05.2017 KRA  Gefahrgut / 1000-Punkte-Regel (Z_LE_GEFAHRGUT_DATEN)
*& 08.11.2019 EXT  Nachrichtenart ZFB5: PDF per Mail an Spediteur
*& 14.02.2021 HOF  Zusatzkopie Fahrzeugmappe bei Gefahrgut (Ticket 4711)
*&---------------------------------------------------------------------*
TABLES: nast,
        tnapr.

TYPES: BEGIN OF ty_lieferung,
         vbeln TYPE likp-vbeln,
         kunnr TYPE likp-kunnr,
         btgew TYPE likp-btgew,
         gewei TYPE likp-gewei,
         anzpk TYPE likp-anzpk,
         lddat TYPE likp-lddat,
       END OF ty_lieferung.

DATA: gv_retcode   TYPE sy-subrc,
      gv_xscreen   TYPE c LENGTH 1,
      gs_vttk      TYPE vttk,
      gt_vttp      TYPE STANDARD TABLE OF vttp,
      gt_lieferung TYPE STANDARD TABLE OF ty_lieferung,
      gt_lips      TYPE zle_tt_lips_gg,
      gt_gg        TYPE zle_tt_gg_zeile,
      gv_punkte    TYPE zle_gg_punkte,
      gv_freigest  TYPE abap_bool,
      gs_lfa1      TYPE lfa1,
      gv_smtp      TYPE ad_smtpadr,
      gv_pdf       TYPE xstring,
      gv_fm_name   TYPE rs38l_fnam.

* Druck / Archivierung
DATA: gs_control   TYPE ssfctrlop,
      gs_options   TYPE ssfcompop,
      gs_job_info  TYPE ssfcrescl,
      gs_toa_dara  TYPE toa_dara,
      gs_arc_param TYPE arc_params.

* alte SAPscript-Ausgabe (bis 2013)
DATA: gs_itcpo     TYPE itcpo,
      gv_device    TYPE tddevice.

CONSTANTS: gc_formular   TYPE tdsfname  VALUE 'ZLE_FRACHTBRIEF_SF',
           gc_max_punkte TYPE i         VALUE 1000,      "ADR 1.1.3.6
           gc_ar_object  TYPE saeobjart VALUE 'ZLEFRACHTB'.

*----------------------------------------------------------------------*
* Makro: Eintrag ins Verarbeitungsprotokoll der Nachricht
*   &1 = Nachrichtennummer (Klasse ZLE), &2 = Typ, &3 = Variable 1
*----------------------------------------------------------------------*
DEFINE prot.
  CALL FUNCTION 'NAST_PROTOCOL_UPDATE'
    EXPORTING
      msg_arbgb = 'ZLE'
      msg_nr    = &1
      msg_ty    = &2
      msg_v1    = &3
    EXCEPTIONS
      OTHERS    = 1.
END-OF-DEFINITION.
