from __future__ import annotations

import html
import json
from pathlib import Path

from app.artifacts.table_utils import coerce_number
from app.schemas.chat import ChartData, TableData

COLORS = ["#024a70", "#4169e1", "#e43d46", "#0f766e", "#f59e0b", "#64748b", "#7c3aed", "#14b8a6"]


def build_chart_payload(table: TableData, chart: ChartData | None, *, title: str) -> dict:
    columns = [str(column) for column in table.columns]
    if not columns:
        return {"chart_type": "table", "title": title, "x_key": "", "series": [], "data": []}
    x_key = chart.x if chart and chart.x in columns else columns[0]
    numeric_columns = [
        column
        for column_index, column in enumerate(columns)
        if any(coerce_number(row[column_index] if column_index < len(row) else None) is not None for row in table.rows)
    ]
    y_key = chart.y if chart and chart.y in numeric_columns else (numeric_columns[0] if numeric_columns else columns[min(1, len(columns) - 1)])
    records = []
    for row in table.rows:
        record = {}
        for index, column in enumerate(columns):
            value = row[index] if index < len(row) else None
            number = coerce_number(value)
            record[column] = number if column in numeric_columns and number is not None else value
        records.append(record)
    return {
        "chart_type": (chart.type if chart else "bar"),
        "title": title,
        "x_key": x_key,
        "series": [{"key": key, "label": key} for key in numeric_columns[:4]],
        "y_key": y_key,
        "data": records,
    }


def _chart_points(table: TableData, chart: ChartData | None) -> tuple[str, str, list[tuple[str, float]]]:
    columns = [str(column) for column in table.columns]
    if not columns:
        return "", "", []
    x_key = chart.x if chart and chart.x in columns else columns[0]
    x_index = columns.index(x_key)
    numeric_candidates = [
        column
        for column_index, column in enumerate(columns)
        if any(coerce_number(row[column_index] if column_index < len(row) else None) is not None for row in table.rows)
    ]
    y_key = chart.y if chart and chart.y in numeric_candidates else (numeric_candidates[0] if numeric_candidates else columns[min(1, len(columns) - 1)])
    y_index = columns.index(y_key)
    points = []
    for row in table.rows[:12]:
        label = str(row[x_index] if x_index < len(row) else "Unassigned")
        value = coerce_number(row[y_index] if y_index < len(row) else None) or 0.0
        points.append((label, value))
    return x_key, y_key, points


