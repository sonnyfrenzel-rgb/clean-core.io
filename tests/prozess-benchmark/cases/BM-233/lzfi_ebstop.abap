FUNCTION-POOL zfi_ebs MESSAGE-ID zfi_ebs.
*----------------------------------------------------------------------*
* Funktionsgruppe ZFI_EBS - Nachbearbeitung Kontoauszug (FF_5/FEBAN)
* Zahlungseingaenge, die die Standard-Suchmuster nicht zuordnen,
* ueber die Rechnungsnummer im Verwendungszweck ausgleichen.
*----------------------------------------------------------------------*
DATA: gs_febko TYPE febko,
      gt_febep TYPE STANDARD TABLE OF febep,
      gs_febep TYPE febep,
      gt_log   TYPE STANDARD TABLE OF bapiret2.

TYPES: BEGIN OF gty_op,
         bukrs TYPE bukrs,
         kunnr TYPE kunnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         wrbtr TYPE wrbtr,
         waers TYPE waers,
       END OF gty_op.
TYPES gty_op_tab TYPE STANDARD TABLE OF gty_op WITH DEFAULT KEY.
