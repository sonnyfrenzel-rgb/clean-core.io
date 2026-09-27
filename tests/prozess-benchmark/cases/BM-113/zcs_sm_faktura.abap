REPORT zcs_sm_faktura.
*----------------------------------------------------------------------*
* Aufwandsbezogene Fakturierung technisch abgeschlossener Serviceaufträge
* über DP90; DIP-Profil je Auftragsart aus ZCS_DIP_MAP.
* Hintergrund: Batch-Input-Mappe per CALL TRANSACTION
* Dialog:      DP90 mit vorbelegtem Auftrag
*----------------------------------------------------------------------*
* 2012-02 HGR  Erstellung
* 2015-10 HGR  Garantieaufträge (AUFK-ZZGARANT) nicht fakturieren
* 2017-06 HGR  ohne Istkosten keine Anforderung
* 2019-07 EXT  Anwendungslog ZCS/FAKTURA statt WRITE-Liste
*----------------------------------------------------------------------*
TABLES aufk.

SELECT-OPTIONS: s_aufnr FOR aufk-aufnr,
                s_auart FOR aufk-auart OBLIGATORY,
                s_werks FOR aufk-werks.
PARAMETERS: p_bis  TYPE sy-datum DEFAULT sy-datum,
            p_dial AS CHECKBOX.

TYPES: BEGIN OF ty_ord,
         aufnr    TYPE aufk-aufnr,
         auart    TYPE aufk-auart,
         objnr    TYPE aufk-objnr,
         zzgarant TYPE aufk-zzgarant,
         dippr    TYPE zcs_dip_map-dippr,
       END OF ty_ord.

DATA: gt_ord  TYPE STANDARD TABLE OF ty_ord,
      gt_bdc  TYPE STANDARD TABLE OF bdcdata,
      gt_msg  TYPE STANDARD TABLE OF bdcmsgcoll,
      gv_log  TYPE balloghndl,
      gv_skip TYPE abap_bool,
      gv_ok   TYPE i,
      gv_err  TYPE i.

DEFINE bdc_dynpro.
  APPEND VALUE bdcdata( program = &1 dynpro = &2 dynbegin = 'X' ) TO gt_bdc.
END-OF-DEFINITION.

DEFINE bdc_field.
  APPEND VALUE bdcdata( fnam = &1 fval = &2 ) TO gt_bdc.
END-OF-DEFINITION.

INCLUDE zcs_sm_faktura_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM log_open.

  SELECT a~aufnr a~auart a~objnr a~zzgarant m~dippr
    INTO TABLE gt_ord
    FROM aufk AS a
    INNER JOIN zcs_dip_map AS m ON m~auart = a~auart
    INNER JOIN jest AS j ON j~objnr = a~objnr
    WHERE a~aufnr IN s_aufnr
      AND a~auart IN s_auart
      AND a~werks IN s_werks
      AND a~autyp = '30'
      AND a~idat2 <= p_bis
      AND j~stat  = 'I0045'
      AND j~inact = space
      AND NOT EXISTS ( SELECT * FROM zcs_sm_faklog AS f
                         WHERE f~aufnr = a~aufnr ).
  IF gt_ord IS INITIAL.
    RETURN.
  ENDIF.

  LOOP AT gt_ord INTO DATA(ls_ord).
    IF ls_ord-zzgarant = 'X'.
      PERFORM log_msg USING ls_ord-aufnr 'W' 'Garantieauftrag - keine Fakturierung'.
      CONTINUE.
    ENDIF.

    PERFORM check_costs USING ls_ord CHANGING gv_skip.
    IF gv_skip = abap_true.
      PERFORM log_msg USING ls_ord-aufnr 'W' 'Keine Istkosten'.
      CONTINUE.
    ENDIF.

    IF p_dial = 'X'.
      SET PARAMETER ID 'ANR' FIELD ls_ord-aufnr.
      CALL TRANSACTION 'DP90' AND SKIP FIRST SCREEN.
    ELSE.
      PERFORM bill_bdc USING ls_ord.
    ENDIF.
  ENDLOOP.

*----------------------------------------------------------------------*
END-OF-SELECTION.
  PERFORM log_show.