def generate_chart_svg(path: Path, *, title: str, table: TableData, chart: ChartData | None) -> dict:
    x_key, y_key, points = _chart_points(table, chart)
    width = 920
    height = 520
    margin_left = 150
    margin_right = 48
    margin_top = 72
    margin_bottom = 86
    plot_width = width - margin_left - margin_right
    plot_height = height - margin_top - margin_bottom
    max_value = max([abs(value) for _, value in points] + [1.0])
    chart_type = str(chart.type if chart else "bar").lower()
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" rx="24" fill="#fffdee"/>',
        f'<text x="32" y="42" fill="#003323" font-family="Aptos, Arial" font-size="24" font-weight="800">{html.escape(title)}</text>',
        f'<text x="32" y="66" fill="#64748b" font-family="Aptos, Arial" font-size="13">{html.escape(y_key)} by {html.escape(x_key)}</text>',
    ]
    if chart_type == "pie":
        total = sum(max(0, value) for _, value in points) or 1.0
        cx, cy, radius = 320, 278, 145
        angle = -90.0
        for index, (label, value) in enumerate(points):
            positive = max(0, value)
            sweep = 360.0 * positive / total
            start = angle
            end = angle + sweep
            angle = end
            import math
            x1 = cx + radius * math.cos(math.radians(start))
            y1 = cy + radius * math.sin(math.radians(start))
            x2 = cx + radius * math.cos(math.radians(end))
            y2 = cy + radius * math.sin(math.radians(end))
            large = 1 if sweep > 180 else 0
            color = COLORS[index % len(COLORS)]
            parts.append(f'<path d="M {cx} {cy} L {x1:.2f} {y1:.2f} A {radius} {radius} 0 {large} 1 {x2:.2f} {y2:.2f} Z" fill="{color}" stroke="#fffdee" stroke-width="2"/>')
            legend_y = 130 + index * 28
            parts.append(f'<rect x="540" y="{legend_y - 12}" width="14" height="14" rx="4" fill="{color}"/>')
            parts.append(f'<text x="564" y="{legend_y}" fill="#003323" font-family="Aptos, Arial" font-size="13" font-weight="700">{html.escape(label[:34])}</text>')
            parts.append(f'<text x="820" y="{legend_y}" fill="#334155" font-family="Aptos, Arial" font-size="13" text-anchor="end">{positive / total * 100:.1f}%</text>')
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="62" fill="#fffdee" opacity="0.92"/>')
    elif chart_type == "line":
        coordinates = []
        divisor = max(len(points) - 1, 1)
        for index, (label, value) in enumerate(points):
            x = margin_left + (index / divisor) * plot_width
            y = margin_top + plot_height - (max(0, value) / max_value) * plot_height
            coordinates.append((x, y, label, value))
        path_data = " ".join(f'{"M" if index == 0 else "L"} {x:.1f} {y:.1f}' for index, (x, y, _, _) in enumerate(coordinates))
        parts.append(f'<path d="{path_data}" fill="none" stroke="#4169e1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
        for x, y, label, value in coordinates:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#e43d46" stroke="#fffdee" stroke-width="2"/>')
            parts.append(f'<text x="{x:.1f}" y="{height - 36}" fill="#334155" font-family="Aptos, Arial" font-size="11" text-anchor="middle">{html.escape(label[:9])}</text>')
    else:
        bar_gap = 10
        bar_height = max(16, min(34, (plot_height - bar_gap * max(0, len(points) - 1)) / max(len(points), 1)))
        for index, (label, value) in enumerate(points):
            y = margin_top + index * (bar_height + bar_gap)
            bar_width = (abs(value) / max_value) * plot_width
            color = COLORS[index % len(COLORS)]
            parts.append(f'<text x="{margin_left - 12}" y="{y + bar_height * 0.68:.1f}" fill="#003323" font-family="Aptos, Arial" font-size="13" font-weight="700" text-anchor="end">{html.escape(label[:20])}</text>')
            parts.append(f'<rect x="{margin_left}" y="{y}" width="{bar_width:.1f}" height="{bar_height:.1f}" rx="8" fill="{color}"/>')
            parts.append(f'<text x="{margin_left + bar_width + 8:.1f}" y="{y + bar_height * 0.68:.1f}" fill="#334155" font-family="Aptos, Arial" font-size="12" font-weight="700">{value:,.0f}</text>')
    parts.append('</svg>')
    path.write_text("\n".join(parts), encoding="utf-8")
    return build_chart_payload(table, chart, title=title)


def generate_chart_png(path: Path, *, title: str, table: TableData, chart: ChartData | None) -> dict:
    from PIL import Image, ImageDraw, ImageFont

    x_key, y_key, points = _chart_points(table, chart)
    width, height = 1200, 720
    image = Image.new("RGB", (width, height), "#fffdee")
    draw = ImageDraw.Draw(image)
    try:
        title_font = ImageFont.truetype("DejaVuSans-Bold.ttf", 30)
        label_font = ImageFont.truetype("DejaVuSans.ttf", 18)
        small_font = ImageFont.truetype("DejaVuSans.ttf", 15)
    except Exception:
        title_font = label_font = small_font = ImageFont.load_default()

    draw.rounded_rectangle((24, 24, width - 24, height - 24), radius=28, outline="#d7e3dd", width=2, fill="#fffdee")
    draw.text((54, 48), title[:90], fill="#003323", font=title_font)
    draw.text((54, 88), f"{y_key} by {x_key}", fill="#64748b", font=small_font)

    chart_type = str(chart.type if chart else "bar").lower()
    max_value = max([abs(value) for _, value in points] + [1.0])
    if chart_type == "pie":
        total = sum(max(0, value) for _, value in points) or 1.0
        box = (120, 150, 570, 600)
        start = -90
        for index, (label, value) in enumerate(points):
            sweep = 360 * max(0, value) / total
            color = COLORS[index % len(COLORS)]
            draw.pieslice(box, start=start, end=start + sweep, fill=color, outline="#fffdee", width=3)
            legend_y = 170 + index * 34
            draw.rounded_rectangle((650, legend_y - 16, 672, legend_y + 6), radius=5, fill=color)
            draw.text((686, legend_y - 18), label[:34], fill="#003323", font=label_font)
            draw.text((1030, legend_y - 18), f"{max(0, value) / total * 100:.1f}%", fill="#334155", font=label_font)
            start += sweep
    elif chart_type == "line":
        left, top, plot_width, plot_height = 100, 150, 1000, 440
        coordinates = []
        divisor = max(len(points) - 1, 1)
        for index, (label, value) in enumerate(points):
            x = left + (index / divisor) * plot_width
            y = top + plot_height - (max(0, value) / max_value) * plot_height
            coordinates.append((x, y, label, value))
        if len(coordinates) > 1:
            draw.line([(x, y) for x, y, _, _ in coordinates], fill="#4169e1", width=6, joint="curve")
        for x, y, label, _ in coordinates:
            draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill="#e43d46", outline="#fffdee", width=3)
            draw.text((x - 34, 620), label[:9], fill="#334155", font=small_font)
    else:
        left, top = 230, 145
        plot_width = 880
        bar_height = max(22, min(44, int(410 / max(len(points), 1))))
        gap = 12
        for index, (label, value) in enumerate(points):
            y = top + index * (bar_height + gap)
            bar_width = int((abs(value) / max_value) * plot_width)
            color = COLORS[index % len(COLORS)]
            draw.text((52, y + 8), label[:20], fill="#003323", font=label_font)
            draw.rounded_rectangle((left, y, left + bar_width, y + bar_height), radius=10, fill=color)
            draw.text((left + bar_width + 12, y + 8), f"{value:,.0f}", fill="#334155", font=small_font)

    image.save(path, format="PNG")
    return build_chart_payload(table, chart, title=title)
