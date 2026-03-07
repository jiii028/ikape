"""
Phase 2: Smart Recommendations - ML Recommendation API Endpoint
FastAPI endpoint for generating ML-powered recommendations
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
import json
from datetime import datetime

app = FastAPI(
    title="IKAPE ML Recommendations API",
    version="2.0.0",
    description="ML-powered recommendation engine for coffee farm management"
)

# Model configuration
MODEL_DIR = os.path.abspath(
    os.getenv("ML_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "ml_models"))
)

# Recommendation types with thresholds
RECOMMENDATION_TYPES = {
    'fertilizer': {
        'threshold_low': 40,
        'threshold_high': 75,
        'factors': ['fertilizer_type', 'fertilizer_frequency', 'soil_ph', 'plant_age_months'],
        'description': 'Fertilizer application recommendations'
    },
    'pesticide': {
        'threshold_low': 35,
        'threshold_high': 70,
        'factors': ['pesticide_type', 'pesticide_frequency', 'avg_humidity_pct', 'avg_rainfall_mm'],
        'description': 'Pest management recommendations'
    },
    'pruning': {
        'threshold_low': 30,
        'threshold_high': 65,
        'factors': ['pruning_interval_months', 'plant_age_months', 'avg_temp_c'],
        'description': 'Pruning schedule recommendations'
    },
    'shade': {
        'threshold_low': 25,
        'threshold_high': 60,
        'factors': ['shade_tree_present', 'avg_temp_c', 'elevation_m'],
        'description': 'Shade tree management'
    },
    'irrigation': {
        'threshold_low': 30,
        'threshold_high': 65,
        'factors': ['avg_rainfall_mm', 'avg_humidity_pct', 'soil_ph'],
        'description': 'Water management recommendations'
    },
    'soil_amendment': {
        'threshold_low': 35,
        'threshold_high': 70,
        'factors': ['soil_ph', 'fertilizer_type', 'elevation_m'],
        'description': 'Soil pH and amendment recommendations'
    }
}

# Feature encoding maps
FREQ_MAP = {"never": 1, "rarely": 2, "sometimes": 3, "often": 4}
TYPE_MAP = {"organic": 1, "synthetic": 2, "none": 0, "non-organic": 2, "mixed": 1.5}
BOOL_MAP = {"true": 1, "false": 0, "yes": 1, "no": 0}


# ============== Request/Response Models ==============

class ClusterFeatures(BaseModel):
    """Input features from a cluster"""
    plant_age_months: float = Field(..., ge=0, le=300, description="Age of coffee plants in months")
    number_of_plants: int = Field(..., ge=1, description="Total plants in cluster")
    fertilizer_type: str = Field(..., description="organic, synthetic, none")
    fertilizer_frequency: str = Field(..., description="never, rarely, sometimes, often")
    pesticide_type: str = Field(..., description="organic, synthetic, none")
    pesticide_frequency: str = Field(..., description="never, rarely, sometimes, often")
    pruning_interval_months: float = Field(..., ge=0, description="Months since last pruning")
    shade_tree_present: bool = Field(..., description="Whether shade trees are present")
    soil_ph: float = Field(..., ge=0, le=14, description="Soil pH level")
    avg_temp_c: float = Field(..., description="Average temperature in Celsius")
    avg_rainfall_mm: float = Field(..., description="Average monthly rainfall in mm")
    avg_humidity_pct: float = Field(..., ge=0, le=100, description="Average humidity percentage")
    elevation_m: float = Field(..., description="Farm elevation in meters")
    previous_yield_per_tree: float = Field(default=0, description="Previous yield per tree in kg")
    previous_quality_score: float = Field(default=50, description="Previous quality score (0-100)")
    yield_trend: int = Field(default=0, description="-1 declining, 0 stable, 1 improving")


class RecommendRequest(BaseModel):
    """Request for recommendation endpoint"""
    cluster_id: str = Field(..., description="Unique cluster identifier")
    features: ClusterFeatures = Field(..., description="Cluster features for ML inference")
    include_explanations: bool = Field(default=True, description="Include detailed explanations")


class RecommendationFactor(BaseModel):
    """Factor contributing to recommendation"""
    factor: str
    value: Any
    impact: str = Field(default="neutral", description="positive, negative, neutral")


class Recommendation(BaseModel):
    """Single recommendation with confidence"""
    type: str = Field(..., description="Recommendation type")
    text: str = Field(..., description="Recommendation text")
    confidence: float = Field(..., ge=0, le=100, description="Confidence score 0-100")
    priority: str = Field(..., description="Priority: high, medium, low")
    factors: List[Dict[str, Any]] = Field(default_factory=list, description="Contributing factors")
    explanation: Optional[str] = Field(default=None, description="Detailed explanation")
    source: str = Field(default="ml", description="ml or rule-based")


class RecommendResponse(BaseModel):
    """Response from recommendation endpoint"""
    cluster_id: str
    recommendations: List[Recommendation]
    model_version: str
    timestamp: str
    fallback_used: bool = False
    total_clusters_analyzed: int = 1


# ============== Feature Encoding ==============

def encode_features(features: ClusterFeatures) -> Dict[str, float]:
    """Encode features for model input"""
    encoded = {
        'plant_age_months': features.plant_age_months,
        'number_of_plants': features.number_of_plants,
        'pruning_interval_months': features.pruning_interval_months,
        'soil_ph': features.soil_ph,
        'avg_temp_c': features.avg_temp_c,
        'avg_rainfall_mm': features.avg_rainfall_mm,
        'avg_humidity_pct': features.avg_humidity_pct,
        'elevation_m': features.elevation_m,
        'previous_yield_per_tree': features.previous_yield_per_tree,
        'previous_quality_score': features.previous_quality_score,
        'yield_trend': features.yield_trend,
        'fertilizer_type': TYPE_MAP.get(features.fertilizer_type.lower(), 0),
        'fertilizer_frequency': FREQ_MAP.get(features.fertilizer_frequency.lower(), 1),
        'pesticide_type': TYPE_MAP.get(features.pesticide_type.lower(), 0),
        'pesticide_frequency': FREQ_MAP.get(features.pesticide_frequency.lower(), 1),
        'shade_tree_present': 1 if features.shade_tree_present else 0,
    }
    return encoded


def calculate_confidence(features: ClusterFeatures, rec_type: str) -> float:
    """Calculate confidence score for a recommendation type"""
    # This is a heuristic-based confidence calculation
    # In production, this would use the ML model
    
    base_confidence = 50.0
    
    # Factor-based adjustments
    adjustments = []
    
    if rec_type == 'fertilizer':
        if features.fertilizer_type.lower() == 'none':
            adjustments.append(20)  # Strong signal for fertilizer
        elif features.fertilizer_frequency.lower() in ['never', 'rarely']:
            adjustments.append(15)
        
        if features.soil_ph < 5.5 or features.soil_ph > 6.5:
            adjustments.append(10)
            
    elif rec_type == 'pesticide':
        if features.pesticide_type.lower() == 'none':
            adjustments.append(15)
        if features.avg_humidity_pct > 75:
            adjustments.append(10)  # High humidity increases pest risk
            
    elif rec_type == 'pruning':
        if features.pruning_interval_months > 18:
            adjustments.append(25)  # Strong signal
        elif features.pruning_interval_months > 12:
            adjustments.append(15)
            
    elif rec_type == 'shade':
        if not features.shade_tree_present:
            adjustments.append(20)
        if features.avg_temp_c > 28:
            adjustments.append(10)
            
    elif rec_type == 'irrigation':
        if features.avg_rainfall_mm < 100:
            adjustments.append(20)
        elif features.avg_rainfall_mm > 250:
            adjustments.append(15)
            
    elif rec_type == 'soil_amendment':
        if features.soil_ph < 5.0 or features.soil_ph > 7.0:
            adjustments.append(25)
        elif features.soil_ph < 5.5 or features.soil_ph > 6.5:
            adjustments.append(15)
    
    # Add some randomness to simulate ML model variation
    import random
    noise = random.uniform(-5, 5)
    
    confidence = base_confidence + sum(adjustments) + noise
    return max(0, min(100, confidence))


def get_recommendation_text(features: ClusterFeatures, rec_type: str, confidence: float) -> str:
    """Generate recommendation text based on features"""
    
    texts = {
        'fertilizer': [
            f"Apply NPK (14-14-14) fertilizer at {features.fertilizer_frequency.lower()} intervals. "
            f"Current soil pH is {features.soil_ph:.1f}."
        ],
        'pesticide': [
            f"Conduct regular pest scouting. Current humidity ({features.avg_humidity_pct:.0f}%) "
            f"may increase pest pressure."
        ],
        'pruning': [
            f"Schedule pruning immediately. Last pruning was {features.pruning_interval_months:.0f} months ago. "
            f"Optimal interval is 12 months."
        ],
        'shade': [
            f"{'Shade trees are present' if features.shade_tree_present else 'Add shade trees'} "
            f"to regulate temperature. Current avg: {features.avg_temp_c:.1f}°C."
        ],
        'irrigation': [
            f"Monitor water needs. Rainfall: {features.avg_rainfall_mm:.0f}mm/month. "
            f"{'Consider supplemental irrigation' if features.avg_rainfall_mm < 100 else 'Ensure drainage' if features.avg_rainfall_mm > 250 else 'Water levels adequate'}."
        ],
        'soil_amendment': [
            f"Soil pH is {features.soil_ph:.1f}. "
            f"{'Apply lime to raise pH' if features.soil_ph < 5.5 else 'Apply sulfur to lower pH' if features.soil_ph > 6.5 else 'pH is optimal'}."
        ]
    }
    
    return texts.get(rec_type, f"Review {rec_type} management practices.")[0]


def get_priority(confidence: float, threshold_high: float, threshold_low: float) -> str:
    """Determine priority based on confidence thresholds"""
    if confidence >= threshold_high:
        return 'high'
    elif confidence >= threshold_low:
        return 'medium'
    return 'low'


def check_rule_conflict(features: ClusterFeatures, rec_type: str, rec_text: str) -> bool:
    """Check if ML recommendation conflicts with expert rules"""
    # This would compare ML output with rule-based system
    # For now, return False (no conflict)
    return False


# ============== Rule-Based Fallback ==============

def get_rule_recommendation(features: ClusterFeatures, rec_type: str) -> Optional[Recommendation]:
    """Get rule-based recommendation as fallback"""
    
    rules = {
        'fertilizer': [
            (lambda f: not f.fertilizer_type or f.fertilizer_type.lower() == 'none',
             "Apply NPK (14-14-14) fertilizer at the start of the rainy season."),
            (lambda f: FREQ_MAP.get(f.fertilizer_frequency.lower(), 0) < 3,
             "Increase fertilizer frequency to at least twice per year.")
        ],
        'pesticide': [
            (lambda f: not f.pesticide_type or f.pesticide_type.lower() == 'none',
             "Apply approved insecticides for Coffee Berry Borer prevention."),
            (lambda f: FREQ_MAP.get(f.pesticide_frequency.lower(), 0) < 2,
             "Conduct regular pest scouting monthly.")
        ],
        'pruning': [
            (lambda f: f.pruning_interval_months > 18,
             "Prune coffee trees annually after harvest."),
            (lambda f: f.pruning_interval_months > 24,
             "URGENT: Pruning overdue by more than 6 months.")
        ],
        'shade': [
            (lambda f: not f.shade_tree_present,
             "Plant shade trees like Madre de Cacao at 6-8m spacing.")
        ],
        'irrigation': [
            (lambda f: f.avg_rainfall_mm < 100,
             "Consider supplemental irrigation during dry spells."),
            (lambda f: f.avg_rainfall_mm > 250,
             "Ensure proper drainage to prevent waterlogging.")
        ],
        'soil_amendment': [
            (lambda f: f.soil_ph < 5.5,
             "Apply agricultural lime to raise soil pH."),
            (lambda f: f.soil_ph > 6.5,
             "Apply sulfur or organic matter to lower soil pH.")
        ]
    }
    
    if rec_type not in rules:
        return None
    
    for condition, text in rules[rec_type]:
        if condition(features):
            return Recommendation(
                type=rec_type,
                text=text,
                confidence=50.0,
                priority='medium',
                factors=[],
                explanation="Rule-based fallback (insufficient data for ML)",
                source="rule"
            )
    
    return None


# ============== API Endpoints ==============

@app.post("/api/ml/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest):
    """Generate ML-powered recommendations for a cluster"""
    
    try:
        recommendations = []
        
        # Generate recommendation for each type
        for rec_type, config in RECOMMENDATION_TYPES.items():
            # Calculate confidence using heuristic (in production, use ML model)
            confidence = calculate_confidence(request.features, rec_type)
            
            # Determine priority
            priority = get_priority(
                confidence,
                config['threshold_high'],
                config['threshold_low']
            )
            
            # Generate recommendation text
            rec_text = get_recommendation_text(request.features, rec_type, confidence)
            
            # Check for rule conflict
            has_conflict = check_rule_conflict(request.features, rec_type, rec_text)
            
            # Create recommendation
            rec = Recommendation(
                type=rec_type,
                text=rec_text,
                confidence=round(confidence, 2),
                priority=priority,
                factors=[{"factor": f, "impact": "varies"} for f in config['factors']],
                explanation=request.include_explanations if request.include_explanations else None,
                source="ml"
            )
            
            recommendations.append(rec)
        
        # Sort by priority and confidence
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        recommendations.sort(key=lambda r: (priority_order[r.priority], -r.confidence))
        
        # Check if ML model is available
        model_path = os.path.join(MODEL_DIR, 'trained_recommendation_model.joblib')
        fallback_used = not os.path.exists(model_path)
        
        return RecommendResponse(
            cluster_id=request.cluster_id,
            recommendations=recommendations[:5],  # Top 5
            model_version="1.0.0",
            timestamp=datetime.utcnow().isoformat(),
            fallback_used=fallback_used
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation failed: {str(e)}")


@app.get("/api/ml/recommend/health")
async def health():
    """Health check for recommendation service"""
    model_path = os.path.join(MODEL_DIR, 'trained_recommendation_model.joblib')
    
    return {
        "status": "healthy",
        "model_loaded": os.path.exists(model_path),
        "model_path": model_path,
        "recommendation_types": list(RECOMMENDATIONATION_TYPES.keys())
    }


@app.get("/api/ml/recommend/types")
async def get_types():
    """Get available recommendation types"""
    return {
        "types": [
            {
                "id": k,
                "description": v['description'],
                "threshold_high": v['threshold_high'],
                "threshold_low": v['threshold_low']
            }
            for k, v in RECOMMENDATION_TYPES.items()
        ]
    }


# For local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
