"""
Phase 3: Harvest Timing Model Loader
Loads and runs the trained harvest timing prediction model
"""

import os
import json
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

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
ONNX_MODEL_PATH = MODEL_DIR / 'trained_harvest_timing_model.onnx'
JOBLIB_MODEL_PATH = MODEL_DIR / 'trained_harvest_timing_model.joblib'
METRICS_PATH = MODEL_DIR / 'harvest_timing_model_metrics.json'

# Feature names (must match training)
NUMERICAL_FEATURES = [
    'plant_age_months', 'number_of_plants',
    'soil_ph', 'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
    'elevation_m', 'flowering_to_harvest_days'
]

CATEGORICAL_FEATURES = [
    'shade_tree_present', 'fertilizer_type', 'pesticide_type'
]

ALL_FEATURES = NUMERICAL_FEATURES + CATEGORICAL_FEATURES


class HarvestTimingModel:
    """Model wrapper for harvest timing prediction"""
    
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
    
    def predict(self, features: dict) -> dict:
        """
        Predict days from flowering to harvest
        
        Args:
            features: Dictionary of cluster features
            
        Returns:
            Dictionary with prediction results
        """
        if not self.is_loaded:
            return self._rule_based_predict(features)
        
        # Prepare input features
        input_features = self._prepare_features(features)
        
        try:
            if self.ort_session:
                # ONNX inference
                input_name = self.ort_session.get_inputs()[0].name
                output_name = self.ort_session.get_outputs()[0].name
                
                # Run inference
                ort_inputs = {input_name: input_features.astype(np.float32)}
                ort_outputs = self.ort_session.run([output_name], ort_inputs)[0]
                
                predicted_days = float(ort_outputs[0][0])
            else:
                # Joblib fallback
                predicted_days = float(self.model.predict(input_features)[0])
            
            # Apply realistic bounds
            predicted_days = np.clip(predicted_days, 100, 180)
            
            # Calculate confidence interval (based on model metrics)
            # Typical MAE is ~5-8 days, so use ±2*MAE for 95% confidence
            confidence_days = 10  # Conservative estimate
            
            return {
                'predicted_days': round(predicted_days, 1),
                'confidence_interval': f"±{confidence_days} days",
                'min_days': round(predicted_days - confidence_days, 1),
                'max_days': round(predicted_days + confidence_days, 1),
                'is_model_based': True
            }
            
        except Exception as e:
            print(f"Error predicting harvest timing: {e}")
            return self._rule_based_predict(features)
    
    def _prepare_features(self, features: dict) -> np.ndarray:
        """Prepare feature vector"""
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
        # Base days
        base_days = 135
        
        # Temperature effect (warmer = faster)
        temp = features.get('avg_temp_c', 25)
        temp_effect = (25 - temp) * 2
        
        # Altitude effect (higher = slower)
        elevation = features.get('elevation_m', 1000)
        altitude_effect = (elevation - 1000) / 100 * 3
        
        # Humidity effect
        humidity = features.get('avg_humidity_pct', 65)
        humidity_effect = (65 - humidity) * 0.2
        
        predicted_days = base_days + temp_effect + altitude_effect + humidity_effect
        predicted_days = np.clip(predicted_days, 100, 180)
        
        # Wider confidence interval for rule-based
        confidence_days = 15
        
        return {
            'predicted_days': round(predicted_days, 1),
            'confidence_interval': f"±{confidence_days} days",
            'min_days': round(predicted_days - confidence_days, 1),
            'max_days': round(predicted_days + confidence_days, 1),
            'is_model_based': False
        }
    
    def predict_with_dates(self, features: dict, flowering_date: str = None) -> dict:
        """
        Predict harvest dates given flowering date
        
        Args:
            features: Cluster features
            flowering_date: ISO date string of observed flowering (optional)
            
        Returns:
            Dictionary with prediction results including dates
        """
        timing = self.predict(features)
        
        result = {
            **timing,
            'flowering_date_provided': flowering_date is not None
        }
        
        if flowering_date:
            try:
                flowering = datetime.fromisoformat(flowering_date.replace('Z', '+00:00'))
                harvest_start = flowering + timedelta(days=timing['min_days'])
                harvest_optimal = flowering + timedelta(days=timing['predicted_days'])
                harvest_end = flowering + timedelta(days=timing['max_days'])
                
                # Calculate days until harvest
                today = datetime.now()
                days_until_harvest = (harvest_optimal.date() - today.date()).days
                
                result.update({
                    'flowering_date': flowering_date,
                    'harvest_window_start': harvest_start.date().isoformat(),
                    'harvest_optimal_date': harvest_optimal.date().isoformat(),
                    'harvest_window_end': harvest_end.date().isoformat(),
                    'days_until_harvest': days_until_harvest,
                    'harvest_status': self._get_harvest_status(days_until_harvest)
                })
            except Exception as e:
                print(f"Error calculating dates: {e}")
        
        return result
    
    def _get_harvest_status(self, days_until: int) -> str:
        """Determine harvest status based on days until harvest"""
        if days_until < 0:
            return 'overdue'
        elif days_until <= 7:
            return 'ready'
        elif days_until <= 14:
            return 'near'
        elif days_until <= 30:
            return 'upcoming'
        else:
            return 'future'


# Global model instance
_model_instance = None


def get_model() -> HarvestTimingModel:
    """Get or create the global model instance"""
    global _model_instance
    if _model_instance is None:
        _model_instance = HarvestTimingModel()
    return _model_instance


def predict_harvest_timing(cluster_id: str, features: dict, flowering_date: str = None) -> dict:
    """
    Predict harvest timing for a cluster
    
    Args:
        cluster_id: Cluster identifier
        features: Cluster features
        flowering_date: Optional flowering date (ISO string)
        
    Returns:
        Dictionary with prediction results
    """
    model = get_model()
    return model.predict_with_dates(features, flowering_date)
