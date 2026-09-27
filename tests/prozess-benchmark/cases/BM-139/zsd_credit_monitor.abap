REPORT zsd_credit_monitor.
*----------------------------------------------------------------------*
* Nachprüfung kreditgesperrter Aufträge (Liefersperre Z1)
* Läuft stündlich als Job und gibt Aufträge frei, sobald die
* FSCM-Kreditprüfung den Auftragswert wieder zulässt.
* 2016 HGE  Ersterstellung
* 2019 RKL  nur Aufträge der letzten p_tage Tage
* Hinweis: geprüft wird der Nettowert des Auftragskopfs, nicht die
*          Summe der offenen Positionen wie im Exit beim Sichern.
* Hinweis: das Sichern über BAPI_SALESORDER_CHANGE durchläuft die
*          Exits aus MV45AFZZ; dort wird erneut geprüft und protokolliert.
*----------------------------------------------------------------------*
TABLES vbak.
SELECT-OPTIONS s_vkorg FOR vbak-vkorg OBLIGATORY.
PARAMETERS: p_tage TYPE i DEFAULT 90,
            p_test AS CHECKBOX DEFAULT 'X'.

DATA: gs_res  TYPE zsd_s_credit_result,
      gs_hdr  TYPE bapisdh1,
      gs_hdrx TYPE bapisdh1x,
      gt_ret  TYPE STANDARD TABLE OF bapiret2,
      gv_ab   TYPE d,
      gv_frei TYPE i,
      gv_gesp TYPE i,
      gv_fehl TYPE i.

START-OF-SELECTION.
  gv_ab = sy-datum - p_tage.
  SELECT vbeln, kunnr, vkorg, waerk, netwr
    FROM vbak
    WHERE vkorg IN @s_vkorg
      AND lifsk =  'Z1'
      AND erdat >= @gv_ab
    INTO TABLE @DATA(lt_auf).
  IF lt_auf IS INITIAL.
    MESSAGE s404(zsd).
    RETURN.
  ENDIF.

  LOOP AT lt_auf INTO DATA(ls_auf).
    CALL FUNCTION 'Z_SD_FSCM_CREDIT_CHECK'
      EXPORTING
        iv_kunnr   = ls_auf-kunnr
        iv_vkorg   = ls_auf-vkorg
        iv_waerk   = ls_auf-waerk
        iv_wert    = ls_auf-netwr
        iv_vbeln   = ls_auf-vbeln
      IMPORTING
        es_result  = gs_res
      EXCEPTIONS
        no_segment = 1
        OTHERS     = 2.
    IF sy-subrc <> 0 OR gs_res-entscheid <> 'OK'.
      WRITE: / ls_auf-vbeln, ls_auf-kunnr, 'weiter gesperrt', gs_res-quelle.
      gv_gesp = gv_gesp + 1.
      CONTINUE.
    ENDIF.
    IF p_test = abap_true.
      WRITE: / ls_auf-vbeln, ls_auf-kunnr, 'würde freigegeben', gs_res-quelle.
      CONTINUE.
    ENDIF.

    CLEAR gt_ret.
    gs_hdr-dlv_block    = space.
    gs_hdrx-updateflag  = 'U'.
    gs_hdrx-dlv_block   = abap_true.
    CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
      EXPORTING
        salesdocument    = ls_auf-vbeln
        order_header_in  = gs_hdr
        order_header_inx = gs_hdrx
      TABLES
        return           = gt_ret.
    IF line_exists( gt_ret[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / ls_auf-vbeln, ls_auf-kunnr, 'Freigabe fehlgeschlagen'.
      gv_fehl = gv_fehl + 1.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      WRITE: / ls_auf-vbeln, ls_auf-kunnr, 'freigegeben', gs_res-quelle.
      gv_frei = gv_frei + 1.
    ENDIF.
  ENDLOOP.

END-OF-SELECTION.
* Zusammenfassung für das Jobprotokoll
  ULINE.
  WRITE: / 'Freigegeben:', gv_frei, 'weiter gesperrt:', gv_gesp,
           'Fehler:', gv_fehl.
