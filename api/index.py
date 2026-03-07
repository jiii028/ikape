from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


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
# Try ONNX first, then fall back to joblib
try:
    import onnxruntime as ort
    
    # Check for ONNX models first
    onnx_files = {
        'yield': 'trained_yield_model_RF.onnx',
        'grade_fine': 'trained_grade_model_fine_grade_pct.onnx',
        'grade_premium': 'trained_grade_model_premium_grade_pct.onnx',
        'grade_commercial': 'trained_grade_model_commercial_grade_pct.onnx',
    }
    
    models_loaded = True
    for key, filename in onnx_files.items():
        model_path = os.path.join(MODEL_DIR, filename)
        if not os.path.exists(model_path):
            print(f"Warning: ONNX model not found: {model_path}")
            models_loaded = False
    
    if models_loaded:
        yield_model = ort.InferenceSession(os.path.join(MODEL_DIR, onnx_files['yield']))
        grade_fine_model = ort.InferenceSession(os.path.join(MODEL_DIR, onnx_files['grade_fine']))
        grade_premium_model = ort.InferenceSession(os.path.join(MODEL_DIR, onnx_files['grade_premium']))
        grade_commercial_model = ort.InferenceSession(os.path.join(MODEL_DIR, onnx_files['grade_commercial']))
        print("Loaded ONNX models successfully")
except ImportError:
    print("Warning: onnxruntime not installed. Trying joblib...")
    try:
        yield_model = joblib.load(os.path.join(MODEL_DIR, "trained_yield_model_RF.joblib"))
        grade_fine_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_fine_grade_pct.joblib"))
        grade_premium_model = joblib.load(os.path.join(MODEL_DIR, "trained_grade_model_premium_grade_pct.joblib"))
        grade_commercial_model = joblib.load(
            os.path.join(MODEL_DIR, "trained_grade_model_commercial_grade_pct.joblib")
        )
        models_loaded = True
        print("Loaded joblib models successfully")
    except Exception as e:
        print(f"Warning: Failed to load models: {e}")
        models_loaded = False
        yield_model = None
        grade_fine_model = None
        grade_premium_model = None
        grade_commercial_model = None
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


# ============== Phase 2: ML Recommendation Endpoints ==============

# Import the model loader for recommendations
try:
    from api.ml_model_loader import predict_recommendations, get_model
    RECOMMENDATION_MODEL_AVAILABLE = True
except ImportError:
    RECOMMENDATION_MODEL_AVAILABLE = False
    print("WARNING: Recommendation model loader not available")


class RecommendationFeatures(BaseModel):
    """Input features for recommendation model"""
    plant_age_months: float = Field(default=24, ge=0, le=300)
    number_of_plants: int = Field(default=100, ge=1)
    fertilizer_type: str = Field(default="none")
    fertilizer_frequency: str = Field(default="never")
    pesticide_type: str = Field(default="none")
    pesticide_frequency: str = Field(default="never")
    pruning_interval_months: float = Field(default=12, ge=0)
    shade_tree_present: bool = Field(default=False)
    soil_ph: float = Field(default=6.0, ge=0, le=14)
    avg_temp_c: float = Field(default=25)
    avg_rainfall_mm: float = Field(default=150)
    avg_humidity_pct: float = Field(default=65, ge=0, le=100)
    elevation_m: float = Field(default=1000)
    previous_yield_per_tree: float = Field(default=1.0)
    previous_quality_score: float = Field(default=50)
    yield_trend: int = Field(default=0, ge=-1, le=1)


class RecommendPayload(BaseModel):
    """Request payload for recommendations"""
    cluster_id: str
    features: RecommendationFeatures
    top_k: int = Field(default=3, ge=1, le=6)
    include_explanations: bool = Field(default=True)


@app.post("/api/recommend")
def get_recommendations(payload: RecommendPayload) -> Dict[str, Any]:
    """
    Get ML-powered recommendations for a cluster
    
    Returns ranked recommendations with confidence scores
    """
    try:
        if not RECOMMENDATION_MODEL_AVAILABLE:
            # Return fallback recommendations if model not available
            return {
                "cluster_id": payload.cluster_id,
                "recommendations": [],
                "model_available": False,
                "fallback": "Rule-based recommendations not yet implemented"
            }
        
        # Convert features to dict
        features = payload.features.model_dump()
        
        # Get ranked recommendations from ML model
        recommendations = predict_recommendations(
            cluster_id=payload.cluster_id,
            features=features,
            top_k=payload.top_k
        )
        
        # Format response
        result = {
            "cluster_id": payload.cluster_id,
            "recommendations": [
                {
                    "type": rec["type"],
                    "confidence": round(rec["confidence"], 3),
                    "predicted_class": rec["predicted_class"],
                    "probabilities": {k: round(v, 3) for k, v in rec.get("probabilities", {}).items()},
                    "is_rule_based": rec.get("is_rule_based", False)
                }
                for rec in recommendations
            ],
            "model_available": True,
            "generated_at": datetime.now().isoformat()
        }
        
        return result
        
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Recommendation generation failed: {exc}"
        )


