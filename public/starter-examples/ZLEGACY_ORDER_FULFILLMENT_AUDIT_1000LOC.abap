REPORT zlegacy_order_fulfillment_audit MESSAGE-ID zsd_legacy.

*---------------------------------------------------------------------*
* Legacy enterprise report for Clean-Core / modernization testing
* Fictional but realistic: SD order remediation, credit check,
* inventory reconciliation, batch-input updates, RFC enrichment,
* update-task logging, direct table access, classic ALV and downloads.
*---------------------------------------------------------------------*

TABLES: vbak, vbap, vbep, kna1, knb1, mara, marc, mard, tvko, t001, usr02, zsd_ord_risk, zsd_legacy_log.

TYPE-POOLS: slis, abap.

CONSTANTS: c_program        TYPE syrepid VALUE 'ZLEGACY_ORDER_FULFILLMENT_AUDIT',
           c_destination    TYPE rfcdest VALUE 'PRD_CREDIT_RFC',
           c_tcode_va02     TYPE tcode   VALUE 'VA02',
           c_default_vkorg  TYPE vkorg   VALUE '1000',
           c_default_werks  TYPE werks_d VALUE '1000',
           c_local_path     TYPE string  VALUE 'C:\\TEMP\\legacy_order_audit.csv',
           c_mail_sender    TYPE adr6-smtp_addr VALUE 'batch-user@example.local',
           c_max_items      TYPE i VALUE 999999,
           c_critical_score TYPE i VALUE 80,
           c_medium_score   TYPE i VALUE 50.

DATA: gv_batch_mode      TYPE c VALUE 'X',
      gv_simulation      TYPE c,
      gv_commit_counter  TYPE i,
      gv_error_counter   TYPE i,
      gv_warning_counter TYPE i,
      gv_success_counter TYPE i,
      gv_line_count      TYPE i,
      gv_file_name       TYPE string,
      gv_layout          TYPE slis_layout_alv,
      gv_repid           TYPE syrepid,
      gv_today           TYPE sy-datum,
      gv_runtime_start   TYPE sy-uzeit,
      gv_runtime_end     TYPE sy-uzeit.

TYPES: BEGIN OF ty_order,
         vbeln          TYPE vbak-vbeln,
         auart          TYPE vbak-auart,
         vkorg          TYPE vbak-vkorg,
         vtweg          TYPE vbak-vtweg,
         spart          TYPE vbak-spart,
         kunnr          TYPE vbak-kunnr,
         erdat          TYPE vbak-erdat,
         ernam          TYPE vbak-ernam,
         netwr          TYPE vbak-netwr,
         waerk          TYPE vbak-waerk,
         lifsk          TYPE vbak-lifsk,
         faksk          TYPE vbak-faksk,
         cmgst          TYPE vbak-cmgst,
         bstnk          TYPE vbak-bstnk,
         item_count     TYPE i,
         open_qty       TYPE vbap-kwmeng,
         confirmed_qty  TYPE vbep-bmeng,
         stock_qty      TYPE mard-labst,
         risk_score     TYPE i,
         risk_text      TYPE char80,
         proposed_block TYPE vbak-lifsk,
         action         TYPE char30,
         message        TYPE char255,
         changed_by_bdc TYPE abap_bool,
         credit_remote  TYPE char20,
       END OF ty_order.

TYPES: BEGIN OF ty_item,
         vbeln      TYPE vbap-vbeln,
         posnr      TYPE vbap-posnr,
         matnr      TYPE vbap-matnr,
         werks      TYPE vbap-werks,
         pstyv      TYPE vbap-pstyv,
         kwmeng     TYPE vbap-kwmeng,
         netwr      TYPE vbap-netwr,
         lgort      TYPE vbap-lgort,
         abgru      TYPE vbap-abgru,
         mvgr1      TYPE mvgr1,
         mtart      TYPE mara-mtart,
         matkl      TYPE mara-matkl,
         labst      TYPE mard-labst,
         reserved   TYPE mard-insme,
         finding    TYPE char100,
       END OF ty_item.

