REPORT zpm_wp_freigabe.
*&---------------------------------------------------------------------*
*& Freigabe der aus Wartungsplaenen erzeugten IH-Auftraege
*& - Auftraege mit Wartungsplanbezug, Status EROF, Eckstart im Horizont
*& - Equipment darf nicht inaktiv sein
*& - Dialog: ALV mit Drucktaste "Freigeben" fuer markierte Zeilen
*& - Hintergrund (Job ZPM_WP_FREIGABE): alle freigebbaren Auftraege,
*&   Ergebnisliste ins Spool
*& 2017-09  JW  Umstellung von IW38-Variante auf eigenen Report
*& 2021-02  JW  Hintergrundmodus
*&---------------------------------------------------------------------*
TABLES aufk.

PARAMETERS: p_iwerk TYPE iwerk OBLIGATORY,
            p_tage  TYPE i DEFAULT 14.
SELECT-OPTIONS s_auart FOR aufk-auart DEFAULT 'PM02'.

INCLUDE zpm_wp_freigabe_cl.

DATA go_app TYPE REF TO lcl_app.

START-OF-SELECTION.
  go_app = NEW lcl_app( ).
  go_app->select_orders( iv_iwerk = p_iwerk
                         iv_bis   = sy-datum + p_tage
                         it_auart = s_auart[] ).

  IF go_app->mt_rows IS INITIAL.
    MESSAGE 'Keine freizugebenden Wartungsauftraege' TYPE 'S'.
    RETURN.
  ENDIF.

* Im Hintergrund alle freigebbaren Auftraege freigeben, Liste geht ins Spool
  IF sy-batch = abap_true.
    go_app->release( VALUE #( ) ).
  ENDIF.

  go_app->display( ).
