*&---------------------------------------------------------------------*
*& Report ZPP_RM_IMPORT
*&---------------------------------------------------------------------*
*& Rueckmeldungen aus dem MES (CSV auf dem Applikationsserver) in das
*& RAP-BO ZI_PRODRUECKMELDUNG uebernehmen. Job ZPP_RM_IMPORT alle 15 min.
*& Frueher: BDC auf CO11N, seit 2023 EML.
*&---------------------------------------------------------------------*
REPORT zpp_rm_import.

PARAMETERS: p_file TYPE string LOWER CASE DEFAULT '/interface/mes/in/rueckmeldung.csv',
            p_arch TYPE string LOWER CASE DEFAULT '/interface/mes/archiv/',
            p_test AS CHECKBOX.

START-OF-SELECTION.
  DATA(go_import) = NEW zcl_pp_rm_import( iv_datei = p_file iv_test = p_test ).

  go_import->ausfuehren( ).

  IF go_import->mv_anz_fehler = 0 AND p_test = abap_false.
    go_import->archivieren( p_arch ).
  ENDIF.

  WRITE: / 'Saetze gelesen   :', go_import->mv_anz_gelesen,
         / 'Rueckgemeldet    :', go_import->mv_anz_ok,
         / 'Fehlerhaft       :', go_import->mv_anz_fehler.
