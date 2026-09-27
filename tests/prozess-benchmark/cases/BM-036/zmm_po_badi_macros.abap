*----------------------------------------------------------------------*
* Include ZMM_PO_BADI_MACROS
* Makros fuer Meldungen im Bestell-BAdI (ME_PROCESS_PO_CUST)
* Nutzt die Standard-Makros aus MM_MESSAGES_MAC.
*----------------------------------------------------------------------*
INCLUDE mm_messages_mac.

* Fehler: Meldung erzwingen und Objekt ungueltig setzen
DEFINE mac_po_error.
  mmpur_message_forced 'E' 'ZMM' &1 &2 &3 space space.
  &4->invalidate( ).
END-OF-DEFINITION.

* Warnung: nur Meldung
DEFINE mac_po_warning.
  mmpur_message_forced 'W' 'ZMM' &1 &2 &3 space space.
END-OF-DEFINITION.

* Kontext fuer Meldungen am Positionsobjekt setzen
DEFINE mac_po_context_item.
  mmpur_business_obj_id &1.
END-OF-DEFINITION.

CONSTANTS: gc_bsart_normal TYPE esart VALUE 'NB',
           gc_bsart_zusatz TYPE esart VALUE 'ZNB',
           gc_knttp_kostl  TYPE knttp VALUE 'K',
           gc_warn_pct     TYPE p LENGTH 5 DECIMALS 2 VALUE '10.00',
           gc_err_pct      TYPE p LENGTH 5 DECIMALS 2 VALUE '25.00',
           gc_wf_limit     TYPE netwr VALUE '50000.00'.
