REPORT zpm_stoermeldung_anlegen.
* Stoermeldung (Meldungsart M2) fuer Equipment aus dem Leitstand anlegen
PARAMETERS: p_equnr TYPE equnr OBLIGATORY,
            p_text  TYPE qmtxt OBLIGATORY,
            p_prio  TYPE priok DEFAULT '2'.
DATA: ls_head   TYPE bapi2080_nothdri,
      ls_export TYPE bapi2080_nothdre,
      lt_return TYPE STANDARD TABLE OF bapiret2.

START-OF-SELECTION.
  ls_head-equipment  = p_equnr.
  ls_head-short_text = p_text.
  ls_head-priority   = p_prio.
  CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
    EXPORTING
      notif_type         = 'M2'
      notifheader        = ls_head
    IMPORTING
      notifheader_export = ls_export
    TABLES
      return             = lt_return.
  IF line_exists( lt_return[ type = 'E' ] ).
    MESSAGE 'Meldung konnte nicht angelegt werden' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
    EXPORTING
      number = ls_export-notif_no
    TABLES
      return = lt_return.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  WRITE: / 'Meldung angelegt:', ls_export-notif_no.
