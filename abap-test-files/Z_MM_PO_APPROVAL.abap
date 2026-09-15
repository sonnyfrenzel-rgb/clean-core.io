*&---------------------------------------------------------------------*
*& Report  Z_MM_PO_APPROVAL
*& Emergency purchase approval
*&---------------------------------------------------------------------*
*& Fictional but realistic MM example for Clean-Core.io:
*& purchase requisition check, vendor block list, price tolerance
*& against the purchasing info record, approval by department head
*& or manager, purchase order via BAPI with batch-input fallback.
*& Synthetic input only - not for productive SAP import.
*&---------------------------------------------------------------------*
REPORT z_mm_po_approval MESSAGE-ID zmm_po.

TABLES: eban, eina, eine, lfa1, lfm1, t16fs, csks, zmm_vend_block, zmm_po_appr.

TYPE-POOLS: abap.

CONSTANTS: c_doc_type      TYPE esart VALUE 'NB',
           c_release_group TYPE frggr VALUE 'ZE',
           c_purch_org     TYPE ekorg VALUE '1000'.

DATA: gs_eban       TYPE eban,
      gs_lfa1       TYPE lfa1,
      gv_amount     TYPE bapicurext,
      gv_ref_price  TYPE bapicurext,
      gv_emergency  TYPE abap_bool,
      gv_skip_limit TYPE abap_bool,
      gv_rejected   TYPE abap_bool,
      gv_on_hold    TYPE abap_bool,
      gv_approved   TYPE abap_bool,
      gv_approver   TYPE xubname,
      gv_ebeln      TYPE ebeln,
      gv_message    TYPE char255,
      gt_return     TYPE STANDARD TABLE OF bapiret2 WITH DEFAULT KEY.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE text-001.
PARAMETERS: p_banfn TYPE eban-banfn OBLIGATORY,
            p_bnfpo TYPE eban-bnfpo DEFAULT '00010',
            p_file  TYPE string LOWER CASE,
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b01.
START-OF-SELECTION.
  PERFORM check_authority.
  PERFORM read_requisition.
  PERFORM check_requisition.
  CHECK gv_rejected = abap_false.
  PERFORM upload_attachment.
  PERFORM read_vendor.
  PERFORM check_vendor.
  CHECK gv_rejected = abap_false.
  PERFORM read_info_record.
  PERFORM check_price.
  CHECK gv_on_hold = abap_false.
  PERFORM decide_approval.
  PERFORM notify_requester.
  PERFORM write_result_list.

*&---------------------------------------------------------------------*
*&      Form  READ_REQUISITION
*&---------------------------------------------------------------------*
FORM read_requisition.
  SELECT SINGLE * FROM eban INTO gs_eban
    WHERE banfn = p_banfn
      AND bnfpo = p_bnfpo
      AND loekz = space.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH 'Purchase requisition not found' p_banfn.
  ENDIF.
  gv_amount = gs_eban-menge * gs_eban-preis / gs_eban-peinh.
  IF gs_eban-waers <> 'EUR'.
    PERFORM convert_to_eur USING gs_eban-waers CHANGING gv_amount.
  ENDIF.
  IF gs_eban-dispo = 'EMG' OR gs_eban-bednr CP 'EMERG*'.
    gv_emergency = abap_true.
  ENDIF.
ENDFORM.

FORM check_requisition.
  IF gs_eban-matnr IS INITIAL.
    PERFORM reject USING 'Material missing on the requisition'.
    RETURN.
  ENDIF.
  IF gs_eban-frgkz = 'X'.
    PERFORM reject USING 'Requisition is blocked for release'.
    RETURN.
  ENDIF.
  "Plant 1000 is the central warehouse
  IF gs_eban-werks = '1000'.
    gv_skip_limit = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_AUTHORITY
