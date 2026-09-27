*&---------------------------------------------------------------------*
*& Report ZFI_MAHN_VORSCHLAG
*&---------------------------------------------------------------------*
*& Eigener Mahnvorschlag (ersetzt F150-Vorschlagslauf fuer die
*& Tochtergesellschaften mit Sondermahnverfahren "Key Accounts").
*& Datenbasis: CDS ZI_OFFENEPOSTEN (Parameter P_STICHTAG)
*&---------------------------------------------------------------------*
REPORT zfi_mahn_vorschlag.

PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_stich TYPE sy-datum DEFAULT sy-datum,
            p_test  AS CHECKBOX DEFAULT abap_true.

START-OF-SELECTION.
  TRY.
      DATA(go_vorschlag) = NEW zcl_fi_mahnvorschlag( iv_bukrs    = p_bukrs
                                                      iv_stichtag = p_stich ).
      go_vorschlag->ermitteln( ).

      IF p_test = abap_false.
        go_vorschlag->speichern( ).
      ENDIF.

      go_vorschlag->ausgeben( ).

    CATCH zcx_fi_mahn INTO DATA(gx_mahn).
      MESSAGE gx_mahn TYPE 'I' DISPLAY LIKE 'E'.
  ENDTRY.
