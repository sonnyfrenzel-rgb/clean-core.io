*&---------------------------------------------------------------------*
*& Include ZSD_MASS_VA02_F02 - Prüfungen je Dateizeile
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ZEILEN_PRUEFEN
*&---------------------------------------------------------------------*
*       Jede Zeile wird geprüft; fehlerhafte Zeilen werden rot markiert
*       und später nicht ausgeführt.
*----------------------------------------------------------------------*
FORM zeilen_pruefen.
  DATA: ls_vbak  TYPE vbak,
        lv_gbsta TYPE vbup-gbsta,
        lv_tabix TYPE i.

  LOOP AT gt_upload INTO DATA(ls_up).
    lv_tabix = sy-tabix.
    APPEND VALUE #( zeile = lv_tabix
                    vbeln = ls_up-vbeln
                    posnr = ls_up-posnr
                    feld  = ls_up-feld
                    wert  = ls_up-wert
                    ampel = icon_green_light )
           TO gt_result ASSIGNING FIELD-SYMBOL(<ls_res>).

    SELECT SINGLE * FROM vbak INTO ls_vbak WHERE vbeln = ls_up-vbeln.
    IF sy-subrc <> 0.
      PERFORM zeile_fehler USING 'Auftrag nicht vorhanden'(e01)
                           CHANGING <ls_res>.
      CONTINUE.
    ENDIF.

    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD ls_vbak-vkorg
      ID 'VTWEG' FIELD ls_vbak-vtweg
      ID 'SPART' FIELD ls_vbak-spart
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      PERFORM zeile_fehler USING 'Keine Änderungsberechtigung'(e02)
                           CHANGING <ls_res>.
      CONTINUE.
    ENDIF.

    CASE ls_up-feld.
      WHEN gc_lifsk.
*       Kopffeld - Positionsnummer muss leer sein
        IF ls_up-posnr IS NOT INITIAL.
          PERFORM zeile_fehler USING 'Liefersperre nur auf Kopfebene'(e03)
                               CHANGING <ls_res>.
        ENDIF.
      WHEN gc_menge OR gc_abgru OR gc_edatu.
        SELECT SINGLE gbsta FROM vbup INTO lv_gbsta
          WHERE vbeln = ls_up-vbeln
            AND posnr = ls_up-posnr.
        IF sy-subrc <> 0.
          PERFORM zeile_fehler USING 'Position nicht vorhanden'(e04)
                               CHANGING <ls_res>.
        ELSEIF lv_gbsta = 'C'.
          PERFORM zeile_fehler USING 'Position bereits erledigt'(e05)
                               CHANGING <ls_res>.
        ENDIF.
      WHEN OTHERS.
        PERFORM zeile_fehler USING 'Feld nicht unterstützt'(e06)
                             CHANGING <ls_res>.
    ENDCASE.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ZEILE_FEHLER
*&---------------------------------------------------------------------*
*       Zeile rot markieren, zählen und ins Anwendungsprotokoll
*----------------------------------------------------------------------*
FORM zeile_fehler USING    iv_text TYPE csequence
                  CHANGING cs_res  TYPE ty_result.
  DATA ls_msg TYPE bal_s_msg.

  cs_res-ampel = icon_red_light.
  cs_res-text  = iv_text.
  gv_err       = gv_err + 1.

  ls_msg = VALUE #( msgty = 'E' msgid = 'ZSD' msgno = '610'
                    msgv1 = cs_res-zeile msgv2 = cs_res-vbeln
                    msgv3 = cs_res-posnr msgv4 = iv_text ).
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = ls_msg
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.
