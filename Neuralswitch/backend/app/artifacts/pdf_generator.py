from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from app.schemas.chat import ChartData, TableData


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_lines(title: str, table: TableData, chart: ChartData | None, answer: str | None) -> list[str]:
    lines = [title, ""]
    if answer:
        for paragraph in str(answer).splitlines():
            lines.extend(wrap(paragraph, width=92) or [""])
    lines.append("")
    lines.append(f"Rows: {len(table.rows):,} | Columns: {len(table.columns):,}")
    if chart:
        lines.append(f"Chart: {chart.type} | {chart.y} by {chart.x}")
    lines.append("")
    lines.append("Data Preview")
    header = " | ".join(str(column) for column in table.columns[:6])
    lines.extend(wrap(header, width=110) or [header])
    lines.append("-" * min(110, max(10, len(header))))
    for row in table.rows[:28]:
        text = " | ".join(str(value if value is not None else "") for value in row[:6])
        lines.extend(wrap(text, width=110) or [text])
    if len(table.rows) > 28:
        lines.append(f"... {len(table.rows) - 28:,} more row(s). Export Excel/CSV for full data.")
    return lines[:58]


def generate_pdf(path: Path, *, title: str, table: TableData, chart: ChartData | None, answer: str | None = None) -> None:
    lines = _pdf_lines(title, table, chart, answer)
    content_parts = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
    for index, line in enumerate(lines):
        prefix = "" if index == 0 else "T* "
        escaped = _escape_pdf_text(line)
        if index == 0:
            content_parts.append("/F1 16 Tf")
            content_parts.append(f"({escaped}) Tj")
            content_parts.append("/F1 10 Tf")
        else:
            content_parts.append(f"{prefix}({escaped}) Tj")
    content_parts.append("ET")
    stream = "\n".join(content_parts).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream")

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    path.write_bytes(bytes(output))
