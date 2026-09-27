FUNCTION z_fi_aa_create_and_post.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_HDR) TYPE  ZFIAA_S_HDR
*"     VALUE(IS_VAL) TYPE  ZFIAA_S_VAL
*"  EXPORTING
*"     VALUE(EV_ANLN1) TYPE  ANLN1
*"     VALUE(EV_ANLN2) TYPE  ANLN2
*"     VALUE(EV_BELNR) TYPE  BELNR_D
*"     VALUE(EV_SUBRC) TYPE  SYSUBRC
*"  TABLES
*"      ET_RETURN STRUCTURE  BAPIRET2
*"----------------------------------------------------------------------
* Anlage anlegen (BAPI_FIXEDASSET_CREATE1) und Zugang ohne Kreditor
* (BAPI_ASSET_ACQUISITION_POST, Gegenbuchung Verrechnungskonto) in
* einer LUW. Die Referenz ZFIAA_EXTREF wird in derselben LUW
* geschrieben, damit eine Dublette alles zuruecknimmt.
* 2019-11 TKL

  DATA: ls_key      TYPE bapi1022_key,
        ls_general  TYPE bapi1022_feglg001,
        ls_generalx TYPE bapi1022_feglg001x,
        ls_timedep  TYPE bapi1022_feglg003,
        ls_timedepx TYPE bapi1022_feglg003x,
        ls_postinf  TYPE bapi1022_feglg002,
        ls_postinfx TYPE bapi1022_feglg002x,
        ls_gen      TYPE bapifapo_gen_info,
        ls_add      TYPE bapifapo_add_info,
        ls_docref   TYPE bapifapo_docref,
        ls_return   TYPE bapiret2,
        ls_ref      TYPE zfiaa_extref.

  CLEAR: ev_anln1, ev_anln2, ev_belnr.
  ev_subrc = 0.

* --- Stammsatz ------------------------------------------------------
  ls_key-companycode      = is_hdr-bukrs.
  ls_general-assetclass   = is_hdr-anlkl.
  ls_general-descript     = is_hdr-txt50.
  ls_generalx-assetclass  = abap_true.
  ls_generalx-descript    = abap_true.
  ls_timedep-costcenter   = is_hdr-kostl.
  ls_timedepx-costcenter  = abap_true.
  ls_postinf-cap_date     = is_hdr-aktiv.
  ls_postinfx-cap_date    = abap_true.
* ls_general-invest_ord  = is_hdr-posid.  "PSP-Zuordnung - vom FB nie freigegeben

  CALL FUNCTION 'BAPI_FIXEDASSET_CREATE1'
    EXPORTING
      key                = ls_key
      generaldata        = ls_general
      generaldatax       = ls_generalx
      postinginformation = ls_postinf
      postinginformationx = ls_postinfx
      timedependentdata  = ls_timedep
      timedependentdatax = ls_timedepx
    IMPORTING
      asset              = ev_anln1
      subnumber          = ev_anln2
      return             = ls_return.
  IF ls_return-type CA 'EA'.
    APPEND ls_return TO et_return.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ev_subrc = 4.
    RETURN.
  ENDIF.

* --- Zugang, Bewegungsart 100, Gegenbuchung Verrechnungskonto ------
  ls_gen-username   = sy-uname.
  ls_gen-comp_code  = is_hdr-bukrs.
  ls_gen-assetmaino = ev_anln1.
  ls_gen-assetsubno = ev_anln2.
  ls_gen-assettrtyp = gc_bwasl_zugang.
  ls_gen-pstng_date = is_val-budat.
  ls_gen-doc_date   = is_val-budat.
  ls_gen-asval_date = is_val-bzdat.
  ls_gen-doc_type   = 'AA'.
  ls_add-item_text  = is_hdr-ext_ref.
  ls_add-amount     = is_val-anbtr.
  ls_add-currency   = is_val-waers.
  ls_add-quantity   = is_val-menge.
  ls_add-base_uom   = 'ST'.

  CALL FUNCTION 'BAPI_ASSET_ACQUISITION_POST'
    EXPORTING
      generalpostingdata = ls_gen
      furtherpostingdata = ls_add
    IMPORTING
      documentreference  = ls_docref
      return             = ls_return.
  IF ls_return-type CA 'EA'.
    APPEND ls_return TO et_return.
*   Rollback nimmt auch die eben angelegte Anlage zurueck
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ev_subrc = 8.
    RETURN.
  ENDIF.
  ev_belnr = ls_docref-obj_key(10).

* --- Referenz sichern (gleiche LUW) ---------------------------------
  ls_ref-ext_sys = is_hdr-ext_sys.
  ls_ref-ext_ref = is_hdr-ext_ref.
  ls_ref-bukrs   = is_hdr-bukrs.
  ls_ref-anln1   = ev_anln1.
  ls_ref-anln2   = ev_anln2.
  ls_ref-belnr   = ev_belnr.
  ls_ref-gjahr   = ls_gen-pstng_date(4).
  ls_ref-posid   = is_hdr-posid.
  ls_ref-erdat   = sy-datum.
  ls_ref-ernam   = sy-uname.
  INSERT zfiaa_extref FROM ls_ref.
  IF sy-subrc <> 0.
*   parallel dasselbe IDoc verarbeitet -> alles zuruecknehmen
    ls_return-type       = 'E'.
    ls_return-id         = 'ZFIAA'.
    ls_return-number     = '005'.
    ls_return-message_v1 = is_hdr-ext_ref.
    APPEND ls_return TO et_return.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ev_subrc = 12.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
*  COMMIT WORK AND WAIT.    "bis 2020

ENDFUNCTION.
