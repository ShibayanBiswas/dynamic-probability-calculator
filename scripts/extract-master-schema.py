#!/usr/bin/env python3
"""Extract Primary-only schema from New Product Master_.xlsx into master-schema.json."""

from __future__ import annotations

import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "New Product Master_.xlsx"
OUT = ROOT / "lib" / "data" / "master-schema.json"

CATEGORY = "Primary"


def main() -> None:
    wb = openpyxl.load_workbook(MASTER, read_only=True, data_only=True)
    sheet = wb[CATEGORY]
    headers: list[str] = []
    for cell in sheet[2]:
        val = cell.value
        if val is not None and str(val).strip():
            headers.append(str(val).strip())

    payload = {
        "master": {
            "workbook": MASTER.name,
            "categorySheets": {
                CATEGORY: {
                    "headerRow": 2,
                    "columnCount": len(headers),
                    "columns": headers,
                }
            },
        },
        "dashboardWorkbooks": {
            "primaryValuation": {
                "actual": "Actual_Primary Structured Products Valuation - 31st May 26.xlsm",
                "working": "Primary Structured Products Valuation - 31st May 26.xlsm",
                "sheets": ["Valuation", "Product List", "Working"],
            },
            "primaryPayoff": {
                "actual": "Actual_Automated Primary SP Dashboard - 31 May 26.xlsm",
                "working": "Automated Primary SP Dashboard - 31 May 26.xlsm",
                "sheets": ["Non PP SP Details Input", "Product Search", "Non PP SP Details"],
            },
        },
        "laneMapping": {
            CATEGORY: {
                "lane": "primary",
                "valuationWorkbook": "Primary Structured Products Valuation",
                "payoffWorkbook": "Automated Primary SP Dashboard",
            }
        },
        "expectedCounts": {"Primary": {"products": 4533, "formulas": 4471}},
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
