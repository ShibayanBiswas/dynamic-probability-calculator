#!/usr/bin/env python3
"""Document Primary-only dashboard workbook extraction targets (no overwrite of rich JSON)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "lib" / "data" / "reference-workbooks" / "extraction-summary.json"

SUMMARY = [
    {
        "workbook": "New Product Master_.xlsx",
        "output": "new-product-master.json",
        "sheetsExtracted": ["Primary"],
        "role": "Source of truth for Primary structured products",
    },
    {
        "workbook": "Primary Structured Products Valuation - 31st May 26.xlsm",
        "output": "primary-valuation.json",
        "sheetsExtracted": ["Valuation", "Product List", "Working"],
        "role": "Primary valuation engine reference",
    },
    {
        "workbook": "Automated Primary SP Dashboard - 31 May 26.xlsm",
        "output": "automated-primary-dashboard.json",
        "sheetsExtracted": ["Non PP SP Details Input", "Product Search", "Non PP SP Details"],
        "role": "Primary payoff dashboard reference",
    },
]

if __name__ == "__main__":
    OUT.write_text(json.dumps(SUMMARY, indent=2), encoding="utf-8")
    print(f"Updated {OUT}")
