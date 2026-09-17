"""Lokale Gegenmodelle. KEIN ABAP-, SAP-, HANA- oder Produktengine-Lauf.

SQLite illustriert SQL-Textinterpretation an isolierten Wegwerfdaten.
Die reinen Python-Funktionen modellieren nur die explizit angegebenen
Bedingungen aus CC-023, CC-053 und CC-060. Keine Oracle-Freigabe.
"""
from decimal import Decimal
import sqlite3
import unittest


def database():
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE KNA1 (MANDT TEXT, KUNNR TEXT, NAME1 TEXT)')
    db.executemany('INSERT INTO KNA1 VALUES (?, ?, ?)', [
        ('100', '0000001000', 'Alpha'),
        ('100', '0000002000', 'Beta'),
        ('200', '0000001000', 'Gamma'),
    ])
    db.commit()
    return db


def unsafe_statement(name, key, client):
    # Gleiche Textkomposition wie CC-034; ausschließlich SQLite-Testdaten.
    return (f"UPDATE KNA1 SET NAME1 = '{name}' "
            f"WHERE MANDT = '{client}' AND KUNNR = '{key}'")


def route_from_name(name, amount):
    # CC-060 consumer: lv_name IS INITIAL, dann COND. Kein DB-Existenzmodell.
    if name == '':
        return 'UNKNOWN_CUSTOMER'
    return 'MANAGER_ROUTE' if Decimal(str(amount)) > Decimal('10000') else 'AUTO_ROUTE'


def apply_exit(auart, amount, old_block):
    # CC-053: CLEAR lv_block, NICHT CLEAR vbak-lifsk.
    candidate = '01' if auart == 'TA' and Decimal(str(amount)) > Decimal('20000') else ''
    return candidate if candidate else old_block


def exact_c10_match(input_text, stored_internal_key):
    # Nur Zeichenvergleich des eingegrenzten Modells, keine echte DDIC-Konvertierung.
    return input_text[:10].ljust(10) == stored_internal_key[:10].ljust(10)


class SQLCountermodels(unittest.TestCase):
    def setUp(self): self.db = database()
    def tearDown(self): self.db.close()

    def test_normal_text_updates_single_intended_row(self):
        cur = self.db.execute(unsafe_statement('Neu', '0000001000', '100'))
        self.assertEqual(cur.rowcount, 1)
        self.assertEqual(self.db.execute("SELECT NAME1 FROM KNA1 WHERE MANDT='200'").fetchone()[0], 'Gamma')

    def test_input_within_c35_can_remove_appended_scope_in_sqlite(self):
        payload = "X' WHERE 1=1 --"
        self.assertLessEqual(len(payload), 35)
        cur = self.db.execute(unsafe_statement(payload, '0000001000', '100'))
        self.assertEqual(cur.rowcount, 3)
        self.assertEqual(self.db.execute("SELECT NAME1 FROM KNA1 WHERE MANDT='200'").fetchone()[0], 'X')

    def test_bound_parameter_keeps_same_payload_as_data(self):
        payload = "X' WHERE 1=1 --"
        cur = self.db.execute('UPDATE KNA1 SET NAME1 = ? WHERE MANDT = ? AND KUNNR = ?',
                              (payload, '100', '0000001000'))
        self.assertEqual(cur.rowcount, 1)
        self.assertEqual(self.db.execute("SELECT NAME1 FROM KNA1 WHERE MANDT='200'").fetchone()[0], 'Gamma')

    def test_commit_does_not_prove_a_customer_matched(self):
        cur = self.db.execute('UPDATE KNA1 SET NAME1 = ? WHERE MANDT = ? AND KUNNR = ?',
                              ('Neu', '100', '9999999999'))
        self.assertEqual(cur.rowcount, 0)
        self.db.commit()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM KNA1 WHERE NAME1='Neu'").fetchone()[0], 0)


class KeyFormatCountermodels(unittest.TestCase):
    def test_unconverted_numeric_short_input_misses_canonical_numeric(self):
        self.assertFalse(exact_c10_match('1000', '0000001000'))
    def test_canonical_numeric_input_matches(self):
        self.assertTrue(exact_c10_match('0000001000', '0000001000'))
    def test_alphanumeric_key_can_match_without_zeroes(self):
        self.assertTrue(exact_c10_match('AB12', 'AB12      '))


class CustomerNameCountermodels(unittest.TestCase):
    def test_existing_customer_with_empty_name_has_unknown_route(self):
        # Vorbedingung existiert ist Metadatum des Modells, nicht von der Funktion geprüft.
        self.assertEqual(route_from_name('', 20000), 'UNKNOWN_CUSTOMER')
    def test_threshold_equal_not_manager(self):
        self.assertEqual(route_from_name('Alpha', 10000), 'AUTO_ROUTE')
    def test_threshold_above_is_manager(self):
        self.assertEqual(route_from_name('Alpha', '10000.01'), 'MANAGER_ROUTE')
    def test_name_guard_dominates_amount(self):
        self.assertEqual(route_from_name('', '1000000'), 'UNKNOWN_CUSTOMER')


class ExitStateCountermodels(unittest.TestCase):
    def test_negative_branch_keeps_prior_block(self):
        self.assertEqual(apply_exit('TA', 100, '02'), '02')
    def test_equal_threshold_keeps_prior_block(self):
        self.assertEqual(apply_exit('TA', 20000, '02'), '02')
    def test_above_threshold_sets_candidate(self):
        self.assertEqual(apply_exit('TA', '20000.01', '02'), '01')
    def test_other_order_type_does_not_clear(self):
        self.assertEqual(apply_exit('XX', 50000, '02'), '02')


if __name__ == '__main__':
    unittest.main(verbosity=2)