*&---------------------------------------------------------------------*
FORM check_authority.
  DATA lv_ekgrp TYPE eban-ekgrp.

  SELECT SINGLE ekgrp FROM eban INTO lv_ekgrp
    WHERE banfn = p_banfn
      AND bnfpo = p_bnfpo.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH 'Purchase requisition not found' p_banfn.
  ENDIF.

  "Only the purchasing group of the requisition may approve
  "(emergency procurement, ticket MM-2211)

  AUTHORITY-CHECK OBJECT 'M_BANF_EKG'
    ID 'ACTVT' FIELD '02'
    ID 'EKGRP' FIELD lv_ekgrp.
  IF sy-subrc <> 0.
    MESSAGE e002 WITH 'No authorization for purchasing group' lv_ekgrp.
  ENDIF.
ENDFORM.

FORM upload_attachment.
  DATA lt_bin TYPE STANDARD TABLE OF solix WITH DEFAULT KEY.
  DATA lv_length TYPE i.

  CHECK p_file IS NOT INITIAL.
  CALL FUNCTION 'GUI_UPLOAD'
    EXPORTING
      filename   = p_file
      filetype   = 'BIN'
    IMPORTING
      filelength = lv_length
    TABLES
      data_tab   = lt_bin
    EXCEPTIONS
      file_open_error = 1
      file_read_error = 2
      OTHERS          = 3.
  IF sy-subrc <> 0.
    MESSAGE w003 WITH 'Attachment could not be read:' p_file.
  ELSE.
    PERFORM store_attachment TABLES lt_bin USING lv_length.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  READ_VENDOR
*&---------------------------------------------------------------------*
FORM read_vendor.
  DATA ls_lfm1 TYPE lfm1.

  SELECT SINGLE * FROM lfa1 INTO gs_lfa1
    WHERE lifnr = gs_eban-flief.
  IF sy-subrc <> 0.
    PERFORM reject USING 'Fixed vendor missing on the requisition'.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM lfm1 INTO ls_lfm1
    WHERE lifnr = gs_eban-flief
      AND ekorg = c_purch_org.
  IF sy-subrc <> 0.
    PERFORM reject USING 'Vendor not created for purchasing org 1000'.
  ENDIF.
ENDFORM.

FORM convert_to_eur USING iv_waers TYPE waers
                 CHANGING cv_amount TYPE bapicurext.
  DATA lv_local TYPE bapicurext.

  CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
    EXPORTING
      date             = sy-datum
      foreign_amount   = cv_amount
      foreign_currency = iv_waers
      local_currency   = 'EUR'
    IMPORTING
      local_amount     = lv_local
    EXCEPTIONS
      no_rate_found    = 1
      OTHERS           = 2.
  IF sy-subrc = 0.
    cv_amount = lv_local.
  ELSE.
    MESSAGE w004 WITH 'No exchange rate for' iv_waers.
  ENDIF.
ENDFORM.

FORM check_cost_center.
  SELECT SINGLE * FROM csks
    WHERE kokrs = '1000'
      AND kostl = gs_eban-kostl
      AND datbi >= sy-datum.
  IF sy-subrc <> 0.
    PERFORM reject USING 'Cost center not valid today'.
  ENDIF.
ENDFORM.

FORM check_account_assignment.
  CASE gs_eban-knttp.
    WHEN 'K'.
      PERFORM check_cost_center.
    WHEN 'F'.
      IF gs_eban-aufnr IS INITIAL.
        PERFORM reject USING 'Internal order missing'.
      ENDIF.
    WHEN space.
      "Stock material - no account assignment needed
    WHEN OTHERS.
      PERFORM reject USING 'Account assignment category not allowed'.
  ENDCASE.
ENDFORM.

FORM determine_delivery_date CHANGING cv_date TYPE eindt.
  DATA lv_days TYPE i.

  IF gv_emergency = abap_true.
    lv_days = 2.
  ELSE.
    lv_days = gs_eban-webaz + 5.
  ENDIF.
  cv_date = sy-datum + lv_days.
  IF cv_date < gs_eban-lfdat.
    cv_date = gs_eban-lfdat.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_VENDOR
