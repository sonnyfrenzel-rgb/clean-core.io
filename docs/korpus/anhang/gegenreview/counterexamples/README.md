# Acht konstruierte Gegenbeispiele

Diese Dateien wurden **nicht** in einem SAP-System aktiviert oder ausgeführt. Sie sind Review- und Erweiterungsvorschläge, keine neu freigegebenen Ground-Truth-Fälle. Ursprungsfälle bleiben unverändert. `expectation.json` nennt pro Beispiel Aussage, Quelle und Grenze.

Die separat tatsächlich ausgeführten 15 Tests in `tools/test_countermodels.py` sind kleine Python-/SQLite-Gegenmodelle. Sie ersetzen diese ABAP-Aktivierung nicht. Insbesondere wird der SQL-Injektionsnachweis ausschließlich in einer lokalen In-Memory-SQLite-Datenbank mit Wegwerfdaten ausgeführt; kein SAP-System wird kontaktiert.
