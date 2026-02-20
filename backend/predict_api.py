from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


MODEL_DIR = os.path.abspath(
    os.getenv("ML_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "ml_models"))
)

FEATURE_KEYS: List[str] = [
    "plant_age_months",
    "number_of_plants",
    "fertilizer_type",
    "fertilizer_frequency",
    "pesticide_type",
    "pesticide_frequency",
    "pruning_interval_months",
    "shade_tree_present",
    "soil_ph",
    "avg_temp_c",
    "avg_rainfall_mm",
    "avg_humidity_pct",
    "pre_total_trees",
    "pre_yield_kg",
    "pre_grade_fine",
    "pre_grade_premium",
    "pre_grade_commercial",
    "previous_fine_pct",
    "previous_premium_pct",
    "previous_commercial_pct",
]

FREQ_MAP = {
    "never": 1.0,
    "rarely": 2.0,
    "sometimes": 3.0,
    "often": 4.0,
}

TYPE_MAP = {
    "organic": 1.0,
    "non-organic": 2.0,
    "non_organic": 2.0,
    "nonorganic": 2.0,
}

BOOL_MAP = {
    "yes": 1.0,
    "true": 1.0,
    "1": 1.0,
    "no": 0.0,
    "false": 0.0,
    "0": 0.0,
}


class PredictPayload(BaseModel):
    features: Union[List[Any], Dict[str, Any]]


class BatchSample(BaseModel):
    id: Optional[Union[str, int]] = None
    features: Union[List[Any], Dict[str, Any]]


class PredictBatchPayload(BaseModel):
    samples: List[BatchSample]


app = FastAPI(title="IKAPE Model API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

yield_model = joblib.load(os.path.join(MODEL_DIR, "trained_yield_model_RF.joblib"))
grade_fine_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_fine_grade_pct.joblib"))
grade_premium_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_premium_grade_pct.joblib"))
grade_commercial_model = joblib.load(
    os.path.join(MODEL_DIR, "trained_grade_model_commercial_grade_pct.joblib")
)

EXPECTED_FEATURE_COUNT = int(getattr(yield_model, "n_features_in_", len(FEATURE_KEYS)))
if len(FEATURE_KEYS) != EXPECTED_FEATURE_COUNT:
    raise RuntimeError(
        f"Feature map mismatch: model expects {EXPECTED_FEATURE_COUNT}, configured keys={len(FEATURE_KEYS)}"
    )


def _to_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float, np.number)):
        if np.isnan(value):
            return 0.0
        return float(value)

    text = str(value).strip().lower()
    if not text:
        return 0.0

    # Categorical mapping support.
    if text in FREQ_MAP:
        return FREQ_MAP[text]
    if text in TYPE_MAP:
        return TYPE_MAP[text]
    if text in BOOL_MAP:
        return BOOL_MAP[text]

    try:
        return float(text)
    except ValueError:
        return 0.0


def _normalize_features(features: Union[List[Any], Dict[str, Any]]) -> np.ndarray:
    if isinstance(features, list):
        if len(features) != EXPECTED_FEATURE_COUNT:
            raise ValueError(
                f"Invalid feature length: expected {EXPECTED_FEATURE_COUNT}, received {len(features)}"
            )
        vector = np.array([_to_number(v) for v in features], dtype=float)
        return vector.reshape(1, -1)

    if isinstance(features, dict):
        vector = np.array([_to_number(features.get(key)) for key in FEATURE_KEYS], dtype=float)
        return vector.reshape(1, -1)

    raise ValueError("features must be either a list or an object")


def _normalize_grade_triplet(fine: float, premium: float, commercial: float) -> tuple[float, float, float]:
    values = np.array([fine, premium, commercial], dtype=float)
    values = np.clip(values, 0.0, None)

    total = float(values.sum())
    if total <= 0:
        return 0.0, 0.0, 0.0

    normalized = (values / total) * 100.0
    return tuple(float(v) for v in normalized.tolist())


def _predict_internal(features: Union[List[Any], Dict[str, Any]]) -> Dict[str, float]:
    vector = _normalize_features(features)

    yield_pred = float(yield_model.predict(vector)[0])
    fine_pred = float(grade_fine_model.predict(vector)[0])
    premium_pred = float(grade_premium_model.predict(vector)[0])
    commercial_pred = float(grade_commercial_model.predict(vector)[0])

    fine_pred, premium_pred, commercial_pred = _normalize_grade_triplet(
        fine_pred, premium_pred, commercial_pred
    )

    return {
        "yield_kg": round(max(yield_pred, 0.0), 3),
        "fine_grade_pct": round(fine_pred, 3),
        "premium_grade_pct": round(premium_pred, 3),
        "commercial_grade_pct": round(commercial_pred, 3),
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "model_dir": MODEL_DIR,
        "expected_features": EXPECTED_FEATURE_COUNT,
    }


@app.post("/predict")
def predict(payload: PredictPayload) -> Dict[str, float]:
    try:
        return _predict_internal(payload.features)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@app.post("/predict/batch")
def predict_batch(payload: PredictBatchPayload) -> Dict[str, Any]:
    if not payload.samples:
        return {"predictions": []}

    predictions = []
    for sample in payload.samples:
        try:
            result = _predict_internal(sample.features)
            predictions.append({"id": sample.id, "prediction": result})
        except Exception as exc:  # Keep batch resilient; return per-item errors.
            predictions.append({"id": sample.id, "error": str(exc)})

    return {"predictions": predictions}