*&---------------------------------------------------------------------*
FORM check_vendor.
  DATA lv_lifnr TYPE lifnr.

  SELECT SINGLE lifnr FROM zmm_vend_block INTO lv_lifnr
    WHERE lifnr = gs_eban-flief
      AND blocked = 'X'.
  IF sy-subrc = 0.
    PERFORM reject USING 'Vendor is on the block list'.
  ENDIF.
ENDFORM.

FORM reject USING iv_reason TYPE clike.
  gv_rejected = abap_true.
  gv_message  = iv_reason.
  MESSAGE s005 WITH 'Requisition rejected:' iv_reason.
  PERFORM log_approval.
ENDFORM.

FORM hold_for_buyer.
  gv_on_hold = abap_true.
  gv_message = 'Price deviates from the info record - buyer review'.
  UPDATE eban SET statu = 'H'
    WHERE banfn = p_banfn
      AND bnfpo = p_bnfpo.
  COMMIT WORK.
  PERFORM log_approval.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  READ_INFO_RECORD
*&---------------------------------------------------------------------*
FORM read_info_record.
  DATA: ls_eina TYPE eina,
        ls_eine TYPE eine.

  SELECT SINGLE * FROM eina INTO ls_eina
    WHERE matnr = gs_eban-matnr
      AND lifnr = gs_eban-flief.
  IF sy-subrc <> 0.
    CLEAR gv_ref_price.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM eine INTO ls_eine
    WHERE infnr = ls_eina-infnr
      AND ekorg = c_purch_org
      AND werks = gs_eban-werks.
  IF sy-subrc = 0 AND ls_eine-peinh > 0.
    gv_ref_price = ls_eine-netpr / ls_eine-peinh.
  ENDIF.
ENDFORM.

FORM lock_requisition.
  DATA lv_tries TYPE i.

  DO 3 TIMES.
    CALL FUNCTION 'ENQUEUE_EMEBANE'
      EXPORTING
        banfn          = p_banfn
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc = 0.
      RETURN.
    ENDIF.
    ADD 1 TO lv_tries.
    WAIT UP TO 2 SECONDS.
  ENDDO.
  MESSAGE e006 WITH 'Requisition is locked by another user' p_banfn.
ENDFORM.

FORM read_vendor_rating CHANGING cv_score TYPE i.
  SELECT SINGLE gesbu FROM elbk INTO @DATA(lv_score)
    WHERE lifnr = @gs_eban-flief
      AND ekorg = @c_purch_org.
  IF sy-subrc = 0.
    cv_score = lv_score.
  ELSE.
    cv_score = 50.
  ENDIF.
ENDFORM.

FORM check_material_status.
  DATA lv_mmsta TYPE marc-mmsta.

  SELECT SINGLE mmsta FROM marc INTO lv_mmsta
    WHERE matnr = gs_eban-matnr
      AND werks = gs_eban-werks.
  IF lv_mmsta = '01' OR lv_mmsta = 'Z9'.
    PERFORM reject USING 'Material is blocked for purchasing in this plant'.
  ENDIF.
ENDFORM.

FORM read_contract CHANGING cv_konnr TYPE konnr
                            cv_ktpnr TYPE ktpnr.
  SELECT k~ebeln, p~ebelp
    FROM ekko AS k
    INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
    WHERE k~lifnr = @gs_eban-flief
      AND k~bstyp = 'K'
      AND k~kdatb <= @sy-datum
      AND k~kdate >= @sy-datum
      AND p~matnr = @gs_eban-matnr
    ORDER BY k~kdate DESCENDING
    INTO (@cv_konnr, @cv_ktpnr)
    UP TO 1 ROWS.
  ENDSELECT.
ENDFORM.

FORM check_budget CHANGING cv_ok TYPE abap_bool.
  DATA: lv_budget TYPE bapicurext,
        lv_used   TYPE bapicurext.

  SELECT SINGLE budget used FROM zmm_budget INTO (lv_budget, lv_used)
    WHERE kostl = gs_eban-kostl
      AND gjahr = sy-datum(4).
  IF sy-subrc <> 0.
    cv_ok = abap_true.
    RETURN.
  ENDIF.
  IF lv_used + gv_amount > lv_budget.
    cv_ok = abap_false.
  ELSE.
    cv_ok = abap_true.
  ENDIF.