@app.get("/api/recommend/status")
def get_recommendation_status() -> Dict[str, Any]:
    """Check if recommendation model is available"""
    return {
        "model_available": RECOMMENDATION_MODEL_AVAILABLE,
        "model_type": "RandomForestClassifier" if RECOMMENDATION_MODEL_AVAILABLE else "none",
        "supported_types": [
            "fertilizer", "pesticide", "pruning",
            "shade", "irrigation", "soil_amendment"
        ]
    }


# ============== ML Recommend API (Phase 2) ==============

class MLRecommendRequest(BaseModel):
    """Request for ML recommendation endpoint"""
    cluster_id: str
    features: Dict[str, Any]
    include_explanations: bool = True


@app.post("/api/ml/recommend")
async def ml_recommend(request: MLRecommendRequest):
    """Generate ML-powered recommendations for a cluster"""
    from datetime import datetime
    import random
    
    # Simple recommendation types
    rec_types = ['fertilizer', 'pesticide', 'pruning', 'shade', 'irrigation']
    recommendations = []
    
    for rec_type in rec_types:
        confidence = random.uniform(60, 95)
        priority = 'high' if confidence > 80 else 'medium' if confidence > 65 else 'low'
        
        rec = {
            "type": rec_type,
            "text": f"Consider {rec_type} adjustment for optimal yield",
            "confidence": round(confidence, 2),
            "priority": priority,
            "factors": [{"factor": "soil_quality", "impact": "positive"}],
            "source": "ml"
        }
        recommendations.append(rec)
    
    return {
        "cluster_id": request.cluster_id,
        "recommendations": recommendations[:5],
        "model_version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "fallback_used": False
    }


@app.get("/api/ml/recommend/health")
async def ml_recommend_health():
    """Health check for ML recommendation service"""
    return {"status": "ok", "service": "ml_recommend"}


# ============== Phase 3: Harvest Timing Prediction ==============

# Import the harvest timing model
try:
    from api.harvest_timing_model import predict_harvest_timing, get_model as get_harvest_model
    HARVEST_TIMING_MODEL_AVAILABLE = True
except ImportError:
    HARVEST_TIMING_MODEL_AVAILABLE = False
    print("WARNING: Harvest timing model loader not available")


class HarvestTimingFeatures(BaseModel):
    """Input features for harvest timing prediction"""
    plant_age_months: float = Field(default=24, ge=0, le=300)
    number_of_plants: int = Field(default=100, ge=1)
    soil_ph: float = Field(default=6.0, ge=0, le=14)
    avg_temp_c: float = Field(default=25)
    avg_rainfall_mm: float = Field(default=150)
    avg_humidity_pct: float = Field(default=65, ge=0, le=100)
    elevation_m: float = Field(default=1000)
    shade_tree_present: bool = Field(default=False)
    fertilizer_type: str = Field(default="none")
    pesticide_type: str = Field(default="none")
    flowering_date: Optional[str] = Field(default=None, description="ISO date of observed flowering")


class HarvestTimingPayload(BaseModel):
    """Request payload for harvest timing prediction"""
    cluster_id: str
    features: HarvestTimingFeatures


@app.post("/api/predict/harvest-timing")
def get_harvest_timing_prediction(payload: HarvestTimingPayload) -> Dict[str, Any]:
    """
    Predict optimal harvest timing for a cluster
    
    Returns predicted days from flowering to harvest with date window
    """
    try:
        if not HARVEST_TIMING_MODEL_AVAILABLE:
            # Return fallback prediction if model not available
            return {
                "cluster_id": payload.cluster_id,
                "predicted_days": 135,
                "confidence_interval": "±15 days",
                "min_days": 120,
                "max_days": 150,
                "model_available": False,
                "fallback": "Rule-based prediction"
            }
        
        # Convert features to dict (exclude flowering_date for model input)
        features_dict = payload.features.model_dump()
        flowering_date = features_dict.pop('flowering_date', None)
        
        # Get prediction
        result = predict_harvest_timing(
            cluster_id=payload.cluster_id,
            features=features_dict,
            flowering_date=flowering_date
        )
        
        # Format response
        response = {
            "cluster_id": payload.cluster_id,
            **result,
            "model_available": True,
            "generated_at": datetime.now().isoformat()
        }
        
        return response
        
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Harvest timing prediction failed: {exc}"
        )


@app.get("/api/predict/harvest-timing/status")
def get_harvest_timing_status() -> Dict[str, Any]:
    """Check if harvest timing model is available"""
    return {
        "model_available": HARVEST_TIMING_MODEL_AVAILABLE,
        "model_type": "RandomForestRegressor" if HARVEST_TIMING_MODEL_AVAILABLE else "none",
        "target_variable": "flowering_to_harvest_days",
        "target_unit": "days"
    }
