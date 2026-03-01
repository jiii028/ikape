from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.modeling import BEAN_SCREEN_CANONICAL, FEATURE_KEYS, FLOOD_RISK_CANONICAL, hash_identifier


MODEL_DIR = os.path.abspath(
    os.getenv("ML_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "ml_models"))
)
METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")
SYNTHETIC_ADMIN_DATA_PATH = os.path.abspath(
    os.getenv("SYNTHETIC_ADMIN_DATA_PATH", os.path.join(os.path.dirname(__file__), "..", "ml_models", "synthetic_admin_data.json"))
)
DATA_MODE = os.getenv("DATA_MODE", "").strip().lower()

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

EXPECTED_FEATURE_COUNT = len(FEATURE_KEYS)
MODEL_N_FEATURES = getattr(yield_model, "n_features_in_", None)
if MODEL_N_FEATURES is not None and int(MODEL_N_FEATURES) != EXPECTED_FEATURE_COUNT:
    raise RuntimeError(
        f"Feature map mismatch: model expects {int(MODEL_N_FEATURES)}, configured keys={EXPECTED_FEATURE_COUNT}"
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


def _feature_object(features: Union[List[Any], Dict[str, Any]]) -> Dict[str, Any]:
    if isinstance(features, list):
        if len(features) != len(FEATURE_KEYS):
            raise ValueError(
                f"Invalid feature length: expected {len(FEATURE_KEYS)}, received {len(features)}"
            )
        return {key: features[idx] for idx, key in enumerate(FEATURE_KEYS)}

    if isinstance(features, dict):
        return {key: features.get(key) for key in FEATURE_KEYS}

    raise ValueError("features must be either a list or an object")


def _normalize_categorical_value(key: str, value: Any) -> Any:
    if value is None:
        return np.nan
    text = str(value).strip().lower()
    if not text:
        return np.nan

    if key in ("fertilizer_frequency", "pesticide_frequency"):
        if text.startswith("often"):
            return "often"
        if text.startswith("sometimes"):
            return "sometimes"
        if text.startswith("rarely"):
            return "rarely"
        if text.startswith("never"):
            return "never"
        return np.nan

    if key in ("fertilizer_type", "pesticide_type"):
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in ("nonorganic", "non-organic"):
            return "non-organic"
        if normalized == "organic":
            return "organic"
        return np.nan

    if key == "shade_tree_present":
        if text in ("yes", "true", "1"):
            return "yes"
        if text in ("no", "false", "0"):
            return "no"
        return np.nan

    if key == "flood_risk_level":
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in FLOOD_RISK_CANONICAL:
            return normalized
        return np.nan

    if key == "bean_screen_size":
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in BEAN_SCREEN_CANONICAL:
            return normalized
        return np.nan

    return text


def _feature_dataframe(features: Dict[str, Any]) -> pd.DataFrame:
    row: Dict[str, Any] = {}
    for key in FEATURE_KEYS:
        value = features.get(key)
        if key in (
            "fertilizer_type",
            "fertilizer_frequency",
            "pesticide_type",
            "pesticide_frequency",
            "shade_tree_present",
            "flood_risk_level",
            "bean_screen_size",
        ):
            row[key] = _normalize_categorical_value(key, value)
        else:
            if key in ("farm_id", "cluster_id"):
                row[key] = hash_identifier(value)
                continue
            if value in ("", None):
                row[key] = np.nan
            else:
                try:
                    row[key] = float(value)
                except (TypeError, ValueError):
                    row[key] = np.nan
    return pd.DataFrame([row], columns=FEATURE_KEYS)


def _legacy_numeric_vector(features: Dict[str, Any]) -> np.ndarray:
    vector = np.array([_to_number(features.get(key)) for key in FEATURE_KEYS], dtype=float)
    return vector.reshape(1, -1)


def _normalize_grade_triplet(fine: float, premium: float, commercial: float) -> tuple[float, float, float]:
    values = np.array([fine, premium, commercial], dtype=float)
    values = np.clip(values, 0.0, None)

    total = float(values.sum())
    if total <= 0:
        return 0.0, 0.0, 0.0

    normalized = (values / total) * 100.0
    return tuple(float(v) for v in normalized.tolist())


def _derive_grade_labels(fine: float, premium: float, commercial: float) -> Dict[str, str]:
    grades = {
        "Fine": fine,
        "Premium": premium,
        "Commercial": commercial,
    }
    dominant_grade = max(grades, key=grades.get)
    dominant_value = grades[dominant_grade]

    if dominant_value >= 55:
        grade_label = f"{dominant_grade} Dominant"
    elif fine + premium >= 70:
        grade_label = "High-Quality Mix"
    elif commercial >= 45:
        grade_label = "Commercial Mix"
    else:
        grade_label = "Balanced Mix"

    return {
        "dominant_grade": dominant_grade,
        "grade_label": grade_label,
    }


def _predict_internal(features: Union[List[Any], Dict[str, Any]]) -> Dict[str, Any]:
    feature_obj = _feature_object(features)
    feature_frame = _feature_dataframe(feature_obj)

    try:
        yield_pred = float(yield_model.predict(feature_frame)[0])
        fine_pred = float(grade_fine_model.predict(feature_frame)[0])
        premium_pred = float(grade_premium_model.predict(feature_frame)[0])
        commercial_pred = float(grade_commercial_model.predict(feature_frame)[0])
    except Exception:
        # Backward compatibility for legacy numeric-only artifacts.
        vector = _legacy_numeric_vector(feature_obj)
        yield_pred = float(yield_model.predict(vector)[0])
        fine_pred = float(grade_fine_model.predict(vector)[0])
        premium_pred = float(grade_premium_model.predict(vector)[0])
        commercial_pred = float(grade_commercial_model.predict(vector)[0])

    fine_pred, premium_pred, commercial_pred = _normalize_grade_triplet(
        fine_pred, premium_pred, commercial_pred
    )
    labels = _derive_grade_labels(fine_pred, premium_pred, commercial_pred)

    return {
        "yield_kg": round(max(yield_pred, 0.0), 3),
        "fine_grade_pct": round(fine_pred, 3),
        "premium_grade_pct": round(premium_pred, 3),
        "commercial_grade_pct": round(commercial_pred, 3),
        "dominant_grade": labels["dominant_grade"],
        "grade_label": labels["grade_label"],
    }


def _load_metadata() -> Dict[str, Any]:
    if not os.path.exists(METADATA_PATH):
        return {}
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
            return {}
    except Exception:
        return {}


def _load_synthetic_admin_data() -> Dict[str, Any]:
    if not os.path.exists(SYNTHETIC_ADMIN_DATA_PATH):
        return {}
    try:
        with open(SYNTHETIC_ADMIN_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
            return {}
    except Exception:
        return {}


def _analytics_from_admin_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    users = payload.get("users") or []
    clusters = payload.get("clusters") or []
    harvest_records = payload.get("harvest_records") or []

    total_yield_kg = 0.0
    grade_fine = 0.0
    grade_premium = 0.0
    grade_commercial = 0.0
    for record in harvest_records:
        total_yield_kg += float(record.get("yield_kg") or 0.0)
        grade_fine += float(record.get("grade_fine") or 0.0)
        grade_premium += float(record.get("grade_premium") or 0.0)
        grade_commercial += float(record.get("grade_commercial") or 0.0)

    return {
        "total_farmers": len(users),
        "total_clusters": len(clusters),
        "total_yield_kg": round(total_yield_kg, 3),
        "charts": {
            "grade_mix": {
                "Fine": round(grade_fine, 3),
                "Premium": round(grade_premium, 3),
                "Commercial": round(grade_commercial, 3),
            }
        },
        "source": "synthetic",
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    metadata = _load_metadata()
    return {
        "ok": True,
        "model_dir": MODEL_DIR,
        "expected_features": EXPECTED_FEATURE_COUNT,
        "trained_at_utc": metadata.get("trained_at_utc"),
        "data_mode": DATA_MODE or "default",
        "synthetic_admin_data_path": SYNTHETIC_ADMIN_DATA_PATH,
    }


@app.get("/model/metadata")
def model_metadata() -> Dict[str, Any]:
    metadata = _load_metadata()
    if not metadata:
        return {
            "available": False,
            "message": "No model metadata found. Train models with backend/train_models.py.",
        }
    return {
        "available": True,
        "metadata": metadata,
    }


@app.get("/analytics/overview")
def analytics_overview() -> Dict[str, Any]:
    if DATA_MODE == "synthetic":
        synthetic_payload = _load_synthetic_admin_data()
        if synthetic_payload:
            return _analytics_from_admin_data(synthetic_payload)

    # Stable fallback schema to prevent frontend failures.
    return {
        "total_farmers": 0,
        "total_clusters": 0,
        "total_yield_kg": 0,
        "charts": {
            "grade_mix": {
                "Fine": 0,
                "Premium": 0,
                "Commercial": 0,
            }
        },
        "source": "fallback",
    }


@app.get("/analytics/admin-data")
def analytics_admin_data() -> Dict[str, Any]:
    payload = _load_synthetic_admin_data()
    if payload:
        return {
            "available": True,
            "source": "synthetic",
            "data": payload,
        }
    return {
        "available": False,
        "source": "none",
        "message": "Synthetic admin dataset not found.",
    }


@app.post("/predict")
def predict(payload: PredictPayload) -> Dict[str, Any]:
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