ENDFORM.

FORM derive_purchasing_group CHANGING cv_ekgrp TYPE ekgrp.
  cv_ekgrp = gs_eban-ekgrp.
  IF gv_emergency = abap_true.
    cv_ekgrp = 'E01'.
  ENDIF.
ENDFORM.

FORM check_open_orders CHANGING cv_open TYPE bapicurext.
  SELECT SUM( p~netwr ) FROM ekko AS k
    INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
    INTO @cv_open
    WHERE k~lifnr = @gs_eban-flief
      AND k~bsart = @c_doc_type
      AND p~elikz = @space.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_LIMIT
*&---------------------------------------------------------------------*
FORM check_limit USING iv_amount TYPE bapicurext.
  DATA: ls_t16fs TYPE t16fs,
        lv_ok    TYPE abap_bool.

  SELECT SINGLE * FROM t16fs INTO ls_t16fs
    WHERE frggr = c_release_group.
  IF sy-subrc = 0.
    lv_ok = cl_mm_internal=>check_limit( iv_amount   = iv_amount
                                         is_strategy = ls_t16fs ).
    IF lv_ok = abap_false.
      gv_message = 'Amount above the release limit'.
    ENDIF.
  ENDIF.
ENDFORM.

FORM check_currency.
  "Price unit 0 comes from the old interface data
  IF gs_eban-waers IS INITIAL.
    gs_eban-waers = 'EUR'.
  ENDIF.
  IF gs_eban-peinh = 0.
    gs_eban-peinh = 1.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_PRICE
*&---------------------------------------------------------------------*
FORM check_price.
  DATA: lv_price   TYPE bapicurext,
        lv_ref     TYPE bapicurext,
        lv_dev_pct TYPE p LENGTH 7 DECIMALS 2.

  CHECK gv_ref_price > 0.
  lv_price = gs_eban-preis / gs_eban-peinh.
  lv_ref   = gv_ref_price.
  lv_dev_pct = ( lv_price - lv_ref )
             * 100 / lv_ref.

  "Tolerance agreed with purchasing
  IF lv_dev_pct > 5.
    PERFORM hold_for_buyer.
    RETURN.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DECIDE_APPROVAL
*&---------------------------------------------------------------------*
FORM decide_approval.
  IF gv_emergency = abap_true AND gv_amount <= '50000.00'.
    PERFORM find_department_head CHANGING gv_approver.
    PERFORM request_approval USING gv_approver 'DEPT_HEAD'.
  ELSEIF gv_skip_limit = abap_false.
    PERFORM check_limit USING gv_amount.
    PERFORM find_manager CHANGING gv_approver.
    PERFORM request_approval USING gv_approver 'MANAGER'.
  ELSE.
    gv_approved = abap_true.
    gv_message  = 'Approved without limit check (central warehouse)'.
  ENDIF.
  IF gv_approved = abap_true.
    PERFORM create_purchase_order.
  ENDIF.
  PERFORM log_approval.
ENDFORM.

FORM log_approval.
  DATA ls_appr TYPE zmm_po_appr.

  ls_appr-mandt    = sy-mandt.
  ls_appr-banfn    = p_banfn.
  ls_appr-bnfpo    = p_bnfpo.
  ls_appr-approver = gv_approver.
  ls_appr-amount   = gv_amount.
  ls_appr-message  = gv_message.
  ls_appr-erdat    = sy-datum.
  ls_appr-erzet    = sy-uzeit.
  INSERT zmm_po_appr FROM ls_appr.
ENDFORM.

FORM set_requisition_status USING iv_status TYPE char1.
  "H = on hold, A = approved, R = rejected
  UPDATE eban SET statu = iv_status
    WHERE banfn = p_banfn
      AND bnfpo = p_bnfpo.
  IF sy-subrc <> 0.
    MESSAGE w008 WITH 'Status not updated for' p_banfn.
  ENDIF.
