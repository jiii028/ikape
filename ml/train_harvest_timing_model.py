"""
Phase 3: Harvest Timing Prediction - Model Training Pipeline
Trains a Random Forest regressor to predict optimal harvest timing
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import warnings
warnings.filterwarnings('ignore')

# Try to import skl2onnx for ONNX export
try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    ONNX_AVAILABLE = True
except ImportError:
    print("WARNING: skl2onnx not installed. ONNX export will be skipped.")
    ONNX_AVAILABLE = False

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODEL_DIR = os.path.join(PROJECT_ROOT, 'ml_models')
OUTPUT_ONNX = os.path.join(MODEL_DIR, 'trained_harvest_timing_model.onnx')
OUTPUT_JOBLIB = os.path.join(MODEL_DIR, 'trained_harvest_timing_model.joblib')
METRICS_FILE = os.path.join(MODEL_DIR, 'harvest_timing_model_metrics.json')

# Dataset path
DATASET_PATH = os.path.join(PROJECT_ROOT, 'robusta_coffee_farm_dataset.csv')

# Feature configuration
NUMERICAL_FEATURES = [
    'plant_age_months', 'number_of_plants',
    'soil_ph', 'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
    'elevation_m', 'flowering_to_harvest_days'
]

CATEGORICAL_FEATURES = [
    'shade_tree_present', 'fertilizer_type', 'pesticide_type'
]


def load_and_prepare_data():
    """Load and prepare training data from the dataset"""
    print("Loading dataset...")
    
    if not os.path.exists(DATASET_PATH):
        print(f"ERROR: Dataset not found at {DATASET_PATH}")
        sys.exit(1)
    
    df = pd.read_csv(DATASET_PATH)
    print(f"Loaded {len(df)} records from dataset")
    
    # Map dataset columns to model features
    df['plant_age_months'] = df['Plant_Age_Months']
    df['number_of_plants'] = df['Tree_Count']
    df['fertilizer_type'] = df['Fertilizer_Type'].fillna('None')
    df['pesticide_type'] = df['Pesticide_Type'].fillna('None')
    df['shade_tree_present'] = df['Shade_Tree_Present'].map({'Yes': 1, 'No': 0})
    df['soil_ph'] = df['Soil_pH']
    df['avg_temp_c'] = df['Avg_Temp_C']
    df['avg_rainfall_mm'] = df['Avg_Rainfall_mm']
    df['avg_humidity_pct'] = df['Avg_Humidity_pct']
    df['elevation_m'] = df['Elevation_m']
    
    # Generate target variable: days from flowering to harvest
    # Coffee typically takes 120-150 days from flowering to harvest
    # This varies based on altitude, temperature, and other factors
    np.random.seed(42)
    
    # Base days + environmental factors
    base_days = 135  # average
    
    # Temperature affects maturity (warmer = faster)
    temp_effect = (25 - df['Avg_Temp_C']) * 2  # -2 days per degree above 25
    
    # Altitude effect (higher = slower)
    altitude_effect = (df['Elevation_m'] - 1000) / 100 * 3  # +3 days per 100m above 1000m
    
    # Humidity effect
    humidity_effect = (65 - df['Avg_Humidity_pct']) * 0.2  # slight effect
    
    # Random variation
    random_effect = np.random.normal(0, 8, len(df))
    
    df['flowering_to_harvest_days'] = (
        base_days + 
        temp_effect + 
        altitude_effect + 
        humidity_effect + 
        random_effect
    ).clip(100, 180).round()  # Clip to realistic range
    
    print(f"Generated target: flowering_to_harvest_days")
    print(f"  Range: {df['flowering_to_harvest_days'].min():.0f} - {df['flowering_to_harvest_days'].max():.0f} days")
    print(f"  Mean: {df['flowering_to_harvest_days'].mean():.1f} days")
    
    return df


def prepare_features(df):
    """Prepare feature matrix for training"""
    print("Preparing features...")
    
    feature_cols = NUMERICAL_FEATURES + CATEGORICAL_FEATURES
    
    # Encode categorical features
    label_encoders = {}
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        label_encoders[col] = le
        print(f"  {col}: {le.classes_}")
    
    # Fill missing values
    df[feature_cols] = df[feature_cols].fillna(0)
    
    X = df[feature_cols]
    y = df['flowering_to_harvest_days']
    
    return X, y, label_encoders


def train_model(X_train, y_train):
    """Train Random Forest with hyperparameter tuning"""
    print("\nTraining Random Forest regressor...")
    
    # Use a smaller parameter grid for faster training
    param_grid = {
        'n_estimators': [100, 150],
        'max_depth': [10, 15, 20],
        'min_samples_split': [2, 5],
        'min_samples_leaf': [1, 2]
    }
    
    # Base model
    rf = RandomForestRegressor(random_state=42, n_jobs=-1)
    
    # Grid search with cross-validation
    grid_search = GridSearchCV(
        rf, 
        param_grid,
        cv=5,
        scoring='neg_mean_absolute_error',
        n_jobs=-1,
        verbose=1
    )
    
    grid_search.fit(X_train, y_train)
    
    print(f"\nBest parameters: {grid_search.best_params_}")
    print(f"Best CV MAE: {abs(grid_search.best_score_):.2f} days")
    
    return grid_search.best_estimator_


def evaluate_model(model, X_test, y_test):
    """Evaluate model performance"""
    print("\nEvaluating model...")
    
    y_pred = model.predict(X_test)
    
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    
    print(f"\n=== Model Evaluation ===")
    print(f"MAE: {mae:.2f} days")
    print(f"RMSE: {rmse:.2f} days")
    print(f"R² Score: {r2:.3f}")
    
    # Error distribution
    errors = np.abs(y_test - y_pred)
    print(f"\nError Distribution:")
    print(f"  50th percentile (median): {np.median(errors):.1f} days")
    print(f"  90th percentile: {np.percentile(errors, 90):.1f} days")
    print(f"  95th percentile: {np.percentile(errors, 95):.1f} days")
    
    # Feature importance
    print("\nFeature Importances:")
    feature_importance = pd.DataFrame({
        'feature': X_test.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    for idx, row in feature_importance.iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")
    
    return {
        'mae': float(mae),
        'rmse': float(rmse),
        'r2_score': float(r2),
        'median_error': float(np.median(errors)),
        'p90_error': float(np.percentile(errors, 90)),
        'p95_error': float(np.percentile(errors, 95)),
        'feature_importance': feature_importance.to_dict('records')
    }


def export_to_onnx(model, feature_names, output_path):
    """Export model to ONNX format"""
    if not ONNX_AVAILABLE:
        print("SKIP: ONNX export not available (skl2onnx not installed)")
        return None
        
    print(f"\nExporting to ONNX format...")
    
    try:
        # Define input type
        initial_types = [('input', FloatTensorType([None, len(feature_names)]))]
        
        # Convert
        onnx_model = convert_sklearn(
            model,
            initial_types=initial_types,
            target_opset=12,
            options={'zipmap': False}
        )
        
        # Save
        with open(output_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        
        print(f"ONNX model saved to: {output_path}")
        return output_path
    except Exception as e:
        print(f"ERROR exporting to ONNX: {e}")
        return None


def save_model_artifacts(model, metrics, label_encoders):
    """Save model and metrics"""
    print("\nSaving model artifacts...")
    
    # Ensure model directory exists
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # Save joblib model with metadata
    model_data = {
        'model': model,
        'label_encoders': label_encoders,
        'numerical_features': NUMERICAL_FEATURES,
        'categorical_features': CATEGORICAL_FEATURES,
        'training_date': pd.Timestamp.now().isoformat(),
        'metrics': metrics,
        'target_variable': 'flowering_to_harvest_days',
        'target_unit': 'days'
    }
    
    joblib.dump(model_data, OUTPUT_JOBLIB)
    print(f"Joblib model saved to: {OUTPUT_JOBLIB}")
    
    # Save metrics
    with open(METRICS_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved to: {METRICS_FILE}")
    
    return OUTPUT_JOBLIB


def main():
    print("=" * 60)
    print("Phase 3: Harvest Timing Model Training")
    print("=" * 60)
    
    # Step 1: Load data
    df = load_and_prepare_data()
    
    # Step 2: Prepare features
    X, y, label_encoders = prepare_features(df)
    
    print(f"\nTraining set size: {len(X)}")
    
    # Step 3: Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"Train size: {len(X_train)}, Test size: {len(X_test)}")
    
    # Step 4: Train model
    model = train_model(X_train, y_train)
    
    # Step 5: Evaluate
    metrics = evaluate_model(model, X_test, y_test)
    
    # Step 6: Export to ONNX
    export_to_onnx(model, X.columns.tolist(), OUTPUT_ONNX)
    
    # Step 7: Save artifacts
    save_model_artifacts(model, metrics, label_encoders)
    
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print(f"\nModel file: {OUTPUT_JOBLIB}")
    if os.path.exists(OUTPUT_ONNX):
        print(f"ONNX file: {OUTPUT_ONNX}")
    print(f"Metrics: {METRICS_FILE}")
    
    print("\n=== Usage ===")
    print("Input features: plant_age_months, number_of_plants, soil_ph,")
    print("                avg_temp_c, avg_rainfall_mm, avg_humidity_pct,")
    print("                elevation_m, shade_tree_present, fertilizer_type,")
    print("                pesticide_type")
    print("Output: flowering_to_harvest_days (estimated days from flowering to harvest)")


if __name__ == '__main__':
    main()
