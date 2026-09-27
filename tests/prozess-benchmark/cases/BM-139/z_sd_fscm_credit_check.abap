FUNCTION z_sd_fscm_credit_check.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_KUNNR) TYPE  KUNNR
*"     VALUE(IV_VKORG) TYPE  VKORG
*"     VALUE(IV_WAERK) TYPE  WAERK
*"     VALUE(IV_WERT) TYPE  NETWR_AK
*"     VALUE(IV_VBELN) TYPE  VBELN_VA OPTIONAL
*"  EXPORTING
*"     VALUE(ES_RESULT) TYPE  ZSD_S_CREDIT_RESULT
*"  EXCEPTIONS
*"      NO_SEGMENT
*"----------------------------------------------------------------------
* Kreditentscheidung für einen Auftragswert:
*   ENTSCHEID  OK / SPERRE / ABLEHNEN
*   QUELLE     FSCM (zentrales System), ERSATZ (lokale Regel),
*              FEHLER (Regel nicht aufrufbar), AUS (Prüfung abgeschaltet)
* Das FSCM-System ist per RFC angebunden (Ziel je Verkaufsorganisation
* in ZSD_CR_SEGM). Ist es nicht erreichbar, entscheidet eine lokale
* Ersatzregel; deren Klasse/Methode steht ebenfalls in ZSD_CR_SEGM.
* Aufrufer: MV45AFZZ (USEREXIT_SAVE_DOCUMENT_PREPARE) und der Report
*           ZSD_CREDIT_MONITOR (Nachprüfung gesperrter Aufträge).
* 2016 HGE  Ersterstellung
* 2017 HGE  Ersatzregel bei RFC-Ausfall
* 2021 RKL  Regel je Verkaufsorganisation dynamisch (ZSD_CR_SEGM)
*----------------------------------------------------------------------
  DATA: lv_aktiv TYPE tvarvc-low,
        lv_msg   TYPE c LENGTH 200,
        lv_class TYPE seoclsname,
        lv_meth  TYPE seocpdname,
        ls_seg   TYPE zsd_cr_segm.

  es_result-kunnr = iv_kunnr.
  es_result-vbeln = iv_vbeln.
  es_result-waers = iv_waerk.
  es_result-wert  = iv_wert.

* zentraler Schalter
  SELECT SINGLE low FROM tvarvc INTO lv_aktiv
    WHERE name = 'ZSD_FSCM_CREDIT_AKTIV'
      AND type = 'P'.
  IF lv_aktiv <> 'X'.
    es_result-entscheid = 'OK'.
    es_result-quelle    = 'AUS'.
    RETURN.
  ENDIF.

* Kreditsegment, RFC-Ziel und Ersatzregel der Verkaufsorganisation
  SELECT SINGLE * FROM zsd_cr_segm INTO ls_seg
    WHERE vkorg = iv_vkorg.
  IF sy-subrc <> 0.
    MESSAGE e403(zsd) WITH iv_vkorg RAISING no_segment.
  ENDIF.
  es_result-segment = ls_seg-credit_sgmnt.

* 1. Wahl: Entscheidung des FSCM-Kreditmanagements
  CALL FUNCTION 'Z_UKM_ORDER_CHECK_RFC'
    DESTINATION ls_seg-rfcdest
    EXPORTING
      iv_partner            = iv_kunnr
      iv_segment            = ls_seg-credit_sgmnt
      iv_amount             = iv_wert
      iv_currency           = iv_waerk
    IMPORTING
      ev_decision           = es_result-entscheid
      ev_free_limit         = es_result-freies_limit
    EXCEPTIONS
      system_failure        = 1 MESSAGE lv_msg
      communication_failure = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc = 0.
    es_result-quelle = 'FSCM'.
    RETURN.
  ENDIF.

* 2. Wahl: lokale Ersatzregel auf replizierten Werten
  es_result-rfc_fehler = lv_msg.
  lv_class = ls_seg-regel_klasse.
  lv_meth  = ls_seg-regel_methode.
  IF lv_class IS INITIAL OR lv_meth IS INITIAL.
    lv_class = 'ZCL_CREDIT_RULES'.
    lv_meth  = 'RULE_STANDARD'.
  ENDIF.

  TRY.
      CALL METHOD (lv_class)=>(lv_meth)
        EXPORTING
          iv_partner = iv_kunnr
          iv_segment = ls_seg-credit_sgmnt
          iv_amount  = iv_wert
        RECEIVING
          rv_result  = es_result-entscheid.
      es_result-quelle = 'ERSATZ'.
    CATCH cx_sy_dyn_call_error INTO DATA(lx_dyn).
*     Regel nicht aufrufbar: sicherheitshalber sperren
      es_result-entscheid  = 'SPERRE'.
      es_result-quelle     = 'FEHLER'.
      es_result-rfc_fehler = lx_dyn->get_text( ).
  ENDTRY.
ENDFUNCTION.
