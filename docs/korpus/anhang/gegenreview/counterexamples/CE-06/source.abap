REPORT zce_macro.
DEFINE two_outputs.
  WRITE / &1.
  WRITE / &2.
END-OF-DEFINITION.
START-OF-SELECTION.
  two_outputs 'A' 'B'.
