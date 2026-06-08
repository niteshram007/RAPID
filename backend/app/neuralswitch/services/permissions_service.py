from __future__ import annotations

from fastapi import HTTPException


class PermissionsService:
    def __init__(self, allowed_tables: set[str] | None = None) -> None:
        self.allowed_tables = {table.lower() for table in (allowed_tables or {"trend_summary"})}

    def is_table_allowed(self, table_name: str) -> bool:
        return str(table_name or "").strip().lower() in self.allowed_tables

    def assert_table_allowed(self, table_name: str) -> None:
        if not self.is_table_allowed(table_name):
            raise HTTPException(status_code=403, detail=f"Table '{table_name}' is not available to NeuralSwitch.")