TYPES: BEGIN OF ty_customer,
         kunnr        TYPE kna1-kunnr,
         name1        TYPE kna1-name1,
         land1        TYPE kna1-land1,
         regio        TYPE kna1-regio,
         ktokd        TYPE kna1-ktokd,
         sperr        TYPE kna1-sperr,
         bukrs        TYPE knb1-bukrs,
         akont        TYPE knb1-akont,
         zterm        TYPE knb1-zterm,
         risk_class   TYPE char10,
         credit_limit TYPE p LENGTH 15 DECIMALS 2,
       END OF ty_customer.

TYPES: BEGIN OF ty_log,
         run_id     TYPE char32,
         datum      TYPE sy-datum,
         uzeit      TYPE sy-uzeit,
         uname      TYPE sy-uname,
         level      TYPE char10,
         object     TYPE char30,
         key_value  TYPE char50,
         message    TYPE char255,
       END OF ty_log.

DATA: gt_orders    TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY,
      gt_items     TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,
      gt_customers TYPE STANDARD TABLE OF ty_customer WITH DEFAULT KEY,
      gt_log       TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY,
      gt_fieldcat  TYPE slis_t_fieldcat_alv,
      gt_bdcdata   TYPE STANDARD TABLE OF bdcdata WITH DEFAULT KEY,
      gt_bdcmsg    TYPE STANDARD TABLE OF bdcmsgcoll WITH DEFAULT KEY.

DATA: gs_order    TYPE ty_order,
      gs_item     TYPE ty_item,
      gs_customer TYPE ty_customer,
      gs_log      TYPE ty_log,
      gs_bdcdata  TYPE bdcdata.

FIELD-SYMBOLS: <fs_order> TYPE ty_order,
               <fs_item>  TYPE ty_item,
               <fs_log>   TYPE ty_log.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE text-001.
SELECT-OPTIONS: s_vkorg FOR vbak-vkorg DEFAULT c_default_vkorg,
                s_vbeln FOR vbak-vbeln,
                s_kunnr FOR vbak-kunnr,
                s_erdat FOR vbak-erdat,
                s_matnr FOR vbap-matnr,
                s_werks FOR vbap-werks DEFAULT c_default_werks.
PARAMETERS: p_days   TYPE i DEFAULT 90,
            p_lim    TYPE i DEFAULT 5000,
            p_block  TYPE vbak-lifsk DEFAULT 'Z1',
            p_file   TYPE string DEFAULT c_local_path LOWER CASE.
SELECTION-SCREEN END OF BLOCK b01.

SELECTION-SCREEN BEGIN OF BLOCK b02 WITH FRAME TITLE text-002.
PARAMETERS: p_upd    AS CHECKBOX DEFAULT ' ',
            p_bdc    AS CHECKBOX DEFAULT 'X',
            p_rfc    AS CHECKBOX DEFAULT 'X',
            p_mail   AS CHECKBOX DEFAULT ' ',
            p_down   AS CHECKBOX DEFAULT 'X',
            p_alv    AS CHECKBOX DEFAULT 'X',
            p_trace  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b02.

INITIALIZATION.
  gv_today = sy-datum.
  gv_runtime_start = sy-uzeit.
  gv_repid = sy-repid.
  text-001 = 'Legacy order selection'.
  text-002 = 'Processing switches'.

AT SELECTION-SCREEN.
  PERFORM validate_selection.

START-OF-SELECTION.
  PERFORM authority_check.
  PERFORM initialize_run.
  PERFORM select_orders.
  PERFORM select_items.
  PERFORM enrich_customers.
  PERFORM enrich_materials_and_stock.
  PERFORM calculate_risk_scores.
  PERFORM remote_credit_check.
  PERFORM decide_actions.
  PERFORM process_actions.
  PERFORM persist_run_log.
  PERFORM download_result_file.
  PERFORM send_summary_mail.

END-OF-SELECTION.
  PERFORM build_fieldcatalog.
  PERFORM display_alv.
  PERFORM finalize_run.