ENDFORM.

FORM find_department_head CHANGING cv_approver TYPE xubname.
  SELECT SINGLE uname FROM zmm_dept_head INTO cv_approver
    WHERE kostl = gs_eban-kostl.
  IF sy-subrc <> 0.
    cv_approver = 'PURCH_LEAD'.
  ENDIF.
ENDFORM.
INCLUDE z_mm_po_notify.

FORM find_manager CHANGING cv_approver TYPE xubname.
  DATA lv_pernr TYPE pernr_d.

  SELECT SINGLE pernr FROM pa0105 INTO lv_pernr
    WHERE usrid = gs_eban-afnam
      AND subty = '0001'.
  SELECT SINGLE usrid FROM pa0105 INTO cv_approver
    WHERE pernr = lv_pernr
      AND subty = '0001'.
ENDFORM.

FORM get_requester_mail CHANGING cv_mail TYPE ad_smtpadr.
  SELECT SINGLE smtp_addr FROM adr6 INTO cv_mail
    WHERE persnumber = ( SELECT persnumber FROM usr21
                          WHERE bname = gs_eban-afnam ).
  IF sy-subrc <> 0.
    CLEAR cv_mail.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  NOTIFY_REQUESTER
*&---------------------------------------------------------------------*
FORM notify_requester.
  DATA: lv_fm_name TYPE rs38l_fnam,
        lv_variant TYPE char10.

  SELECT SINGLE fm_name FROM zmm_notify_cfg INTO lv_fm_name
    WHERE werks = gs_eban-werks.
  CHECK sy-subrc = 0.
  CALL FUNCTION lv_fm_name
    EXPORTING
      iv_banfn   = p_banfn
      iv_message = gv_message
    EXCEPTIONS
      OTHERS     = 1.
  IF sy-subrc <> 0.
    MESSAGE w007 WITH 'Notification failed for' p_banfn.
  ENDIF.
ENDFORM.
INCLUDE z_mm_po_log.

*&---------------------------------------------------------------------*
*&      Form  REQUEST_APPROVAL
*&---------------------------------------------------------------------*
FORM request_approval USING iv_approver TYPE xubname
                            iv_role     TYPE char10.
  DATA: lv_objkey TYPE swo_typeid,
        lt_cont   TYPE STANDARD TABLE OF swcont WITH DEFAULT KEY,
        ls_cont   TYPE swcont.

  IF p_test = abap_true.
    gv_approved = abap_true.
    gv_message  = 'Test mode: approval simulated'.
    RETURN.
  ENDIF.

  CONCATENATE p_banfn p_bnfpo INTO lv_objkey.
  ls_cont-element = 'APPROVER'.
  ls_cont-value   = iv_approver.
  APPEND ls_cont TO lt_cont.
  ls_cont-element = 'ROLE'.
  ls_cont-value   = iv_role.
  APPEND ls_cont TO lt_cont.

  CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
    EXPORTING
      object_type = 'BUS2105'
      object_key  = lv_objkey
      event       = 'ZAPPROVE'
    TABLES
      input_container = lt_cont.
  COMMIT WORK.

  "Approval arrives asynchronously in the workflow; the report
  "treats the request as approved for emergency orders
  IF iv_role = 'DEPT_HEAD'.
    gv_approved = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CREATE_PURCHASE_ORDER
