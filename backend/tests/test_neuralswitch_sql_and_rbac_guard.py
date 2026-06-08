from __future__ import annotations

import unittest

from fastapi import HTTPException

from backend.app.neuralswitch.guards.rbac_guard import apply_scope_filters
from backend.app.neuralswitch.guards.sql_guard import validate_select_only_sql
from backend.app.security import RapidPrincipal


class NeuralSwitchSqlAndRbacGuardTests(unittest.TestCase):
    def test_select_allowed(self) -> None:
        sql = "select * from revenue where fiscal_year = '2026-2027'"
        self.assertEqual(validate_select_only_sql(sql), sql)

    def test_delete_blocked(self) -> None:
        with self.assertRaises(HTTPException):
            validate_select_only_sql("delete from revenue")

    def test_drop_blocked(self) -> None:
        with self.assertRaises(HTTPException):
            validate_select_only_sql("select 1; drop table revenue")

    def test_semicolon_chaining_blocked(self) -> None:
        with self.assertRaises(HTTPException):
            validate_select_only_sql("select * from revenue; select * from users")

    def test_rbac_scope_applies_row_level_filters(self) -> None:
        principal = RapidPrincipal(
            user_id="u1",
            role="bdm",
            permissions=frozenset({"view_dashboard"}),
            scope={"bdms": ("Alice",), "geoHeads": ("US",)},
        )
        scoped = apply_scope_filters(
            principal=principal,
            filters={
                "bdms": ["Bob"],
                "geoHeads": ["US", "ROW"],
            },
        )
        self.assertEqual(scoped.filters["bdms"], ["Alice"])
        self.assertEqual(scoped.filters["geoHeads"], ["US"])

    def test_unauthorized_role_scope_is_constrained(self) -> None:
        principal = RapidPrincipal(
            user_id="u2",
            role="practice-head",
            permissions=frozenset({"view_dashboard"}),
            scope={"practiceHeads": ("Practice A",)},
        )
        scoped = apply_scope_filters(principal=principal, filters={"practiceHeads": ["Practice X"]})
        self.assertEqual(scoped.filters["practiceHeads"], ["Practice A"])


if __name__ == "__main__":
    unittest.main()