FORM validate_selection.
  IF s_vkorg[] IS INITIAL.
    MESSAGE e001 WITH 'Sales organization is required'.
  ENDIF.
  IF p_lim IS INITIAL OR p_lim GT c_max_items.
    p_lim = 5000.
  ENDIF.
  IF p_days LT 0.
    MESSAGE e001 WITH 'Days cannot be negative'.
  ENDIF.
  IF p_file IS INITIAL.
    p_file = c_local_path.
  ENDIF.
ENDFORM.

FORM authority_check.
  AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
    ID 'VKORG' FIELD c_default_vkorg
    ID 'ACTVT' FIELD '03'.
  IF sy-subrc <> 0.
    PERFORM add_log USING 'ERROR' 'AUTH' sy-uname 'Missing display authorization for sales orders'.
    MESSAGE e001 WITH 'Missing sales order authorization'.
  ENDIF.
  IF p_upd = abap_true.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD c_default_vkorg
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      MESSAGE e001 WITH 'Update mode requires change authorization'.
    ENDIF.
  ENDIF.
ENDFORM.

FORM initialize_run.
  DATA lv_guid TYPE char32.
  CALL FUNCTION 'GUID_CREATE'
    IMPORTING
      ev_guid_32 = lv_guid.
  gv_file_name = p_file.
  CLEAR: gt_orders, gt_items, gt_customers, gt_log.
  PERFORM add_log USING 'INFO' 'RUN' lv_guid 'Started legacy order fulfillment audit'.
ENDFORM.

FORM select_orders.
  DATA lv_from_date TYPE sy-datum.
  lv_from_date = sy-datum - p_days.

  SELECT *
    FROM vbak
    INTO CORRESPONDING FIELDS OF TABLE gt_orders
    UP TO p_lim ROWS
    WHERE vbeln IN s_vbeln
      AND vkorg IN s_vkorg
      AND kunnr IN s_kunnr
      AND erdat GE lv_from_date
      AND erdat IN s_erdat
      AND auart IN ('OR','ZOR','TA','RE','ZEXP')
      AND vbtyp = 'C'.

  IF sy-subrc <> 0.
    PERFORM add_log USING 'WARN' 'VBAK' 'NONE' 'No orders found for selection'.
  ENDIF.

  SORT gt_orders BY vbeln.
  DELETE ADJACENT DUPLICATES FROM gt_orders COMPARING vbeln.
  DESCRIBE TABLE gt_orders LINES gv_line_count.
  PERFORM add_log USING 'INFO' 'VBAK' gv_line_count 'Orders selected from VBAK'.
ENDFORM.

FORM select_items.
  IF gt_orders IS INITIAL.
    EXIT.
  ENDIF.

  SELECT *
    FROM vbap
    INTO CORRESPONDING FIELDS OF TABLE gt_items
    FOR ALL ENTRIES IN gt_orders
    WHERE vbeln = gt_orders-vbeln
      AND matnr IN s_matnr
      AND werks IN s_werks.

  LOOP AT gt_items ASSIGNING <fs_item>.
    SELECT SINGLE mtart matkl
      FROM mara
      INTO (<fs_item>-mtart, <fs_item>-matkl)
      WHERE matnr = <fs_item>-matnr.
    IF sy-subrc <> 0.
      <fs_item>-finding = 'Material master missing'.
    ENDIF.
  ENDLOOP.

  PERFORM add_log USING 'INFO' 'VBAP' sy-dbcnt 'Items selected and enriched'.
ENDFORM.

FORM enrich_customers.
  DATA lt_kunnr TYPE STANDARD TABLE OF kna1-kunnr.
  DATA lv_kunnr TYPE kna1-kunnr.

  LOOP AT gt_orders INTO gs_order.
    lv_kunnr = gs_order-kunnr.
    APPEND lv_kunnr TO lt_kunnr.
  ENDLOOP.
  SORT lt_kunnr.
  DELETE ADJACENT DUPLICATES FROM lt_kunnr.

  LOOP AT lt_kunnr INTO lv_kunnr.
    CLEAR gs_customer.
    SELECT SINGLE kunnr name1 land1 regio ktokd sperr
      FROM kna1
      INTO CORRESPONDING FIELDS OF gs_customer
      WHERE kunnr = lv_kunnr.
    SELECT SINGLE bukrs akont zterm
      FROM knb1
      INTO CORRESPONDING FIELDS OF gs_customer
      WHERE kunnr = lv_kunnr
        AND bukrs = '1000'.
    PERFORM derive_customer_risk CHANGING gs_customer.
    APPEND gs_customer TO gt_customers.
  ENDLOOP.
