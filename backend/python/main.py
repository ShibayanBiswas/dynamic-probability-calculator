from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="SP Dashboard Python Analytics", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AggType = Literal["sum", "count", "avg", "min", "max"]


class PivotRequest(BaseModel):
    data: list[dict[str, Any]]
    rows: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    values: list[str] = Field(min_length=1)
    agg: AggType = "sum"


def _agg_func(agg: AggType):
    mapping = {
        "sum": "sum",
        "count": "count",
        "avg": "mean",
        "min": "min",
        "max": "max",
    }
    return mapping[agg]


def _prepare_pivot_frame(df: pd.DataFrame, value_field: str) -> pd.DataFrame:
    frame = df.copy()
    if value_field not in frame.columns:
        frame[value_field] = 1.0
    else:
        frame[value_field] = pd.to_numeric(frame[value_field], errors="coerce").fillna(0.0)
    frame[value_field] = frame[value_field].astype(float)
    return frame


@app.exception_handler(Exception)
async def handle_unhandled_exception(_request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=422,
        content={"error": str(exc), "engine": "python"},
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "python-analytics"}


@app.post("/pivot")
def pivot_table(req: PivotRequest):
    try:
        df = _prepare_pivot_frame(pd.DataFrame(req.data), req.values[0])
        value_field = req.values[0]

        for col in df.columns:
            if col == value_field:
                continue
            if df[col].dtype == object:
                numeric = pd.to_numeric(df[col], errors="coerce")
                if numeric.notna().any() and numeric.notna().sum() > len(df) * 0.5:
                    df[col] = numeric

        index = req.rows if req.rows else [None]
        columns = req.columns if req.columns else [None]

        if index == [None]:
            index = []
        if columns == [None]:
            columns = []

        if not index and not columns:
            total = float(pd.to_numeric(df[value_field], errors="coerce").fillna(0).agg(_agg_func(req.agg)))
            return {
                "rowKeys": ["Total"],
                "colKeys": ["Value"],
                "matrix": [[total]],
                "rowTotals": [total],
                "colTotals": [total],
                "grandTotal": total,
                "engine": "python",
            }

        pt = pd.pivot_table(
            df,
            index=index if index else None,
            columns=columns if columns else None,
            values=value_field,
            aggfunc=_agg_func(req.agg),
            fill_value=0.0,
            margins=True,
            margins_name="Total",
        )

        if isinstance(pt, pd.Series):
            pt = pt.to_frame()

        row_labels = [str(r) for r in pt.index.tolist()]
        col_labels = [str(c) for c in pt.columns.tolist()]

        matrix = pt.iloc[:-1, :-1].values.tolist() if len(row_labels) > 1 and len(col_labels) > 1 else pt.values.tolist()
        row_totals = pt.iloc[:-1, -1].tolist() if "Total" in col_labels else pt.iloc[:, -1].tolist()
        col_totals = pt.iloc[-1, :-1].tolist() if "Total" in row_labels else []

        grand = float(pt.iloc[-1, -1]) if "Total" in row_labels and "Total" in col_labels else float(pt.values.sum())

        data_rows = row_labels[:-1] if row_labels and row_labels[-1] == "Total" else row_labels
        data_cols = col_labels[:-1] if col_labels and col_labels[-1] == "Total" else col_labels

        if index:
            row_keys = ["§".join(str(x) for x in (r if isinstance(r, tuple) else (r,))) for r in data_rows]
        else:
            row_keys = ["Total"]

        if columns:
            col_keys = ["§".join(str(x) for x in (c if isinstance(c, tuple) else (c,))) for c in data_cols]
        else:
            col_keys = ["Value"]

        clean_matrix = []
        for i, _ in enumerate(data_rows if index else [0]):
            row_vals = []
            for j, _ in enumerate(data_cols if columns else [0]):
                try:
                    row_vals.append(float(pt.iloc[i, j]))
                except Exception:
                    row_vals.append(0.0)
            clean_matrix.append(row_vals)

        return {
            "rowKeys": row_keys,
            "colKeys": col_keys,
            "matrix": clean_matrix,
            "rowTotals": [float(x) for x in row_totals[: len(data_rows)]],
            "colTotals": [float(x) for x in col_totals[: len(data_cols)]],
            "grandTotal": grand,
            "engine": "python",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
