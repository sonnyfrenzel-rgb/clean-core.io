*----------------------------------------------------------------------*
***INCLUDE LZMATMAS_INF02 - Prüfung, Verbuchung, Status
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_SERIALIZATION
*&---------------------------------------------------------------------*
*& Ist für das Material bereits ein jüngeres IDoc verbucht, wird dieses
*& (ältere) IDoc übersprungen.
*&---------------------------------------------------------------------*
FORM check_serialization USING    ps_edidc TYPE edidc
                         CHANGING pv_skip  TYPE c.
  DATA ls_serial TYPE zmm_idoc_serial.

  CLEAR pv_skip.
  SELECT SINGLE * FROM zmm_idoc_serial INTO ls_serial
    WHERE matnr = gs_head-material.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  IF ls_serial-credat > ps_edidc-credat
     OR ( ls_serial-credat = ps_edidc-credat
          AND ls_serial-cretim > ps_edidc-cretim ).
    pv_skip = 'X'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VALIDATE
*&---------------------------------------------------------------------*
FORM validate CHANGING pv_error TYPE c.
  DATA: lv_mtart TYPE t134-mtart,
        lv_werks TYPE t001w-werks,
        ls_marc  TYPE bapi_marc.

  IF gs_head-material IS INITIAL.
    PERFORM set_error USING '001' space space.
    pv_error = 'X'.
    RETURN.
  ENDIF.

  SELECT SINGLE mtart FROM t134 INTO lv_mtart
    WHERE mtart = gs_head-matl_type.
  IF sy-subrc <> 0.
    PERFORM set_error USING '002' gs_head-matl_type space.
    pv_error = 'X'.
    RETURN.
  ENDIF.

  LOOP AT gt_marc INTO ls_marc.
    SELECT SINGLE werks FROM t001w INTO lv_werks
      WHERE werks = ls_marc-plant.
    IF sy-subrc <> 0.
      PERFORM set_error USING '003' ls_marc-plant gs_head-material.
      pv_error = 'X'.
      RETURN.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form POST_MATERIAL
*&---------------------------------------------------------------------*
*& 1. Aufruf: Mandantendaten, Texte, Mengeneinheiten, Kundenfelder
*& 2. je Werk ein weiterer Aufruf (der BAPI kennt nur ein Werk)
*& Commit/Rollback hier, nicht in der ALE-Schicht (historisch).
*&---------------------------------------------------------------------*
FORM post_material CHANGING pv_error TYPE c.
  DATA: ls_return TYPE bapiret2,
        ls_marc   TYPE bapi_marc,
        ls_marcx  TYPE bapi_marcx,
        ls_head   TYPE bapimathead.

  CALL FUNCTION 'ENQUEUE_EMMARAE'
    EXPORTING
      matnr          = gs_head-material
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    PERFORM set_error USING '004' gs_head-material sy-msgv1.
    pv_error = 'X'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_MATERIAL_SAVEDATA'
    EXPORTING
      headdata            = gs_head
      clientdata          = gs_mara
      clientdatax         = gs_marax
    IMPORTING
      return              = ls_return
    TABLES
      materialdescription = gt_makt
      unitsofmeasure      = gt_marm
      unitsofmeasurex     = gt_marmx
      extensionin         = gt_extin
      extensioninx        = gt_extinx.
  IF ls_return-type CA 'EA'.
    PERFORM set_error USING '005' ls_return-message(50) space.
    pv_error = 'X'.
  ELSE.
    LOOP AT gt_marc INTO ls_marc.
      ls_head = gs_head.
      ls_head-mrp_view      = 'X'.
      ls_head-purchase_view = 'X'.
      CLEAR ls_marcx.
      ls_marcx-plant      = ls_marc-plant.
      ls_marcx-mrp_type   = 'X'.
      ls_marcx-mrp_ctrler = 'X'.
      ls_marcx-pur_group  = 'X'.
      ls_marcx-proc_type  = 'X'.
      ls_marcx-profit_ctr = 'X'.
      CALL FUNCTION 'BAPI_MATERIAL_SAVEDATA'
        EXPORTING
          headdata   = ls_head
          plantdata  = ls_marc
          plantdatax = ls_marcx
        IMPORTING
          return     = ls_return.
      IF ls_return-type CA 'EA'.
        PERFORM set_error USING '006' ls_marc-plant ls_return-message(50).
        pv_error = 'X'.
        EXIT.
      ENDIF.
    ENDLOOP.
  ENDIF.

  IF pv_error IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EMMARAE'
    EXPORTING
      matnr = gs_head-material.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form UPDATE_SERIALIZATION
*&---------------------------------------------------------------------*
FORM update_serialization USING ps_edidc TYPE edidc.
  DATA ls_serial TYPE zmm_idoc_serial.

  ls_serial-matnr  = gs_head-material.
  ls_serial-docnum = ps_edidc-docnum.
  ls_serial-credat = ps_edidc-credat.
  ls_serial-cretim = ps_edidc-cretim.
  MODIFY zmm_idoc_serial FROM ls_serial.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ADD_STATUS
*&---------------------------------------------------------------------*
FORM add_status TABLES pt_status STRUCTURE bdidocstat
                USING  pv_docnum TYPE edi_docnum
                       pv_status TYPE edi_status.
  DATA ls_status TYPE bdidocstat.

  ls_status-docnum = pv_docnum.
  ls_status-status = pv_status.
  ls_status-msgid  = 'ZMM_ALE'.
  CASE pv_status.
    WHEN gc_status_ok.
      ls_status-msgty = 'S'.
      ls_status-msgno = '010'.
      ls_status-msgv1 = gs_head-material.
    WHEN gc_status_skip.
      ls_status-msgty = 'W'.
      ls_status-msgno = '011'.
      ls_status-msgv1 = gs_head-material.
    WHEN OTHERS.
      ls_status-msgty = 'E'.
      ls_status-msgno = gs_err-msgno.
      ls_status-msgv1 = gs_err-msgv1.
      ls_status-msgv2 = gs_err-msgv2.
  ENDCASE.
  APPEND ls_status TO pt_status.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SET_ERROR
*&---------------------------------------------------------------------*
FORM set_error USING pv_msgno TYPE symsgno
                     pv_v1    TYPE any
                     pv_v2    TYPE any.
  gs_err-msgno = pv_msgno.
  gs_err-msgv1 = pv_v1.
  gs_err-msgv2 = pv_v2.
ENDFORM.
