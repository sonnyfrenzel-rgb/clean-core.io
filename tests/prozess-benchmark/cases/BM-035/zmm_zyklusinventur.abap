REPORT zmm_zyklusinventur.
*----------------------------------------------------------------------*
* Zyklische Inventur (ABC) - Belege anlegen und Differenzen buchen
* Modus 1: faellige Materialien ermitteln und Inventurbelege anlegen
* Modus 2: gezaehlte Differenzen bis Wertgrenze buchen, Rest zur
*          Nachzaehlung/Freigabe durch Controlling vormerken
*----------------------------------------------------------------------*
PARAMETERS: p_werks TYPE werks_d OBLIGATORY,
            p_lgort TYPE lgort_d OBLIGATORY.
PARAMETERS: p_anl  RADIOBUTTON GROUP mod DEFAULT 'X',
            p_buch RADIOBUTTON GROUP mod.
PARAMETERS: p_limit TYPE dmbtr DEFAULT '500.00',
            p_maxp  TYPE i DEFAULT 50.

DATA go_cc TYPE REF TO zcl_mm_cycle_count.

INITIALIZATION.
  AUTHORITY-CHECK OBJECT 'M_MSEG_WMB'
    ID 'ACTVT' FIELD '01'
    ID 'WERKS' FIELD p_werks.

AT SELECTION-SCREEN.
  AUTHORITY-CHECK OBJECT 'M_ISEG_WDB'
    ID 'ACTVT' FIELD '01'
    ID 'WERKS' FIELD p_werks.
  IF sy-subrc <> 0.
    MESSAGE e030(zmm) WITH p_werks.
  ENDIF.

START-OF-SELECTION.
  go_cc = NEW zcl_mm_cycle_count( iv_werks = p_werks
                                  iv_lgort = p_lgort ).
  CASE abap_true.
    WHEN p_anl.
      DATA(lt_due) = go_cc->select_due( ).
      IF lt_due IS INITIAL.
        WRITE / 'Keine faelligen Materialien'.
        RETURN.
      ENDIF.
      go_cc->create_documents( it_due = lt_due iv_max_items = p_maxp ).
    WHEN p_buch.
      go_cc->post_differences( iv_limit = p_limit ).
  ENDCASE.

  LOOP AT go_cc->mt_log INTO DATA(ls_log).
    WRITE: / ls_log-type, ls_log-text.
  ENDLOOP.