*&---------------------------------------------------------------------*
FORM create_purchase_order.
  DATA: ls_header  TYPE bapimepoheader,
        ls_headerx TYPE bapimepoheaderx,
        lt_item    TYPE STANDARD TABLE OF bapimepoitem WITH DEFAULT KEY,
        lt_itemx   TYPE STANDARD TABLE OF bapimepoitemx WITH DEFAULT KEY,
        ls_item    TYPE bapimepoitem,
        ls_itemx   TYPE bapimepoitemx,
        ls_return  TYPE bapiret2.

  ls_header-doc_type   = c_doc_type.
  ls_header-vendor     = gs_eban-flief.
  ls_header-purch_org  = c_purch_org.
  ls_header-pur_group  = gs_eban-ekgrp.
  ls_header-comp_code  = '1000'.
  ls_headerx-doc_type  = abap_true.
  ls_headerx-vendor    = abap_true.
  ls_headerx-purch_org = abap_true.
  ls_headerx-pur_group = abap_true.
  ls_headerx-comp_code = abap_true.

  ls_item-po_item    = '00010'.
  ls_item-material   = gs_eban-matnr.
  ls_item-plant      = gs_eban-werks.
  ls_item-quantity   = gs_eban-menge.
  ls_item-preq_no    = p_banfn.
  ls_item-preq_item  = p_bnfpo.
  APPEND ls_item TO lt_item.
  ls_itemx-po_item   = '00010'.
  ls_itemx-material  = abap_true.
  ls_itemx-plant     = abap_true.
  ls_itemx-quantity  = abap_true.
  ls_itemx-preq_no   = abap_true.
  ls_itemx-preq_item = abap_true.
  APPEND ls_itemx TO lt_itemx.

  CALL FUNCTION 'BAPI_PO_CREATE1'
    EXPORTING
      poheader         = ls_header
      poheaderx        = ls_headerx
    IMPORTING
      exppurchaseorder = gv_ebeln
    TABLES
      return           = gt_return
      poitem           = lt_item
      poitemx          = lt_itemx.

  READ TABLE gt_return INTO ls_return WITH KEY type = 'E'.
  IF sy-subrc = 0.
    PERFORM create_po_batch_input.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    CONCATENATE 'Purchase order' gv_ebeln 'created' INTO gv_message
      SEPARATED BY space.
  ENDIF.
ENDFORM.

FORM create_po_batch_input.
  DATA: lt_bdc  TYPE STANDARD TABLE OF bdcdata WITH DEFAULT KEY,
        ls_bdc  TYPE bdcdata,
        lt_msg  TYPE STANDARD TABLE OF bdcmsgcoll WITH DEFAULT KEY.

  ls_bdc-program  = 'SAPLMEGUI'.
  ls_bdc-dynpro   = '0014'.
  ls_bdc-dynbegin = 'X'.
  APPEND ls_bdc TO lt_bdc.
  CLEAR ls_bdc.
  ls_bdc-fnam = 'MEPO_TOPLINE-SUPERFIELD'.
  ls_bdc-fval = gs_eban-flief.
  APPEND ls_bdc TO lt_bdc.
  ls_bdc-fnam = 'BDC_OKCODE'.
  ls_bdc-fval = '=MESAVE'.
  APPEND ls_bdc TO lt_bdc.

  CALL TRANSACTION 'ME21N' USING lt_bdc
    MODE 'N'
    UPDATE 'S'
    MESSAGES INTO lt_msg.
  IF sy-subrc <> 0.
    gv_message = 'Purchase order could not be created'.
  ELSE.
    gv_message = 'Purchase order created by batch input'.
  ENDIF.
ENDFORM.

FORM store_attachment TABLES it_bin STRUCTURE solix
                      USING iv_length TYPE i.
  DATA lv_objkey TYPE swo_typeid.

  CONCATENATE p_banfn p_bnfpo INTO lv_objkey.
  INSERT zmm_po_attach FROM @( VALUE #( mandt  = sy-mandt
                                        objkey = lv_objkey
                                        length = iv_length
                                        erdat  = sy-datum ) ).
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  WRITE_RESULT_LIST
*&---------------------------------------------------------------------*
FORM write_result_list.
  FORMAT COLOR COL_HEADING.
  WRITE: / 'Emergency purchase approval', sy-datum, sy-uzeit.
  FORMAT RESET.
  ULINE.
  WRITE: / 'Requisition:', p_banfn, p_bnfpo,
         / 'Vendor:     ', gs_lfa1-lifnr, gs_lfa1-name1,
         / 'Amount EUR: ', gv_amount,
         / 'Approver:   ', gv_approver,
         / 'Order:      ', gv_ebeln,
         / 'Result:     ', gv_message.
  ULINE.
ENDFORM.
