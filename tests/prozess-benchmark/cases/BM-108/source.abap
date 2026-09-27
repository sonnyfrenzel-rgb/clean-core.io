REPORT zcs_vertrag_verlaengern.
*----------------------------------------------------------------------*
* Serviceverträge: automatische Verlängerung vor Laufzeitende
* Verlängerungsregel je Vertragsart in ZCS_VERL_REGEL
* 2016-01 SKR  Erstellung
* 2022-05 SKR  Umstellung auf GROUP BY, Summenzeile je Kunde
*----------------------------------------------------------------------*
TABLES vbak.
SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_kunnr FOR vbak-kunnr.
PARAMETERS: p_tage TYPE i DEFAULT 30,
            p_test AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_ctr,
         vbeln   TYPE vbak-vbeln,
         kunnr   TYPE vbak-kunnr,
         auart   TYPE vbak-auart,
         venddat TYPE veda-venddat,
       END OF ty_ctr.

DATA: gt_ctr      TYPE STANDARD TABLE OF ty_ctr,
      gt_regel    TYPE HASHED TABLE OF zcs_verl_regel WITH UNIQUE KEY auart,
      gt_return   TYPE STANDARD TABLE OF bapiret2,
      gt_data     TYPE STANDARD TABLE OF bapictr,
      gt_datax    TYPE STANDARD TABLE OF bapictrx,
      gs_hdrx     TYPE bapisdh1x,
      gv_bis      TYPE sy-datum,
      gv_anz      TYPE i.

START-OF-SELECTION.
  gv_bis = sy-datum + p_tage.
  SELECT k~vbeln k~kunnr k~auart v~venddat
    INTO TABLE gt_ctr
    FROM vbak AS k
    INNER JOIN veda AS v ON v~vbeln = k~vbeln AND v~vposn = '000000'
    WHERE k~vbtyp = 'G'
      AND k~vkorg IN s_vkorg
      AND k~kunnr IN s_kunnr
      AND v~venddat BETWEEN sy-datum AND gv_bis
      AND v~vkuegru = space.
  IF gt_ctr IS INITIAL.
    MESSAGE s300(zcs).
    RETURN.
  ENDIF.
  SELECT * FROM zcs_verl_regel INTO TABLE gt_regel.

  LOOP AT gt_ctr INTO DATA(ls_ctr)
       GROUP BY ( kunnr = ls_ctr-kunnr ) ASSIGNING FIELD-SYMBOL(<lg_kunde>).
    CLEAR gv_anz.
    LOOP AT GROUP <lg_kunde> INTO DATA(ls_m).
      READ TABLE gt_regel INTO DATA(ls_regel)
           WITH TABLE KEY auart = ls_m-auart.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      DATA(lv_neu) = COND d( WHEN ls_regel-verl_tage > 0
                               THEN ls_m-venddat + ls_regel-verl_tage
                             ELSE ls_m-venddat + 365 ).

      IF p_test IS INITIAL.
        gs_hdrx-updateflag = 'U'.
        gt_data  = VALUE #( ( itm_number = '000000' con_en_dat = lv_neu ) ).
        gt_datax = VALUE #( ( itm_number = '000000' updateflag = 'U' con_en_dat = 'X' ) ).
        CALL FUNCTION 'BAPI_CUSTOMERCONTRACT_CHANGE'
          EXPORTING
            salesdocument        = ls_m-vbeln
            contract_header_inx  = gs_hdrx
          TABLES
            return               = gt_return
            contract_data_in     = gt_data
            contract_data_inx    = gt_datax.
        IF line_exists( gt_return[ type = 'E' ] ).
          CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
          WRITE: / ls_m-vbeln, 'Verlängerung fehlgeschlagen'.
          CONTINUE.
        ENDIF.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = 'X'.
      ENDIF.
      gv_anz = gv_anz + 1.
      WRITE: / ls_m-vbeln, ls_m-venddat, '->', lv_neu.
    ENDLOOP.
    WRITE: / 'Kunde', <lg_kunde>-kunnr, ':', gv_anz, 'Verträge verlängert'.
    ULINE.
  ENDLOOP.