ENDFORM.

FORM derive_customer_risk CHANGING cs_customer TYPE ty_customer.
  IF cs_customer-sperr = 'X'.
    cs_customer-risk_class = 'BLOCKED'.
    cs_customer-credit_limit = 0.
  ELSEIF cs_customer-land1 <> 'DE' AND cs_customer-land1 <> 'AT' AND cs_customer-land1 <> 'CH'.
    cs_customer-risk_class = 'EXPORT'.
    cs_customer-credit_limit = '25000.00'.
  ELSEIF cs_customer-ktokd = 'ZINT'.
    cs_customer-risk_class = 'INTERNAL'.
    cs_customer-credit_limit = '999999.99'.
  ELSE.
    cs_customer-risk_class = 'NORMAL'.
    cs_customer-credit_limit = '100000.00'.
  ENDIF.
ENDFORM.

FORM enrich_materials_and_stock.
  LOOP AT gt_items ASSIGNING <fs_item>.
    SELECT SINGLE labst insme
      FROM mard
      INTO (<fs_item>-labst, <fs_item>-reserved)
      WHERE matnr = <fs_item>-matnr
        AND werks = <fs_item>-werks
        AND lgort = <fs_item>-lgort.
    IF sy-subrc <> 0.
      <fs_item>-finding = 'No plant/storage stock found'.
    ELSEIF <fs_item>-labst < <fs_item>-kwmeng.
      <fs_item>-finding = 'Available stock below ordered quantity'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM calculate_risk_scores.
  DATA lv_item_count TYPE i.
  DATA lv_open_qty TYPE vbap-kwmeng.
  DATA lv_stock_qty TYPE mard-labst.
  DATA lv_customer_risk TYPE char10.
  DATA lv_days_old TYPE i.

  LOOP AT gt_orders ASSIGNING <fs_order>.
    CLEAR: lv_item_count, lv_open_qty, lv_stock_qty, lv_customer_risk.

    LOOP AT gt_items INTO gs_item WHERE vbeln = <fs_order>-vbeln.
      ADD 1 TO lv_item_count.
      lv_open_qty = lv_open_qty + gs_item-kwmeng.
      lv_stock_qty = lv_stock_qty + gs_item-labst.
      IF gs_item-finding IS NOT INITIAL.
        <fs_order>-risk_score = <fs_order>-risk_score + 10.
      ENDIF.
    ENDLOOP.

    READ TABLE gt_customers INTO gs_customer WITH KEY kunnr = <fs_order>-kunnr.
    IF sy-subrc = 0.
      lv_customer_risk = gs_customer-risk_class.
      IF gs_customer-risk_class = 'BLOCKED'.
        <fs_order>-risk_score = <fs_order>-risk_score + 40.
      ELSEIF gs_customer-risk_class = 'EXPORT'.
        <fs_order>-risk_score = <fs_order>-risk_score + 15.
      ENDIF.
      IF <fs_order>-netwr > gs_customer-credit_limit.
        <fs_order>-risk_score = <fs_order>-risk_score + 35.
      ENDIF.
    ELSE.
      <fs_order>-risk_score = <fs_order>-risk_score + 20.
    ENDIF.

    lv_days_old = sy-datum - <fs_order>-erdat.
    IF lv_days_old GT 180.
      <fs_order>-risk_score = <fs_order>-risk_score + 20.
    ELSEIF lv_days_old GT 90.
      <fs_order>-risk_score = <fs_order>-risk_score + 10.
    ENDIF.

    IF <fs_order>-lifsk IS NOT INITIAL OR <fs_order>-faksk IS NOT INITIAL.
      <fs_order>-risk_score = <fs_order>-risk_score + 10.
    ENDIF.

    IF lv_stock_qty < lv_open_qty.
      <fs_order>-risk_score = <fs_order>-risk_score + 15.
    ENDIF.

    <fs_order>-item_count = lv_item_count.
    <fs_order>-open_qty = lv_open_qty.
    <fs_order>-stock_qty = lv_stock_qty.

    IF <fs_order>-risk_score GE c_critical_score.
      <fs_order>-risk_text = 'Critical: customer, stock or credit exception'.
    ELSEIF <fs_order>-risk_score GE c_medium_score.
      <fs_order>-risk_text = 'Medium: manual review recommended'.
    ELSE.
      <fs_order>-risk_text = 'Low: no immediate action'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM remote_credit_check.
  CHECK p_rfc = abap_true.
  LOOP AT gt_orders ASSIGNING <fs_order>.
    CALL FUNCTION 'Z_CREDIT_EXPOSURE_READ'
      DESTINATION c_destination
      EXPORTING
        iv_kunnr = <fs_order>-kunnr
        iv_vkorg = <fs_order>-vkorg
      IMPORTING
        ev_status = <fs_order>-credit_remote
      EXCEPTIONS
        system_failure        = 1 MESSAGE <fs_order>-message
        communication_failure = 2 MESSAGE <fs_order>-message
        OTHERS                = 3.
    IF sy-subrc <> 0.
      <fs_order>-credit_remote = 'RFC_FAILED'.
      <fs_order>-risk_score = <fs_order>-risk_score + 10.
      PERFORM add_log USING 'WARN' 'RFC' <fs_order>-vbeln <fs_order>-message.
    ELSEIF <fs_order>-credit_remote = 'RED'.
      <fs_order>-risk_score = <fs_order>-risk_score + 25.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM decide_actions.
  LOOP AT gt_orders ASSIGNING <fs_order>.
    IF <fs_order>-risk_score GE c_critical_score.
      <fs_order>-action = 'SET_DELIVERY_BLOCK'.
      <fs_order>-proposed_block = p_block.
    ELSEIF <fs_order>-risk_score GE c_medium_score.
      <fs_order>-action = 'CREATE_REVIEW_TASK'.
    ELSE.
      <fs_order>-action = 'NO_ACTION'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM process_actions.
  LOOP AT gt_orders ASSIGNING <fs_order>.
    CASE <fs_order>-action.
      WHEN 'SET_DELIVERY_BLOCK'.
        IF p_upd = abap_true AND p_bdc = abap_true.
          PERFORM change_sales_order_bdc USING <fs_order>-vbeln <fs_order>-proposed_block CHANGING <fs_order>-message.
        ELSE.
          <fs_order>-message = 'Simulation: delivery block would be set'.
        ENDIF.
      WHEN 'CREATE_REVIEW_TASK'.
        PERFORM create_legacy_review_task USING <fs_order>.
      WHEN OTHERS.
        <fs_order>-message = 'No action required'.
    ENDCASE.
    PERFORM update_legacy_log_task USING <fs_order>.
  ENDLOOP.
