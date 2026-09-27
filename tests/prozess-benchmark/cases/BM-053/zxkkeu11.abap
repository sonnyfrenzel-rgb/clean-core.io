*----------------------------------------------------------------------*
*   INCLUDE ZXKKEU11
*   Merkmalsableitung CO-PA, Ergebnisbereich ZGO1  (Projekt ZCOPA 2008)
*   Schritte in KEDR als Benutzerexit angelegt: U-REG, U-SEG, U-KAM
*----------------------------------------------------------------------*
DATA: ls_ce1   TYPE ce1zgo1,
      lv_pernr TYPE pernr_d,
      lv_ok    TYPE abap_bool.

e_copa_item = i_copa_item.
CHECK i_operating_concern = 'ZGO1'.
e_exit_is_active = 'X'.
ls_ce1 = i_copa_item.

CASE i_step_id.
  WHEN 'U-REG'.
    lv_ok = zcl_co_pa_derive=>derive_region(
              EXPORTING iv_date = i_derivation_date
              CHANGING  cs_item = ls_ce1 ).
  WHEN 'U-SEG'.
    lv_ok = zcl_co_pa_derive=>derive_segment( CHANGING cs_item = ls_ce1 ).
  WHEN 'U-KAM'.
*   Key Account Manager = Partnerrolle ZM im Vertriebsbereich
    SELECT SINGLE pernr FROM knvp INTO lv_pernr
      WHERE kunnr = ls_ce1-kndnr
        AND vkorg = ls_ce1-vkorg
        AND vtweg = ls_ce1-vtweg
        AND spart = ls_ce1-spart
        AND parvw = 'ZM'.
    IF sy-subrc = 0.
      ls_ce1-wwkam = lv_pernr.
    ENDIF.
*   KAM ist optional - kein Fehler
    lv_ok = abap_true.
  WHEN OTHERS.
    lv_ok = abap_true.
ENDCASE.

IF lv_ok = abap_false.
  e_failed = 'X'.
ENDIF.
e_copa_item = ls_ce1.
