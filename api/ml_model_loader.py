"""
Phase 2: ML Model Loader for Recommendations
Loads and runs the trained recommendation model (ONNX format)
"""

import os
import json
import numpy as np
from pathlib import Path

# Try to import ONNX Runtime
try:
    import onnxruntime as ort
    ONNXRUNTIME_AVAILABLE = True
except ImportError:
    print("WARNING: onnxruntime not installed. Using fallback.")
    ONNXRUNTIME_AVAILABLE = False

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
MODEL_DIR = PROJECT_ROOT / 'ml_models'
ONNX_MODEL_PATH = MODEL_DIR / 'trained_recommendation_model.onnx'
JOBLIB_MODEL_PATH = MODEL_DIR / 'trained_recommendation_model.joblib'
METRICS_PATH = MODEL_DIR / 'recommendation_model_metrics.json'

# Feature names (must match training)
NUMERICAL_FEATURES = [
    'plant_age_months', 'number_of_plants', 'pruning_interval_months',
    'soil_ph', 'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
    'elevation_m', 'previous_yield_per_tree', 'previous_quality_score', 'yield_trend'
]

CATEGORICAL_FEATURES = [
    'fertilizer_type', 'fertilizer_frequency', 
    'pesticide_type', 'pesticide_frequency', 'shade_tree_present'
]

ALL_FEATURES = NUMERICAL_FEATURES + CATEGORICAL_FEATURES

RECOMMENDATION_TYPES = [
    'fertilizer', 'pesticide', 'pruning', 'shade', 'irrigation', 'soil_amendment'
]

# Label mapping
LABEL_ENCODERS = {
    'fertilizer_type': ['Compost', 'Inorganic', 'None', 'Organic'],
    'fertilizer_frequency': ['Monthly', 'Never', 'Quarterly', 'Rarely', 'Yearly'],
    'pesticide_type': ['Biological', 'Chemical', 'None', 'Organic'],
    'pesticide_frequency': ['Monthly', 'Never', 'Quarterly', 'Rarely', 'Yearly'],
    'shade_tree_present': [0, 1]
}

# Class labels (from training)
CLASS_LABELS = ['high', 'low', 'medium']