ENDFORM.

FORM change_sales_order_bdc USING iv_vbeln TYPE vbak-vbeln
                                  iv_block TYPE vbak-lifsk
                            CHANGING cv_message TYPE char255.
  REFRESH: gt_bdcdata, gt_bdcmsg.
  PERFORM bdc_dynpro USING 'SAPMV45A' '0102'.
  PERFORM bdc_field  USING 'BDC_CURSOR' 'VBAK-VBELN'.
  PERFORM bdc_field  USING 'BDC_OKCODE' '/00'.
  PERFORM bdc_field  USING 'VBAK-VBELN' iv_vbeln.
  PERFORM bdc_dynpro USING 'SAPMV45A' '4001'.
  PERFORM bdc_field  USING 'BDC_OKCODE' '=KKAU'.
  PERFORM bdc_field  USING 'VBAK-LIFSK' iv_block.
  PERFORM bdc_dynpro USING 'SAPMV45A' '4001'.
  PERFORM bdc_field  USING 'BDC_OKCODE' '=SICH'.

  CALL TRANSACTION c_tcode_va02 USING gt_bdcdata
    MODE 'N'
    UPDATE 'S'
    MESSAGES INTO gt_bdcmsg.

  IF sy-subrc = 0.
    cv_message = 'Delivery block changed by BDC'.
    ADD 1 TO gv_success_counter.
  ELSE.
    cv_message = 'BDC failed for sales order'.
    ADD 1 TO gv_error_counter.
    PERFORM add_log USING 'ERROR' 'BDC' iv_vbeln cv_message.
  ENDIF.
