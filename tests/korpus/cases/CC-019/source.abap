REPORT zcc_ref_019.
TYPES: BEGIN OF ty_request,
         amount TYPE p LENGTH 9 DECIMALS 2,
         currency TYPE c LENGTH 3,
       END OF ty_request.
DATA ls_request TYPE ty_request.
DATA lo_description TYPE REF TO cl_abap_structdescr.
START-OF-SELECTION.
  lo_description ?= cl_abap_typedescr=>describe_by_data( ls_request ).
  DATA(lt_components) = lo_description->get_components( ).
  LOOP AT lt_components INTO DATA(ls_component).
    WRITE / ls_component-name.
  ENDLOOP.