class RecommendationModel:
    """Model wrapper for recommendation inference"""
    
    def __init__(self):
        self.ort_session = None
        self.model = None
        self.label_encoders = {}
        self.is_loaded = False
        self.load_model()
    
    def load_model(self):
        """Load the trained model (ONNX or fallback)"""
        # Try ONNX first
        if ONNXRUNTIME_AVAILABLE and ONNX_MODEL_PATH.exists():
            try:
                print(f"Loading ONNX model from {ONNX_MODEL_PATH}")
                self.ort_session = ort.InferenceSession(
                    str(ONNX_MODEL_PATH),
                    providers=['CPUExecutionProvider']
                )
                self.is_loaded = True
                print("ONNX model loaded successfully")
                return
            except Exception as e:
                print(f"Failed to load ONNX model: {e}")
        
        # Try joblib fallback
        if JOBLIB_MODEL_PATH.exists():
            try:
                import joblib
                print(f"Loading joblib model from {JOBLIB_MODEL_PATH}")
                model_data = joblib.load(JOBLIB_MODEL_PATH)
                self.model = model_data['model']
                self.label_encoders = model_data.get('label_encoders', {})
                self.is_loaded = True
                print("Joblib model loaded successfully")
                return
            except Exception as e:
                print(f"Failed to load joblib model: {e}")
        
        print("WARNING: No model found. Using rule-based fallback.")
        self.is_loaded = False
    
    def predict_proba(self, features: dict) -> dict:
        """
        Predict recommendation effectiveness probabilities
        
        Args:
            features: Dictionary of cluster features
            
        Returns:
            Dictionary with recommendation types and their confidence scores
        """
        if not self.is_loaded:
            return self._rule_based_predict(features)
        
        # Prepare input for each recommendation type
        results = {}
        
        for rec_type in RECOMMENDATION_TYPES:
            # Create feature vector for this recommendation type
            input_features = self._prepare_features(features, rec_type)
            
            try:
                if self.ort_session:
                    # ONNX inference
                    input_name = self.ort_session.get_inputs()[0].name
                    output_name = self.ort_session.get_outputs()[0].name
                    
                    # Run inference
                    ort_inputs = {input_name: input_features.astype(np.float32)}
                    ort_outputs = self.ort_session.run([output_name], ort_inputs)[0]
                    
                    # Get probabilities
                    probs = ort_outputs[0]
                    
                else:
                    # Joblib fallback
                    probs = self.model.predict_proba(input_features)[0]
                
                # Map to class labels
                result = {}
                for i, label in enumerate(CLASS_LABELS):
                    result[label] = float(probs[i])
                
                # Get confidence (probability of highest class)
                confidence = float(max(probs))
                predicted_class = CLASS_LABELS[np.argmax(probs)]
                
                results[rec_type] = {
                    'confidence': confidence,
                    'predicted_class': predicted_class,
                    'probabilities': result
                }
                
            except Exception as e:
                print(f"Error predicting for {rec_type}: {e}")
                results[rec_type] = self._rule_based_predict_single(features, rec_type)
        
        return results
    
    def _prepare_features(self, features: dict, rec_type: str) -> np.ndarray:
        """Prepare feature vector for a specific recommendation type"""
        feature_vector = []
        
        for feat in ALL_FEATURES:
            value = features.get(feat, 0)
            
            # Handle categorical encoding
            if feat in CATEGORICAL_FEATURES:
                if feat in self.label_encoders:
                    encoder = self.label_encoders[feat]
                    try:
                        value = encoder.transform([str(value)])[0]
                    except:
                        value = 0
                else:
                    # Use default encoding
                    if feat == 'shade_tree_present':
                        value = 1 if value in [True, 'Yes', 'yes', 1, '1'] else 0
                    else:
                        value = 0
            
            feature_vector.append(float(value))
        
        return np.array([feature_vector])
    
    def _rule_based_predict(self, features: dict) -> dict:
        """Fallback rule-based prediction when ML model is not available"""
        results = {}
        
        for rec_type in RECOMMENDATION_TYPES:
            results[rec_type] = self._rule_based_predict_single(features, rec_type)
        
        return results
    
    def _rule_based_predict_single(self, features: dict, rec_type: str) -> dict:
        """Rule-based prediction for a single recommendation type"""
        confidence = 0.5
        predicted_class = 'medium'
        
        if rec_type == 'fertilizer':
            fert_type = features.get('fertilizer_type', 'None')
            if fert_type in ['None', None, 'None']:
                confidence = 0.85
                predicted_class = 'high'
            elif fert_type == 'Inorganic':
                confidence = 0.65
                predicted_class = 'medium'
                
        elif rec_type == 'pesticide':
            pest_type = features.get('pesticide_type', 'None')
            humidity = features.get('avg_humidity_pct', 50)
            
            if pest_type in ['None', None, 'None']:
                confidence = 0.80
                predicted_class = 'high'
            elif humidity > 75:
                confidence = 0.70
                predicted_class = 'medium'
                
        elif rec_type == 'pruning':
            plant_age = features.get('plant_age_months', 0)
            if plant_age > 24:
                confidence = 0.90
                predicted_class = 'high'
            elif plant_age > 12:
                confidence = 0.65
                predicted_class = 'medium'
                
        elif rec_type == 'shade':
            shade = features.get('shade_tree_present', 0)
            temp = features.get('avg_temp_c', 25)
            
            if shade == 0:
                confidence = 0.75
                predicted_class = 'high'
            elif temp > 28:
                confidence = 0.60
                predicted_class = 'medium'
                
        elif rec_type == 'irrigation':
            rainfall = features.get('avg_rainfall_mm', 150)
            
            if rainfall < 100:
                confidence = 0.80
                predicted_class = 'high'
            elif rainfall > 250:
                confidence = 0.70
                predicted_class = 'medium'
                
        elif rec_type == 'soil_amendment':
            ph = features.get('soil_ph', 6.0)
            
            if ph < 5.5 or ph > 6.5:
                confidence = 0.85
                predicted_class = 'high'
            elif ph < 5.8 or ph > 6.2:
                confidence = 0.60
                predicted_class = 'medium'
        
        return {
            'confidence': confidence,
            'predicted_class': predicted_class,
            'probabilities': {
                'high': confidence if predicted_class == 'high' else (1 - confidence) * 0.3,
                'medium': confidence if predicted_class == 'medium' else (1 - confidence) * 0.4,
                'low': confidence if predicted_class == 'low' else (1 - confidence) * 0.3
            },
            'is_rule_based': True
        }
    
    def rank_recommendations(self, features: dict, top_k: int = 3) -> list:
        """
        Get ranked recommendations by confidence score
        
        Args:
            features: Cluster features
            top_k: Number of
            
        Returns:
 top recommendations to return            List of recommendations sorted by confidence
        """
        predictions = self.predict_proba(features)
        
        # Sort by confidence
        ranked = []
        for rec_type, pred in predictions.items():
            ranked.append({
                'type': rec_type,
                'confidence': pred['confidence'],
                'predicted_class': pred['predicted_class'],
                'probabilities': pred.get('probabilities', {}),
                'is_rule_based': pred.get('is_rule_based', False)
            })
        
        ranked.sort(key=lambda x: x['confidence'], reverse=True)
        
        return ranked[:top_k]


# Global model instance
_model_instance = None


def get_model() -> RecommendationModel:
    """Get or create the global model instance"""
    global _model_instance
    if _model_instance is None:
        _model_instance = RecommendationModel()
    return _model_instance


def predict_recommendations(cluster_id: str, features: dict, top_k: int = 3) -> list:
    """
    Get ML-powered recommendations for a cluster
    
    Args:
        cluster_id: Cluster identifier
        features: Cluster agronomic features
        top_k: Number of recommendations to return
        
    Returns:
        List of ranked recommendations
    """
    model = get_model()
    return model.rank_recommendations(features, top_k)