ENDFORM.

FORM bdc_dynpro USING iv_program TYPE bdc_prog iv_dynpro TYPE bdc_dynr.
  CLEAR gs_bdcdata.
  gs_bdcdata-program  = iv_program.
  gs_bdcdata-dynpro   = iv_dynpro.
  gs_bdcdata-dynbegin = 'X'.
  APPEND gs_bdcdata TO gt_bdcdata.
ENDFORM.

FORM bdc_field USING iv_fnam TYPE fnam_____4 iv_fval TYPE any.
  CLEAR gs_bdcdata.
  gs_bdcdata-fnam = iv_fnam.
  gs_bdcdata-fval = iv_fval.
  APPEND gs_bdcdata TO gt_bdcdata.
ENDFORM.

FORM create_legacy_review_task USING is_order TYPE ty_order.
  DATA lv_text TYPE char255.
  CONCATENATE 'Review order' is_order-vbeln 'risk' is_order-risk_score INTO lv_text SEPARATED BY space.
  INSERT zsd_ord_risk FROM @VALUE #( mandt = sy-mandt vbeln = is_order-vbeln risk_score = is_order-risk_score risk_text = is_order-risk_text erdat = sy-datum ernam = sy-uname ).
  IF sy-subrc <> 0.
    PERFORM add_log USING 'WARN' 'ZSD_ORD_RISK' is_order-vbeln 'Could not insert risk review task'.
  ELSE.
    PERFORM add_log USING 'INFO' 'ZSD_ORD_RISK' is_order-vbeln lv_text.
  ENDIF.
ENDFORM.

FORM update_legacy_log_task USING is_order TYPE ty_order.
  CALL FUNCTION 'Z_SD_LEGACY_LOG_WRITE'
    IN UPDATE TASK
    EXPORTING
      iv_vbeln = is_order-vbeln
      iv_score = is_order-risk_score
      iv_text  = is_order-risk_text
      iv_user  = sy-uname.
  ADD 1 TO gv_commit_counter.
  IF gv_commit_counter MOD 50 = 0.
    COMMIT WORK.
  ENDIF.
ENDFORM.

FORM persist_run_log.
  LOOP AT gt_log INTO gs_log.
    INSERT zsd_legacy_log FROM @VALUE #( mandt = sy-mandt datum = gs_log-datum uzeit = gs_log-uzeit uname = gs_log-uname object = gs_log-object key_value = gs_log-key_value message = gs_log-message ).
  ENDLOOP.
  COMMIT WORK AND WAIT.
ENDFORM.

FORM download_result_file.
  CHECK p_down = abap_true.
  DATA lt_csv TYPE STANDARD TABLE OF string.
  DATA lv_line TYPE string.
  APPEND 'VBELN;KUNNR;VKORG;NETWR;WAERK;RISK_SCORE;ACTION;MESSAGE' TO lt_csv.
  LOOP AT gt_orders INTO gs_order.
    CONCATENATE gs_order-vbeln gs_order-kunnr gs_order-vkorg gs_order-netwr gs_order-waerk gs_order-risk_score gs_order-action gs_order-message INTO lv_line SEPARATED BY ';'.
    APPEND lv_line TO lt_csv.
  ENDLOOP.
  CALL FUNCTION 'GUI_DOWNLOAD'
    EXPORTING
      filename = gv_file_name
      filetype = 'ASC'
    TABLES
      data_tab = lt_csv
    EXCEPTIONS
      file_write_error = 1
      no_batch = 2
      gui_refuse_filetransfer = 3
      invalid_type = 4
      no_authority = 5
      unknown_error = 6
      OTHERS = 7.
  IF sy-subrc <> 0.
    PERFORM add_log USING 'WARN' 'GUI_DOWNLOAD' gv_file_name 'Download failed or not available in background'.
  ENDIF.
