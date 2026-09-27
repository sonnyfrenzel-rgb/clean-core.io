*&---------------------------------------------------------------------*
*& Include ZOM_REORG_UPLOAD_F03  - Personalstamm per Batch-Input (PA40)
*&---------------------------------------------------------------------*

FORM pa_org_reassign USING pv_pernr TYPE pernr_d
                           pv_plans TYPE hrobjid
                     CHANGING cv_ok TYPE abap_bool.
  DATA: lt_msg   TYPE STANDARD TABLE OF bdcmsgcoll,
        lv_datum TYPE char10,
        lv_mode  TYPE char1 VALUE 'N'.

  cv_ok = abap_false.
  CLEAR gt_bdc.
  WRITE p_begda TO lv_datum DD/MM/YYYY.

* Einstieg Personalmassnahmen
  PERFORM bdc_dynpro USING 'SAPMP50A' '2000'.
  PERFORM bdc_field  USING 'RP50G-PERNR' pv_pernr.
  PERFORM bdc_field  USING 'RP50G-EINDA' lv_datum.
  PERFORM bdc_field  USING 'T529T-MNTXT(01)' 'X'.   "Zeile Massnahmenart
  PERFORM bdc_field  USING 'RP50G-SELEC(01)' 'X'.
  PERFORM bdc_field  USING 'BDC_OKCODE' '=PICK'.
* Massnahme ZO: Massnahmengrund 01 (Reorganisation)
  PERFORM bdc_dynpro USING 'MP000000' '2000'.
  PERFORM bdc_field  USING 'P0000-MASSN' 'ZO'.
  PERFORM bdc_field  USING 'P0000-MASSG' '01'.
  PERFORM bdc_field  USING 'BDC_OKCODE' '=UPD'.
* Organisatorische Zuordnung: neue Planstelle uebernimmt Org.-Einheit
  PERFORM bdc_dynpro USING 'MP000100' '2000'.
  PERFORM bdc_field  USING 'P0001-PLANS' pv_plans.
  PERFORM bdc_field  USING 'BDC_OKCODE' '=UPD'.

* Debug: sichtbar abspielen fuer den OM-Verantwortlichen
  IF sy-uname = 'OMADMIN1'.
    lv_mode = 'A'.
  ENDIF.

  CALL TRANSACTION 'PA40' USING gt_bdc
       MODE lv_mode
       UPDATE 'S'
       MESSAGES INTO lt_msg.

  READ TABLE lt_msg TRANSPORTING NO FIELDS WITH KEY msgtyp = 'E'.
  IF sy-subrc = 0.
    RETURN.
  ENDIF.
  READ TABLE lt_msg TRANSPORTING NO FIELDS WITH KEY msgtyp = 'A'.
  IF sy-subrc = 0.
    RETURN.
  ENDIF.
  cv_ok = abap_true.
ENDFORM.

*----------------------------------------------------------------------*
FORM bdc_dynpro USING pv_program TYPE clike
                      pv_dynpro  TYPE clike.
  APPEND VALUE bdcdata( program = pv_program dynpro = pv_dynpro
                        dynbegin = 'X' ) TO gt_bdc.
ENDFORM.

*----------------------------------------------------------------------*
FORM bdc_field USING pv_fnam TYPE clike
                     pv_fval TYPE any.
  DATA ls_bdc TYPE bdcdata.
  ls_bdc-fnam = pv_fnam.
  WRITE pv_fval TO ls_bdc-fval LEFT-JUSTIFIED.
  APPEND ls_bdc TO gt_bdc.
ENDFORM.
