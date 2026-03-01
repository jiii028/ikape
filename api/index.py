from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


MODEL_DIR = os.path.abspath(
    os.getenv("ML_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "ml_models"))
)

# Input feature keys expected by the model pipeline
# The pipeline includes feature engineering that transforms these into 22 features
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
    "previous_yield_per_tree",  # Maps from pre_yield_kg / pre_total_trees
    "previous_fine_pct",
    "previous_premium_pct",
    "previous_commercial_pct",
    "trees_productive_pct",  # Maps from historical data
    "yield_trend",  # -1, 0, or 1
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
    "synthetic": 2.0,
    "none": 0.0,
}

FERTILIZER_MAP = {'none': 0, 'organic': 1, 'synthetic': 2}
PESTICIDE_MAP = {'none': 0, 'organic': 1, 'synthetic': 2}
FREQUENCY_MAP = {'never': 0, 'rarely': 1, 'sometimes': 2, 'often': 3}

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

# Load trained model pipelines
# Each pipeline includes: FeatureEngineer -> Scaler -> RandomForest
try:
    yield_model = joblib.load(os.path.join(MODEL_DIR, "trained_yield_model_RF.joblib"))
    grade_fine_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_fine_grade_pct.joblib"))
    grade_premium_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_premium_grade_pct.joblib"))
    grade_commercial_model = joblib.load(
        os.path.join(MODEL_DIR, "trained_grade_model_commercial_grade_pct.joblib")
    )
    models_loaded = True
except Exception as e:
    print(f"Warning: Failed to load models: {e}")
    models_loaded = False
    yield_model = None
    grade_fine_model = None
    grade_premium_model = None
    grade_commercial_model = None

# Expected number of input features (before pipeline transformation)
EXPECTED_INPUT_FEATURES = len(FEATURE_KEYS)


def _to_number(value: Any) -> float:
    """Convert a value to a float number."""
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


def _map_fertilizer_type(value: Any) -> str:
    """Map fertilizer type to standardized values."""
    if value is None:
        return "none"
    text = str(value).strip().lower()
    if text in ["organic", "natural"]:
        return "organic"
    if text in ["synthetic", "chemical", "non-organic", "non_organic", "nonorganic", "inorganic"]:
        return "synthetic"
    return "none"


def _map_pesticide_type(value: Any) -> str:
    """Map pesticide type to standardized values."""
    if value is None:
        return "none"
    text = str(value).strip().lower()
    if text in ["organic", "natural", "bio"]:
        return "organic"
    if text in ["synthetic", "chemical", "conventional"]:
        return "synthetic"
    return "none"


def _map_frequency(value: Any) -> str:
    """Map frequency values to standardized values."""
    if value is None:
        return "never"
    text = str(value).strip().lower()
    if text in ["never", "none", "0"]:
        return "never"
    if text in ["rarely", "seldom", "occasionally"]:
        return "rarely"
    if text in ["sometimes", "occasionally", "moderate"]:
        return "sometimes"
    if text in ["often", "frequently", "regularly", "always"]:
        return "often"
    return "never"


def _map_boolean(value: Any) -> bool:
    """Map various boolean representations to True/False."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in ["yes", "true", "1", "present", "available"]


def _normalize_features(features: Union[List[Any], Dict[str, Any]]) -> pd.DataFrame:
    """
    Normalize features into a DataFrame for the model pipeline.
    The pipeline handles feature engineering internally.
    """
    if isinstance(features, list):
        if len(features) != len(FEATURE_KEYS):
            raise ValueError(
                f"Invalid feature length: expected {len(FEATURE_KEYS)}, received {len(features)}"
            )
        features = dict(zip(FEATURE_KEYS, features))

    if isinstance(features, dict):
        # Build standardized feature dictionary
        normalized = {}
        
        # Numeric features
        normalized['plant_age_months'] = _to_number(features.get('plant_age_months'))
        normalized['number_of_plants'] = _to_number(features.get('number_of_plants'))
        normalized['pruning_interval_months'] = _to_number(features.get('pruning_interval_months'))
        normalized['soil_ph'] = _to_number(features.get('soil_ph'))
        normalized['avg_temp_c'] = _to_number(features.get('avg_temp_c'))
        normalized['avg_rainfall_mm'] = _to_number(features.get('avg_rainfall_mm'))
        normalized['avg_humidity_pct'] = _to_number(features.get('avg_humidity_pct'))
        
        # Historical features
        normalized['previous_yield_per_tree'] = _to_number(features.get('previous_yield_per_tree'))
        normalized['previous_fine_pct'] = _to_number(features.get('previous_fine_pct'))
        normalized['previous_premium_pct'] = _to_number(features.get('previous_premium_pct'))
        normalized['previous_commercial_pct'] = _to_number(features.get('previous_commercial_pct'))
        normalized['trees_productive_pct'] = _to_number(features.get('trees_productive_pct'))
        normalized['yield_trend'] = _to_number(features.get('yield_trend'))
        
        # Categorical features (keep as strings for the pipeline to encode)
        normalized['fertilizer_type'] = _map_fertilizer_type(features.get('fertilizer_type'))
        normalized['fertilizer_frequency'] = _map_frequency(features.get('fertilizer_frequency'))
        normalized['pesticide_type'] = _map_pesticide_type(features.get('pesticide_type'))
        normalized['pesticide_frequency'] = _map_frequency(features.get('pesticide_frequency'))
        normalized['shade_tree_present'] = _map_boolean(features.get('shade_tree_present'))
        
        # Convert to DataFrame (pipeline expects DataFrame with column names)
        return pd.DataFrame([normalized])

    raise ValueError("features must be either a list or a dictionary")


def _normalize_grade_triplet(fine: float, premium: float, commercial: float) -> tuple[float, float, float]:
    values = np.array([fine, premium, commercial], dtype=float)
    values = np.clip(values, 0.0, None)

    total = float(values.sum())
    if total <= 0:
        return 0.0, 0.0, 0.0

    normalized = (values / total) * 100.0
    return tuple(float(v) for v in normalized.tolist())


def _predict_internal(features: Union[List[Any], Dict[str, Any]]) -> Dict[str, float]:
    """Make predictions using the trained model pipelines."""
    # Convert features to DataFrame
    df = _normalize_features(features)

    # Models are pipelines that include preprocessing
    yield_pred = float(yield_model.predict(df)[0])
    fine_pred = float(grade_fine_model.predict(df)[0])
    premium_pred = float(grade_premium_model.predict(df)[0])
    commercial_pred = float(grade_commercial_model.predict(df)[0])

    # Normalize grades to ensure they sum to 100%
    fine_pred, premium_pred, commercial_pred = _normalize_grade_triplet(
        fine_pred, premium_pred, commercial_pred
    )

    return {
        "yield_kg": round(max(yield_pred, 0.0), 3),
        "fine_grade_pct": round(fine_pred, 3),
        "premium_grade_pct": round(premium_pred, 3),
        "commercial_grade_pct": round(commercial_pred, 3),
    }


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "ok": models_loaded,
        "model_dir": MODEL_DIR,
        "expected_input_features": EXPECTED_INPUT_FEATURES,
        "models_loaded": models_loaded,
    }


@app.post("/api/predict")
def predict(payload: PredictPayload) -> Dict[str, float]:
    try:
        return _predict_internal(payload.features)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@app.post("/api/predict/batch")
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
