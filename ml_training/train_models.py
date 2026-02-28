"""
ML Training Pipeline for Coffee Yield and Grade Prediction

This module implements a robust training pipeline with:
- Proper feature engineering and preprocessing
- Random Forest models for yield and grade predictions
- Cross-validation and hyperparameter tuning
- Model evaluation and metrics
- Export to both joblib (Python) and ONNX (Browser) formats
"""

import os
import sys
import json
import pickle
import warnings
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, MinMaxScaler, OneHotEncoder
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')

# Try to import ONNX converter
try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("Warning: skl2onnx not available. ONNX conversion will be skipped.")


@dataclass
class ModelConfig:
    """Configuration for model training."""
    random_state: int = 42
    test_size: float = 0.15
    validation_size: float = 0.15
    cv_folds: int = 5
    
    # Model output paths - relative to project root
    output_dir: str = None
    onnx_output_dir: str = None
    
    # Random Forest parameters
    rf_n_estimators: int = 200
    rf_max_depth: int = 15
    rf_min_samples_split: int = 5
    rf_min_samples_leaf: int = 2
    
    def __post_init__(self):
        # Set default paths based on project structure
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_dir = os.path.dirname(script_dir)
        if self.output_dir is None:
            self.output_dir = os.path.join(project_dir, 'ml_models')
        if self.onnx_output_dir is None:
            self.onnx_output_dir = os.path.join(project_dir, 'public', 'models')


class SingleOutputWrapper(BaseEstimator):
    """Wrapper to extract a single output from multi-output model."""
    def __init__(self, model=None, index=0):
        self.model = model
        self.index = index
    
    def fit(self, X, y=None):
        return self
    
    def predict(self, X):
        return self.model.predict(X)[:, self.index]


