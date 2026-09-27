*----------------------------------------------------------------------*
*   INCLUDE ZXCIFUU01
*   Erweiterung CIFMAT01 / EXIT_SAPLCMAT_001
*   CIF: Materialstamm-Daten vor der Übertragung ins APO ändern
*----------------------------------------------------------------------*
*   Schnittstelle (Auszug):
*     IMPORTING  VALUE(I_LOGSYS)  LIKE  TBLSYSDEST-LOGSYS
*     TABLES     CT_CIF_MATKEY    STRUCTURE  CIF_MATKEY
*                CT_CIF_MATLOC    STRUCTURE  CIF_MATLOC
*----------------------------------------------------------------------*
*   Materialien mit Dispomerkmalen, die im APO nicht geplant werden
*   (Tabelle ZAPO_CIF_EXCL je Werk), nicht ins APO übertragen.
*   2012-01 T.Heller   Erstversion
*   2012-04 T.Heller   MATKEY nicht mehr löschen (Incident 4471)
*----------------------------------------------------------------------*

DATA: lt_excl    TYPE SORTED TABLE OF zapo_cif_excl
                   WITH UNIQUE KEY werks dismm,
      lt_marc    TYPE SORTED TABLE OF marc
                   WITH UNIQUE KEY matnr werks,
      ls_marc    TYPE marc,
      lv_idx     TYPE sy-tabix.

FIELD-SYMBOLS <ls_matloc> TYPE cif_matloc.

* Basis: CIF-Tests ohne Filter
IF sy-uname = 'CIF_ADMIN'.
  EXIT.
ENDIF.

IF ct_cif_matloc[] IS INITIAL.
  EXIT.
ENDIF.

SELECT * FROM zapo_cif_excl INTO TABLE lt_excl.

SELECT * FROM marc INTO TABLE lt_marc
  FOR ALL ENTRIES IN ct_cif_matloc
  WHERE matnr = ct_cif_matloc-matnr
    AND werks = ct_cif_matloc-werks.

LOOP AT ct_cif_matloc ASSIGNING <ls_matloc>.
  lv_idx = sy-tabix.

  READ TABLE lt_marc INTO ls_marc
    WITH TABLE KEY matnr = <ls_matloc>-matnr
                   werks = <ls_matloc>-werks.
  CHECK sy-subrc = 0.

* IF ls_marc-dispo = '0XX'.                "Altdisponent, bis 2012
*   DELETE ct_cif_matloc INDEX lv_idx.
* ENDIF.

  READ TABLE lt_excl TRANSPORTING NO FIELDS
    WITH TABLE KEY werks = ls_marc-werks
                   dismm = ls_marc-dismm.
  IF sy-subrc = 0.
*   CT_CIF_MATKEY nicht anfassen: Kopf wird für andere Werke gebraucht
    DELETE ct_cif_matloc INDEX lv_idx.
  ENDIF.

ENDLOOP.
