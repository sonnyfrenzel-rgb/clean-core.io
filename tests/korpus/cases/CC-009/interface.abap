INTERFACE zif_cc_route PUBLIC.
  INTERFACES if_badi_interface.
  METHODS determine IMPORTING iv_amount TYPE p
                    CHANGING cv_route TYPE string.
ENDINTERFACE.
