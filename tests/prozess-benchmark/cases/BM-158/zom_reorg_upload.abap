REPORT zom_reorg_upload.
************************************************************************
* Organisationsmanagement: Reorganisation per Upload-Datei
* Datei (CSV, vom Fachbereich aus Excel):
*   Aktion;Objekt-ID;Uebergeordnete OrgEinheit;Kurztext;Langtext
*   NEWO = neue Org.-Einheit anlegen, MOVS = Planstelle umhaengen,
*   RENA = Org.-Einheit umbenennen, DELO = Org.-Einheit abgrenzen
* Je Aktion ein FORM ACT_<Aktion> (dynamisch gerufen).
* Inhaber umgehaengter Planstellen erhalten per Batch-Input eine
* Massnahme "Organisatorische Aenderung" (PA40, Massnahmenart ZO).
* 2014-02 OM-Team  Anlage fuer Reorganisation Vertrieb
* 2018-11 OM-Team  DELO ergaenzt
* 2022-06 OM-Team  Strenger Modus: bei Fehlern gar nichts aendern
************************************************************************
INCLUDE zom_reorg_upload_top.
INCLUDE zom_reorg_upload_f01.
INCLUDE zom_reorg_upload_f02.
INCLUDE zom_reorg_upload_f03.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'PLOG'
    ID 'PLVAR' FIELD gc_plvar
    ID 'OTYPE' FIELD 'O'
    ID 'INFOTYP' FIELD '1001'
    ID 'SUBTYP' DUMMY
    ID 'ISTAT' FIELD '1'
    ID 'PPFCODE' FIELD 'INSE'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Keine Berechtigung fuer OM-Pflege'.
  ENDIF.

  PERFORM upload_file.
  PERFORM parse_lines.
  PERFORM validate_lines.

  IF gv_errors > 0 AND p_strict = abap_true.
    PERFORM prot_add USING 0 'E' 'Strenger Modus: Fehler, keine Aenderung'.
  ELSE.
    PERFORM execute_lines.
  ENDIF.

END-OF-SELECTION.
  PERFORM show_protocol.
