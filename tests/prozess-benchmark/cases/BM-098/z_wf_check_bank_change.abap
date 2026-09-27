FUNCTION z_wf_check_bank_change.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(OBJTYPE) LIKE  SWETYPECOU-OBJTYPE
*"     VALUE(OBJKEY) LIKE  SWEINSTCOU-OBJKEY
*"     VALUE(EVENT) LIKE  SWETYPECOU-EVENT
*"     VALUE(RECTYPE) LIKE  SWETYPECOU-RECTYPE
*"  TABLES
*"      EVENT_CONTAINER STRUCTURE  SWCONT
*"  EXCEPTIONS
*"      NO_BANK_CHANGE
*"      TRUSTED_USER
*"----------------------------------------------------------------------
* Prüfbaustein der Ereignisverknüpfung KRED-CHANGED (aus Änderungsbeleg)
* Der Freigabe-Workflow WS90000012 startet nur, wenn dieser Baustein
* ohne Ausnahme endet.
*----------------------------------------------------------------------
  DATA: lt_hdr   TYPE STANDARD TABLE OF cdhdr,
        ls_hdr   TYPE cdhdr,
        lv_count TYPE i,
        lv_uname TYPE syuname.

* letzter Änderungsbeleg des Kreditors
  SELECT * FROM cdhdr INTO TABLE lt_hdr
    UP TO 1 ROWS
    WHERE objectclas = 'KRED'
      AND objectid   = objkey
    ORDER BY udate DESCENDING utime DESCENDING.
  READ TABLE lt_hdr INTO ls_hdr INDEX 1.
  IF sy-subrc <> 0.
    RAISE no_bank_change.
  ENDIF.

* Stammdatenteam (Massenpflege) ist von der Freigabe ausgenommen
  SELECT SINGLE uname FROM zwf_trusted_usr INTO lv_uname
    WHERE uname    = ls_hdr-username
      AND valid_to >= sy-datum.
  IF sy-subrc = 0.
    RAISE trusted_user.
  ENDIF.

* nur Änderungen an der Bankverbindung (Tabelle LFBK) sind relevant
  SELECT COUNT(*) FROM cdpos INTO lv_count
    WHERE objectclas = 'KRED'
      AND objectid   = objkey
      AND changenr   = ls_hdr-changenr
      AND tabname    = 'LFBK'.
  IF lv_count = 0.
    RAISE no_bank_change.
  ENDIF.
ENDFUNCTION.
