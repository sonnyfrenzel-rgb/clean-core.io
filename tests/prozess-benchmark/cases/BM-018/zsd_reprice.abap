REPORT zsd_reprice MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Neubewertung offener Kundenaufträge (z. B. nach Kampagnenstart)
*
* Für jeden offenen Auftrag wird die Preisfindung per BAPI mit der
* gewählten Preisfindungsart neu ausgeführt. Weicht der neue Nettowert
* um mehr als p_maxd % ab, erhält der Auftrag die Liefersperre Z7
* ("Preisprüfung"). Abweichungen werden in ZSD_REPRICE_LOG protokolliert.
*----------------------------------------------------------------------*
* 2015-04 KWE  Ersterstellung (Projekt PREIS2015)
* 2016-01 KWE  Kampagnenrabatt ZKA1 separat ausweisen
* 2019-11 LMA  Liefersperre Z7 bei großer Abweichung
* 2021-06 LMA  Protokoll per Verbuchung statt direktem INSERT
*              (vorher: INSERT zsd_reprice_log FROM TABLE gt_log)
*----------------------------------------------------------------------*
TABLES: vbak.

TYPES: BEGIN OF ty_auftrag,
         vbeln TYPE vbak-vbeln,
         knumv TYPE vbak-knumv,
         netwr TYPE vbak-netwr,
         waerk TYPE vbak-waerk,
         kunnr TYPE vbak-kunnr,
         lifsk TYPE vbak-lifsk,
       END OF ty_auftrag,
       BEGIN OF ty_out,
         vbeln     TYPE vbak-vbeln,
         kunnr     TYPE vbak-kunnr,
         netwr_alt TYPE vbak-netwr,
         netwr_neu TYPE vbak-netwr,
         abw_proz  TYPE p LENGTH 7 DECIMALS 2,
         waerk     TYPE vbak-waerk,
         zka1_alt  TYPE konv-kwert,
         zka1_neu  TYPE konv-kwert,
         status    TYPE char1,
         text      TYPE bapi_msg,
       END OF ty_out.

DATA: gt_auftrag TYPE STANDARD TABLE OF ty_auftrag,
      gs_auftrag TYPE ty_auftrag,
      gt_out     TYPE STANDARD TABLE OF ty_out,
      gt_log     TYPE STANDARD TABLE OF zsd_reprice_log.

SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_auart FOR vbak-auart,
                s_audat FOR vbak-audat,
                s_kunnr FOR vbak-kunnr.
* Preisfindungsart: B = komplett neu, C = manuelle Elemente übernehmen,
*                   G = Steuern neu ermitteln (siehe Customizing VTAA)
PARAMETERS:     p_ptype TYPE knprs DEFAULT 'C',
                p_maxd  TYPE p LENGTH 5 DECIMALS 2 DEFAULT '10.00',
                p_test  AS CHECKBOX DEFAULT 'X'.

INCLUDE zsd_reprice_f01.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'Z_REPRICE'
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e801.
  ENDIF.

  PERFORM auftraege_lesen.
  IF gt_auftrag IS INITIAL.
    MESSAGE s802.
    RETURN.
  ENDIF.

  LOOP AT gt_auftrag INTO gs_auftrag.
    PERFORM auftrag_neu_bewerten USING gs_auftrag.
  ENDLOOP.

  IF p_test = abap_false AND gt_log IS NOT INITIAL.
    CALL FUNCTION 'Z_SD_REPRICE_LOG_UPD' IN UPDATE TASK
      TABLES
        it_log = gt_log.
    COMMIT WORK.
  ENDIF.

  PERFORM ausgabe.