ENDFORM.

FORM send_summary_mail.
  CHECK p_mail = abap_true.
  DATA lt_objtxt TYPE STANDARD TABLE OF solisti1.
  DATA ls_objtxt TYPE solisti1.
  DATA lt_reclist TYPE STANDARD TABLE OF somlreci1.
  DATA ls_reclist TYPE somlreci1.
  DATA ls_docdata TYPE sodocchgi1.
  ls_docdata-obj_name = 'LEGACY_AUDIT'.
  ls_docdata-obj_descr = 'Legacy order audit result'.
  CONCATENATE 'Processed orders:' gv_line_count INTO ls_objtxt-line SEPARATED BY space.
  APPEND ls_objtxt TO lt_objtxt.
  CONCATENATE 'Errors:' gv_error_counter 'Warnings:' gv_warning_counter INTO ls_objtxt-line SEPARATED BY space.
  APPEND ls_objtxt TO lt_objtxt.
  ls_reclist-receiver = c_mail_sender.
  ls_reclist-rec_type = 'U'.
  APPEND ls_reclist TO lt_reclist.
  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data = ls_docdata
      document_type = 'RAW'
      put_in_outbox = 'X'
    TABLES
      object_content = lt_objtxt
      receivers = lt_reclist
    EXCEPTIONS
      too_many_receivers = 1
      document_not_sent = 2
      document_type_not_exist = 3
      operation_no_authorization = 4
      parameter_error = 5
      x_error = 6
      enqueue_error = 7
      OTHERS = 8.
ENDFORM.

FORM build_fieldcatalog.
  PERFORM append_fieldcat USING 'VBELN' 'Sales Order' 12.
  PERFORM append_fieldcat USING 'KUNNR' 'Customer' 12.
  PERFORM append_fieldcat USING 'VKORG' 'Sales Org' 8.
  PERFORM append_fieldcat USING 'NETWR' 'Net Value' 15.
  PERFORM append_fieldcat USING 'RISK_SCORE' 'Risk' 8.
  PERFORM append_fieldcat USING 'RISK_TEXT' 'Risk Text' 40.
  PERFORM append_fieldcat USING 'ACTION' 'Action' 25.
  PERFORM append_fieldcat USING 'MESSAGE' 'Message' 60.
ENDFORM.

FORM append_fieldcat USING iv_field TYPE slis_fieldname iv_text TYPE char40 iv_len TYPE i.
  DATA ls_fieldcat TYPE slis_fieldcat_alv.
  CLEAR ls_fieldcat.
  ls_fieldcat-fieldname = iv_field.
  ls_fieldcat-seltext_m = iv_text.
  ls_fieldcat-outputlen = iv_len.
  APPEND ls_fieldcat TO gt_fieldcat.
ENDFORM.

FORM display_alv.
  CHECK p_alv = abap_true.
  gv_layout-zebra = 'X'.
  gv_layout-colwidth_optimize = 'X'.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = gv_repid
      is_layout          = gv_layout
      it_fieldcat        = gt_fieldcat
    TABLES
      t_outtab           = gt_orders
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.
ENDFORM.

FORM add_log USING iv_level TYPE char10 iv_object TYPE char30 iv_key TYPE any iv_message TYPE char255.
  CLEAR gs_log.
  gs_log-datum = sy-datum.
  gs_log-uzeit = sy-uzeit.
  gs_log-uname = sy-uname.
  gs_log-level = iv_level.
  gs_log-object = iv_object.
  gs_log-key_value = iv_key.
  gs_log-message = iv_message.
  APPEND gs_log TO gt_log.
  IF iv_level = 'WARN'.
    ADD 1 TO gv_warning_counter.
  ELSEIF iv_level = 'ERROR'.
    ADD 1 TO gv_error_counter.
  ENDIF.
