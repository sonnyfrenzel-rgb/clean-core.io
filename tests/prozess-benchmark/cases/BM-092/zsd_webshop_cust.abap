*&---------------------------------------------------------------------*
*& Report ZSD_WEBSHOP_CUST
*&---------------------------------------------------------------------*
*& Übernahme Neukunden aus dem Webshop (Stagingtabelle ZSD_WEB_CUST)
*& Anlage per Batch-Input XD01, Dublettenprüfung vorab.
*& Status Staging: N=neu, C=angelegt, D=Dublette, E=Fehler
*&---------------------------------------------------------------------*
REPORT zsd_webshop_cust.

TABLES zsd_web_cust.

DATA: gt_web   TYPE STANDARD TABLE OF zsd_web_cust,
      gs_web   TYPE zsd_web_cust,
      gt_bdc   TYPE STANDARD TABLE OF bdcdata,
      gs_bdc   TYPE bdcdata,
      gt_msg   TYPE STANDARD TABLE OF bdcmsgcoll,
      gs_msg   TYPE bdcmsgcoll,
      gv_kunnr TYPE kna1-kunnr,
      gv_text  TYPE c LENGTH 200,
      gv_ok    TYPE i,
      gv_dup   TYPE i,
      gv_err   TYPE i.

DEFINE bdc_dynpro.
  CLEAR gs_bdc.
  gs_bdc-program  = &1.
  gs_bdc-dynpro   = &2.
  gs_bdc-dynbegin = 'X'.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.

DEFINE bdc_field.
  CLEAR gs_bdc.
  gs_bdc-fnam = &1.
  gs_bdc-fval = &2.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.

SELECT-OPTIONS s_erdat FOR zsd_web_cust-erdat.
PARAMETERS: p_ktokd TYPE ktokd DEFAULT 'ZWEB',
            p_bukrs TYPE bukrs DEFAULT '1000',
            p_vkorg TYPE vkorg DEFAULT '1000',
            p_vtweg TYPE vtweg DEFAULT '30',
            p_spart TYPE spart DEFAULT '00',
            p_akont TYPE akont DEFAULT '0000140000',
            p_mode  TYPE c LENGTH 1 DEFAULT 'N'.

INCLUDE zsd_webshop_cust_f01.

START-OF-SELECTION.
  SELECT * FROM zsd_web_cust INTO TABLE gt_web
    WHERE status = 'N'
      AND erdat IN s_erdat.
  IF gt_web IS INITIAL.
    MESSAGE s000(zsd) WITH 'Keine neuen Webshop-Kunden'.
    RETURN.
  ENDIF.

  LOOP AT gt_web INTO gs_web.
    CLEAR gv_kunnr.
    PERFORM check_duplicate USING gs_web CHANGING gv_kunnr.
    IF gv_kunnr IS NOT INITIAL.
      UPDATE zsd_web_cust SET status = 'D'
                              kunnr  = gv_kunnr
        WHERE webid = gs_web-webid.
      gv_dup = gv_dup + 1.
      COMMIT WORK.
      CONTINUE.
    ENDIF.

    PERFORM build_bdc USING gs_web.
    REFRESH gt_msg.
    CALL TRANSACTION 'XD01' USING gt_bdc
         MODE p_mode
         UPDATE 'S'
         MESSAGES INTO gt_msg.
    IF sy-subrc = 0.
*     Meldung F2 170: Kunde & wurde im Buchungskreis & angelegt
      READ TABLE gt_msg INTO gs_msg
           WITH KEY msgtyp = 'S' msgid = 'F2' msgnr = '170'.
      gv_kunnr = gs_msg-msgv1.
      UPDATE zsd_web_cust SET status = 'C'
                              kunnr  = gv_kunnr
        WHERE webid = gs_web-webid.
      gv_ok = gv_ok + 1.
    ELSE.
      PERFORM get_error_text CHANGING gv_text.
      UPDATE zsd_web_cust SET status = 'E'
                              errtxt = gv_text
        WHERE webid = gs_web-webid.
      gv_err = gv_err + 1.
    ENDIF.
    COMMIT WORK.
  ENDLOOP.

  WRITE: / 'Angelegt: ', gv_ok,
         / 'Dubletten:', gv_dup,
         / 'Fehler:   ', gv_err.