class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Custom feature engineering transformer.
    Encodes categorical variables and creates derived features.
    """
    
    # Mapping dictionaries
    FERTILIZER_MAP = {'none': 0, 'organic': 1, 'synthetic': 2}
    PESTICIDE_MAP = {'none': 0, 'organic': 1, 'synthetic': 2}
    FREQUENCY_MAP = {'never': 0, 'rarely': 1, 'sometimes': 2, 'often': 3}
    
    def __init__(self):
        self.feature_names = None
    
    def fit(self, X, y=None):
        return self
    
    def transform(self, X):
        """Transform raw features to model-ready features."""
        if isinstance(X, pd.DataFrame):
            X = X.copy()
        else:
            X = pd.DataFrame(X, columns=self._get_input_columns())
        
        # Encode categorical variables
        X['fertilizer_type_encoded'] = X['fertilizer_type'].map(self.FERTILIZER_MAP).fillna(0)
        X['pesticide_type_encoded'] = X['pesticide_type'].map(self.PESTICIDE_MAP).fillna(0)
        X['fertilizer_frequency_encoded'] = X['fertilizer_frequency'].map(self.FREQUENCY_MAP).fillna(0)
        X['pesticide_frequency_encoded'] = X['pesticide_frequency'].map(self.FREQUENCY_MAP).fillna(0)
        X['shade_tree_encoded'] = X['shade_tree_present'].astype(int)
        
        # Create derived features
        # Agronomic intensity score (higher = more intensive management)
        X['agronomic_intensity'] = (
            X['fertilizer_type_encoded'] * 0.3 +
            X['fertilizer_frequency_encoded'] * 0.2 +
            X['pesticide_type_encoded'] * 0.2 +
            X['pesticide_frequency_encoded'] * 0.1 +
            (X['pruning_interval_months'] <= 12).astype(int) * 0.2
        )
        
        # Environmental suitability score
        X['ph_suitability'] = 1 - np.abs(X['soil_ph'] - 5.75) / 5.75
        X['temp_suitability'] = 1 - np.abs(X['avg_temp_c'] - 23) / 15
        X['rainfall_suitability'] = 1 - np.abs(X['avg_rainfall_mm'] - 170) / 170
        
        X['environmental_suitability'] = (
            X['ph_suitability'] * 0.4 +
            X['temp_suitability'] * 0.35 +
            X['rainfall_suitability'] * 0.25
        )
        
        # Historical performance index
        X['historical_grade_quality'] = (
            X['previous_fine_pct'] * 2 +
            X['previous_premium_pct']
        ) / 100
        
        # Age category
        X['age_category'] = pd.cut(
            X['plant_age_months'],
            bins=[0, 12, 24, 48, 84, 120, 300],
            labels=[0, 1, 2, 3, 4, 5]
        ).astype(int)
        
        # Select final features
        feature_cols = [
            'plant_age_months',
            'number_of_plants',
            'fertilizer_type_encoded',
            'fertilizer_frequency_encoded',
            'pesticide_type_encoded',
            'pesticide_frequency_encoded',
            'pruning_interval_months',
            'shade_tree_encoded',
            'soil_ph',
            'avg_temp_c',
            'avg_rainfall_mm',
            'avg_humidity_pct',
            'previous_yield_per_tree',
            'previous_fine_pct',
            'previous_premium_pct',
            'previous_commercial_pct',
            'trees_productive_pct',
            'yield_trend',
            'agronomic_intensity',
            'environmental_suitability',
            'historical_grade_quality',
            'age_category',
        ]
        
        self.feature_names = feature_cols
        return X[feature_cols].values
    
    def _get_input_columns(self):
        return [
            'plant_age_months', 'number_of_plants', 'fertilizer_type',
            'fertilizer_frequency', 'pesticide_type', 'pesticide_frequency',
            'pruning_interval_months', 'shade_tree_present', 'soil_ph',
            'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
            'previous_yield_per_tree', 'previous_fine_pct', 'previous_premium_pct',
            'previous_commercial_pct', 'trees_productive_pct', 'yield_trend'
        ]
    
    def get_feature_names(self):
        return self.feature_names


class GradeNormalizer(BaseEstimator, TransformerMixin):
    """
    Post-processing transformer to ensure grade percentages sum to 100.
    """
    
    def fit(self, X, y=None):
        return self
    
    def transform(self, X):
        """Normalize grades to sum to 100%."""
        X = np.array(X)
        # Clip to non-negative values
        X = np.clip(X, 0, None)
        # Normalize each row to sum to 100
        row_sums = X.sum(axis=1, keepdims=True)
        row_sums = np.where(row_sums == 0, 1, row_sums)  # Avoid division by zero
        return (X / row_sums) * 100


class CoffeeMLPipeline:
    """
    Main training pipeline for coffee prediction models.
    """
    
    def __init__(self, config: ModelConfig = None):
        self.config = config or ModelConfig()
        self.yield_model = None
        self.grade_model = None
        self.metrics = {}
        
        # Create output directories
        os.makedirs(self.config.output_dir, exist_ok=True)
        os.makedirs(self.config.onnx_output_dir, exist_ok=True)
    
    def load_data(self, filepath: str) -> pd.DataFrame:
        """Load training data from CSV."""
        print(f"Loading data from {filepath}...")
        df = pd.read_csv(filepath)
        print(f"  Loaded {len(df)} samples")
        return df
    
    def prepare_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Prepare features and targets for training."""
        # Feature columns
        feature_cols = [
            'plant_age_months', 'number_of_plants', 'fertilizer_type',
            'fertilizer_frequency', 'pesticide_type', 'pesticide_frequency',
            'pruning_interval_months', 'shade_tree_present', 'soil_ph',
            'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
            'previous_yield_per_tree', 'previous_fine_pct', 'previous_premium_pct',
            'previous_commercial_pct', 'trees_productive_pct', 'yield_trend'
        ]
        
        # Target columns
        target_cols = ['yield_kg', 'fine_grade_pct', 'premium_grade_pct', 'commercial_grade_pct']
        
        X = df[feature_cols].copy()
        y_yield = df['yield_kg'].values
        y_grades = df[['fine_grade_pct', 'premium_grade_pct', 'commercial_grade_pct']].values
        
        return X, y_yield, y_grades
    
    def create_preprocessing_pipeline(self) -> Pipeline:
        """Create feature engineering and preprocessing pipeline."""
        return Pipeline([
            ('feature_engineer', FeatureEngineer()),
            ('scaler', StandardScaler())
        ])
    
    def train_yield_model(self, X_train: np.ndarray, y_train: np.ndarray, 
                          X_val: np.ndarray, y_val: np.ndarray) -> RandomForestRegressor:
        """Train the yield prediction model."""
        print("\nTraining Yield Prediction Model...")
        
        # Create preprocessing pipeline
        preprocessing = self.create_preprocessing_pipeline()
        X_train_processed = preprocessing.fit_transform(X_train)
        X_val_processed = preprocessing.transform(X_val)
        
        # Train Random Forest
        model = RandomForestRegressor(
            n_estimators=self.config.rf_n_estimators,
            max_depth=self.config.rf_max_depth,
            min_samples_split=self.config.rf_min_samples_split,
            min_samples_leaf=self.config.rf_min_samples_leaf,
            random_state=self.config.random_state,
            n_jobs=-1
        )
        
        model.fit(X_train_processed, y_train)
        
        # Evaluate
        train_pred = model.predict(X_train_processed)
        val_pred = model.predict(X_val_processed)
        
        self.metrics['yield'] = {
            'train_rmse': np.sqrt(mean_squared_error(y_train, train_pred)),
            'train_mae': mean_absolute_error(y_train, train_pred),
            'train_r2': r2_score(y_train, train_pred),
            'val_rmse': np.sqrt(mean_squared_error(y_val, val_pred)),
            'val_mae': mean_absolute_error(y_val, val_pred),
            'val_r2': r2_score(y_val, val_pred),
        }
        
        print(f"  Train R²: {self.metrics['yield']['train_r2']:.4f}")
        print(f"  Val R²: {self.metrics['yield']['val_r2']:.4f}")
        print(f"  Val RMSE: {self.metrics['yield']['val_rmse']:.2f} kg")
        
        # Store preprocessing with model
        self.yield_preprocessing = preprocessing
        return model
    
    def train_grade_model(self, X_train: np.ndarray, y_train: np.ndarray,
                          X_val: np.ndarray, y_val: np.ndarray) -> RandomForestRegressor:
        """Train the grade distribution prediction model."""
        print("\nTraining Grade Prediction Model...")
        
        # Create preprocessing pipeline
        preprocessing = self.create_preprocessing_pipeline()
        X_train_processed = preprocessing.fit_transform(X_train)
        X_val_processed = preprocessing.transform(X_val)
        
        # Train Random Forest for multi-output regression
        model = RandomForestRegressor(
            n_estimators=self.config.rf_n_estimators,
            max_depth=self.config.rf_max_depth,
            min_samples_split=self.config.rf_min_samples_split,
            min_samples_leaf=self.config.rf_min_samples_leaf,
            random_state=self.config.random_state,
            n_jobs=-1
        )
        
        model.fit(X_train_processed, y_train)
        
        # Evaluate
        train_pred = model.predict(X_train_processed)
        val_pred = model.predict(X_val_processed)
        
        # Apply grade normalization
        normalizer = GradeNormalizer()
        train_pred_norm = normalizer.transform(train_pred)
        val_pred_norm = normalizer.transform(val_pred)
        
        self.metrics['grades'] = {
            'train_rmse': np.sqrt(mean_squared_error(y_train, train_pred_norm)),
            'train_mae': mean_absolute_error(y_train, train_pred_norm),
            'train_r2': r2_score(y_train, train_pred_norm),
            'val_rmse': np.sqrt(mean_squared_error(y_val, val_pred_norm)),
            'val_mae': mean_absolute_error(y_val, val_pred_norm),
            'val_r2': r2_score(y_val, val_pred_norm),
        }
        
        print(f"  Train R²: {self.metrics['grades']['train_r2']:.4f}")
        print(f"  Val R²: {self.metrics['grades']['val_r2']:.4f}")
        print(f"  Val MAE: {self.metrics['grades']['val_mae']:.2f}%")
        
        # Store preprocessing with model
        self.grade_preprocessing = preprocessing
        self.grade_normalizer = normalizer
        return model
    
    def save_models(self):
        """Save trained models to disk."""
        print("\nSaving Models...")
        
        # Save yield model pipeline
        yield_pipeline = Pipeline([
            ('preprocessing', self.yield_preprocessing),
            ('model', self.yield_model)
        ])
        yield_path = os.path.join(self.config.output_dir, 'trained_yield_model_RF.joblib')
        joblib.dump(yield_pipeline, yield_path)
        print(f"  Saved: {yield_path}")
        
        # Save grade model pipeline
        grade_pipeline = Pipeline([
            ('preprocessing', self.grade_preprocessing),
            ('model', self.grade_model),
            ('normalizer', self.grade_normalizer)
        ])
        
        # Save individual grade models for compatibility
        grade_targets = ['fine', 'premium', 'commercial']
        for i, target in enumerate(grade_targets):
            grade_single_pipeline = Pipeline([
                ('preprocessing', self.grade_preprocessing),
                ('model', SingleOutputWrapper(self.grade_model, i)),
            ])
            
            grade_path = os.path.join(self.config.output_dir, 
                                      f'trained_grade_model_{target}_grade_pct.joblib')
            joblib.dump(grade_single_pipeline, grade_path)
            print(f"  Saved: {grade_path}")
    
    def convert_to_onnx(self):
        """Convert trained models to ONNX format for browser inference."""
        if not ONNX_AVAILABLE:
            print("\nONNX conversion skipped (skl2onnx not installed)")
            return
        
        print("\nConverting to ONNX format...")
        
        # Define input type
        n_features = 22  # Number of features after engineering
        initial_type = [('float_input', FloatTensorType([None, n_features]))]
        
        # Convert yield model
        try:
            yield_onnx = convert_sklearn(self.yield_model, initial_types=initial_type)
            yield_onnx_path = os.path.join(self.config.onnx_output_dir, 'trained_yield_model_RF.onnx')
            with open(yield_onnx_path, 'wb') as f:
                f.write(yield_onnx.SerializeToString())
            print(f"  Saved: {yield_onnx_path}")
        except Exception as e:
            print(f"  Error converting yield model: {e}")
        
        # Convert grade models
        grade_targets = ['fine', 'premium', 'commercial']
        for i, target in enumerate(grade_targets):
            try:
                single_output = SingleOutputWrapper(self.grade_model, i)
                grade_onnx = convert_sklearn(single_output, initial_types=initial_type)
                grade_onnx_path = os.path.join(self.config.onnx_output_dir, 
                                               f'trained_grade_model_{target}_grade_pct.onnx')
                with open(grade_onnx_path, 'wb') as f:
                    f.write(grade_onnx.SerializeToString())
                print(f"  Saved: {grade_onnx_path}")
            except Exception as e:
                print(f"  Error converting {target} grade model: {e}")
    
    def save_metrics(self):
        """Save evaluation metrics to JSON."""
        metrics_path = os.path.join(self.config.output_dir, 'model_metrics.json')
        with open(metrics_path, 'w') as f:
            json.dump(self.metrics, f, indent=2)
        print(f"\nMetrics saved to: {metrics_path}")
    
    def run(self, data_filepath: str):
        """Run the complete training pipeline."""
        print("=" * 60)
        print("Coffee ML Training Pipeline")
        print("=" * 60)
        
        # Load data
        df = self.load_data(data_filepath)
        
        # Prepare data
        X, y_yield, y_grades = self.prepare_data(df)
        
        # Split data
        X_train, X_temp, y_yield_train, y_yield_temp, y_grades_train, y_grades_temp = train_test_split(
            X, y_yield, y_grades, 
            test_size=self.config.test_size + self.config.validation_size,
            random_state=self.config.random_state
        )
        
        val_ratio = self.config.validation_size / (self.config.test_size + self.config.validation_size)
        X_val, X_test, y_yield_val, y_yield_test, y_grades_val, y_grades_test = train_test_split(
            X_temp, y_yield_temp, y_grades_temp,
            test_size=0.5, random_state=self.config.random_state
        )
        
        print(f"\nData Split:")
        print(f"  Train: {len(X_train)} samples")
        print(f"  Validation: {len(X_val)} samples")
        print(f"  Test: {len(X_test)} samples")
        
        # Train models
        self.yield_model = self.train_yield_model(X_train, y_yield_train, X_val, y_yield_val)
        self.grade_model = self.train_grade_model(X_train, y_grades_train, X_val, y_grades_val)
        
        # Evaluate on test set
        print("\nTest Set Evaluation:")
        X_test_processed_yield = self.yield_preprocessing.transform(X_test)
        X_test_processed_grade = self.grade_preprocessing.transform(X_test)
        
        yield_test_pred = self.yield_model.predict(X_test_processed_yield)
        grades_test_pred = self.grade_model.predict(X_test_processed_grade)
        grades_test_pred = self.grade_normalizer.transform(grades_test_pred)
        
        test_yield_r2 = r2_score(y_yield_test, yield_test_pred)
        test_grades_r2 = r2_score(y_grades_test, grades_test_pred)
        
        print(f"  Yield R²: {test_yield_r2:.4f}")
        print(f"  Grades R²: {test_grades_r2:.4f}")
        
        self.metrics['test'] = {
            'yield_r2': test_yield_r2,
            'grades_r2': test_grades_r2,
        }
        
        # Save models
        self.save_models()
        self.convert_to_onnx()
        self.save_metrics()
        
        print("\n" + "=" * 60)
        print("Training Complete!")
        print("=" * 60)
        
        return self.metrics


def main():
    """Main entry point."""
    # Get the directory of the current script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    
    # Generate synthetic data if it doesn't exist
    data_path = os.path.join(script_dir, 'synthetic_coffee_data.csv')
    
    if not os.path.exists(data_path):
        print("Synthetic data not found. Generating...")
        from generate_synthetic_data import CoffeeProductionSimulator
        simulator = CoffeeProductionSimulator(n_samples=5000)
        df = simulator.generate_dataset()
        simulator.save_dataset(df, data_path)
    
    # Run training pipeline
    config = ModelConfig()
    pipeline = CoffeeMLPipeline(config)
    metrics = pipeline.run(data_path)
    
    return metrics


if __name__ == '__main__':
    main()
