from __future__ import annotations

import csv
from pathlib import Path

from app.schemas.chat import TableData


def generate_csv(path: Path, *, table: TableData) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow([str(column) for column in table.columns])
        for row in table.rows:
            writer.writerow(list(row))