ENDFORM.

FORM finalize_run.
  gv_runtime_end = sy-uzeit.
  IF gv_commit_counter GT 0.
    COMMIT WORK AND WAIT.
  ENDIF.
  PERFORM add_log USING 'INFO' 'RUN' sy-repid 'Finished legacy order fulfillment audit'.
ENDFORM.

FORM legacy_native_sql_example.
  DATA lv_count TYPE i.
  EXEC SQL.
    SELECT COUNT(*) INTO :lv_count FROM VBAK WHERE MANDT = :sy-mandt
  ENDEXEC.
  IF lv_count GT 0.
    PERFORM add_log USING 'INFO' 'NATIVE_SQL' lv_count 'Native SQL count executed'.
  ENDIF.
ENDFORM.

FORM legacy_submit_example USING iv_vbeln TYPE vbak-vbeln.
  SUBMIT rv_order_flow_information
    WITH p_vbeln = iv_vbeln
    AND RETURN.
ENDFORM.

FORM legacy_call_screen_example.
  CALL SCREEN 9000 STARTING AT 10 5 ENDING AT 120 25.
ENDFORM.

MODULE status_9000 OUTPUT.
  SET PF-STATUS 'MAIN'.
  SET TITLEBAR 'LEGACY'.
ENDMODULE.

MODULE user_command_9000 INPUT.
  CASE sy-ucomm.
    WHEN 'BACK' OR 'CANC' OR 'EXIT'.
      LEAVE TO SCREEN 0.
    WHEN OTHERS.
      MESSAGE s001 WITH 'Legacy dynpro command ignored'.
  ENDCASE.
ENDMODULE.

FORM legacy_business_rule_001 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '001'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_001) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_001 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_002 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '002'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_002) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_002 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_003 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '003'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_003) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_003 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_004 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '004'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_004) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_004 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_005 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '005'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_005) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_005 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_006 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '006'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_006) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_006 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_007 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '007'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_007) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_007 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_008 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '008'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_008) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_008 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_009 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '009'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_009) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_009 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_010 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '010'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_010) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_010 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_011 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '011'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_011) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_011 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_012 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '012'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_012) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_012 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_013 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '013'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_013) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_013 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.

FORM legacy_business_rule_014 USING is_order TYPE ty_order CHANGING cv_score TYPE i cv_note TYPE char100.
  DATA lv_rule_id TYPE char10 VALUE '014'.
  DATA lv_amount TYPE p LENGTH 15 DECIMALS 2.
  lv_amount = is_order-netwr.
  IF is_order-auart = 'ZOR' AND is_order-vkorg = c_default_vkorg.
    cv_score = cv_score + 1.
    CONCATENATE 'Rule' lv_rule_id 'custom order type detected' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF lv_amount GT 100000 AND is_order-waerk <> 'EUR'.
    cv_score = cv_score + 2.
    CONCATENATE cv_note 'foreign high value' INTO cv_note SEPARATED BY space.
  ENDIF.
  IF is_order-bstnk CP 'TEST*' OR is_order-bstnk CP 'DUMMY*'.
    cv_score = cv_score + 3.
    CONCATENATE cv_note 'suspicious purchase reference' INTO cv_note SEPARATED BY space.
  ENDIF.
  SELECT SINGLE ernam FROM vbak INTO @DATA(lv_ernam_014) WHERE vbeln = @is_order-vbeln.
  IF sy-subrc = 0 AND lv_ernam_014 = 'DDIC'.
    cv_score = cv_score + 5.
  ENDIF.
ENDFORM.
* -------------------------------------------------------------------
* End marker: exact 1000 LOC variant for Clean-Core platform tests.
* The scenario intentionally contains enterprise legacy patterns.
* Expected findings: direct table access, RFC, BDC, update task, GUI.
* Expected findings: dynpro module, native SQL, classic ALV, hardcoding.
* Use this object as synthetic input only, not for productive SAP import.
* -------------------------------------------------------------------
