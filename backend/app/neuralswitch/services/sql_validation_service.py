from __future__ import annotations

import re
from dataclasses import dataclass

from backend.app.security import RapidPrincipal

from ..guards.sql_guard import validate_select_only_sql
from .contracts import GeneratedSqlPlan
from .permissions_service import PermissionsService


@dataclass(frozen=True)
class SqlValidationConfig:
    max_sql_rows: int = 500


class SqlValidationService:
    def __init__(
        self,
        permissions_service: PermissionsService | None = None,
        config: SqlValidationConfig | None = None,
    ) -> None:
        self.permissions_service = permissions_service or PermissionsService()
        self.config = config or SqlValidationConfig()

    def validate(self, plan: GeneratedSqlPlan, principal: RapidPrincipal) -> GeneratedSqlPlan:
        del principal
        self.permissions_service.assert_table_allowed(plan.table_name)
        sql = validate_select_only_sql(plan.sql).rstrip().rstrip(";")
        if not re.search(r"\blimit\s+\d+\b", sql, flags=re.IGNORECASE):
            sql = f"{sql} LIMIT {self.config.max_sql_rows}"
        return plan.with_sql(sql)
